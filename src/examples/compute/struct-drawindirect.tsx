/**
 * struct-drawindirect
 * 100,000 tiny triangles tumbling on a breathing sphere. Nothing on the CPU decides
 * how many of them get drawn — a compute pass writes the draw call's own arguments
 * into a GPU buffer every frame, and the instance count pulses from 100 back up to
 * (past, in fact) the whole set.
 * Original: https://threejs.org/examples/#webgpu_struct_drawindirect
 *
 * DEMONSTRATES
 * - GPU-driven rendering: an `IndirectStorageBufferAttribute` handed to
 *   `geometry.setIndirect()` IS the draw call — `[vertexCount, instanceCount,
 *   firstVertex, firstInstance, offset]` — and a kernel rewrites it each frame
 * - The same attribute viewed as a `struct()` storage buffer, so the kernel writes
 *   `drawArgs.get('instanceCount')` by name instead of by array index
 * - Why that attribute belongs in `useBuffers` and not a lazy `useState`: StrictMode
 *   double-invokes the initializer, a create-once hook keeps the FIRST instance while
 *   the component commits the SECOND, and an indirect buffer that diverges reaches
 *   the draw with no GPU buffer behind it
 * - `<instancedBufferGeometry>` + `<instancedBufferAttribute>` in JSX, read back in
 *   TSL with `attribute('orientationStart')` and friends
 * - `varyingProperty()` carrying the swirled position from `positionNode` into
 *   `fragmentNode`, the two halves of one hand-written material
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { DoubleSide, IndirectStorageBufferAttribute, NoToneMapping, Vector4 } from 'three/webgpu';
import type { InstancedBufferGeometry, Node } from 'three/webgpu';
import {
  abs,
  atomicStore,
  attribute,
  cross,
  Fn,
  max,
  mix,
  normalize,
  pow,
  sin,
  storage,
  struct,
  time,
  uint,
  varyingProperty,
  vec4,
} from 'three/tsl';
import { Canvas, useBuffers, useFrame, useNodes, useThree } from '@react-three/fiber/webgpu';

import { DemoHelpers } from '../../utils/DemoHelpers';

const INSTANCES = 100_000;

// The one triangle every instance draws, 2.5cm across.
const TRIANGLE = new Float32Array([0.025, -0.025, 0, -0.025, 0.025, 0, 0, 0, 0.025]);

//* Scene =========================================================

function IndirectTriangles() {
  const renderer = useThree((state) => state.renderer);
  const geometryRef = useRef<InstancedBufferGeometry>(null);

  // Per-instance scatter, colour and the two quaternions each triangle tumbles
  // between. Plain CPU arrays, handed to the JSX attributes below.
  const { offsets, colors, orientationsStart, orientationsEnd } = useMemo(() => {
    const offsets = new Float32Array(INSTANCES * 3);
    const colors = new Float32Array(INSTANCES * 4);
    const orientationsStart = new Float32Array(INSTANCES * 4);
    const orientationsEnd = new Float32Array(INSTANCES * 4);
    const quaternion = new Vector4();

    const randomQuaternion = (target: Float32Array, i: number) => {
      quaternion.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      quaternion.normalize();
      target.set([quaternion.x, quaternion.y, quaternion.z, quaternion.w], i * 4);
    };

    for (let i = 0; i < INSTANCES; i++) {
      offsets.set([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5], i * 3);
      colors.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
      randomQuaternion(orientationsStart, i);
      randomQuaternion(orientationsEnd, i);
    }

    return { offsets, colors, orientationsStart, orientationsEnd };
  }, []);

  // The draw call itself, as five uints on the GPU. `useBuffers`, never a lazy
  // useState — see the header.
  const { drawBuffer } = useBuffers(() => ({
    drawBuffer: new IndirectStorageBufferAttribute(new Uint32Array(5), 5),
  }));

  const { seedDrawArgs, pulseInstanceCount, positionNode, fragmentNode } = useNodes(() => {
    // The same five uints, named. `instanceCount` is declared atomic because that is
    // the field the pulse kernel writes from every thread at once.
    const drawArgs = storage(
      drawBuffer,
      struct(
        {
          vertexCount: 'uint',
          instanceCount: { type: 'uint', atomic: true },
          firstVertex: 'uint',
          firstInstance: 'uint',
          offset: 'uint',
        },
        'DrawBuffer',
      ),
      drawBuffer.count,
    );

    // Cast: struct member access types as a bare `Node`, which has no `.assign()` —
    // the typed-TSL struct gap (AGENTS.md B10/B11 cast family), same as compute-water.
    const member = (name: string) => drawArgs.get(name) as unknown as Node<'uint'>;

    // 0 -> 1 -> 0, quartic so the count spends most of its time low.
    const halfTime = sin(time.mul(0.5));

    // Named varyings, so the vertex and fragment halves below can be written as two
    // independent graphs rather than one that returns a struct.
    const vPosition = varyingProperty('vec3', 'vPosition');
    const vColor = varyingProperty('vec4', 'vColor');

    return {
      // Fixed fields + a zeroed count, rewritten every frame before the pulse.
      seedDrawArgs: Fn(() => {
        member('vertexCount').assign(3);
        atomicStore(member('instanceCount'), uint(0));
        member('firstVertex').assign(0);
        member('firstInstance').assign(0);
        member('offset').assign(0);
      })().compute(1),

      // How many triangles this frame's draw call will issue. Two things the original
      // does that are worth seeing rather than tidying away: the quartic peaks at
      // 16x INSTANCES, so the draw briefly asks for more instances than the attributes
      // hold (WebGPU's robust buffer access hands those lanes zeros), and every one of
      // the INSTANCES threads stores the same number to the same address.
      pulseInstanceCount: Fn(() => {
        atomicStore(member('instanceCount'), max(pow(halfTime.add(1), 4).mul(INSTANCES), 100));
      })().compute(INSTANCES),

      // Each triangle rides a quaternion slerped between its two random orientations,
      // pushed in and out along its offset as the sphere breathes.
      positionNode: Fn(() => {
        // three still infers each attribute's type off the geometry at graph-build
        // time, exactly as in the original — but `attribute()`'s type parameter doesn't
        // infer (AGENTS.md: same family as `uniformArray<'vec3'>`), so it's named here.
        const offset = attribute<'vec3'>('offset');
        const orientationStart = attribute<'vec4'>('orientationStart');
        const orientationEnd = attribute<'vec4'>('orientationEnd');

        // Slowed (-1..1) mapped to a (0.5..3) radius scale.
        const oscillation = max(abs(halfTime.mul(2).add(1)), 0.5);
        const swollen = offset.mul(oscillation).add(attribute<'vec3'>('position')).toVar();

        // Quaternion rotation the long way round: v + 2w(q x v) + 2(q x (q x v)).
        const orientation = normalize(mix(orientationStart, orientationEnd, halfTime));
        const qv = cross(orientation.xyz, swollen);
        const qqv = cross(orientation.xyz, qv);

        vPosition.assign(qv.mul(orientation.w.mul(2)).add(qqv.mul(2).add(swollen)));
        vColor.assign(attribute<'vec4'>('color'));

        return vPosition;
      })(),

      // A travelling red ripple over the per-instance colour.
      fragmentNode: Fn(() => {
        const rippled = vec4(vColor).toVar();
        rippled.r.addAssign(sin(vPosition.x.mul(10).add(time)).mul(0.5));
        return rippled;
      })(),
    };
  });

  // The mesh geometry's draw arguments live in `drawBuffer` from here on. Layout
  // effect: the first render must already be reading them.
  useLayoutEffect(() => {
    const geometry = geometryRef.current;
    if (!geometry) return;
    geometry.setIndirect(drawBuffer);
    return () => void geometry.setIndirect(null);
  }, [drawBuffer]);

  // Reset then repopulate, ahead of the render that consumes them. The original
  // dispatches these AFTER its render, so its draw always runs a frame behind.
  useFrame(
    () => {
      renderer.compute(seedDrawArgs);
      renderer.compute(pulseInstanceCount);
    },
    { phase: 'update' },
  );

  return (
    // frustumCulled: the culling sphere comes from the CPU-side position attribute —
    // one 2.5cm triangle at the origin — while positionNode spreads the instances over
    // a sphere 3 units across. The original has this latent bug; it only shows when
    // you orbit in close.
    <mesh frustumCulled={false}>
      <instancedBufferGeometry ref={geometryRef} instanceCount={INSTANCES}>
        <bufferAttribute attach="attributes-position" args={[TRIANGLE, 3]} />
        <instancedBufferAttribute attach="attributes-offset" args={[offsets, 3]} />
        <instancedBufferAttribute attach="attributes-color" args={[colors, 4]} />
        <instancedBufferAttribute attach="attributes-orientationStart" args={[orientationsStart, 4]} />
        <instancedBufferAttribute attach="attributes-orientationEnd" args={[orientationsEnd, 4]} />
      </instancedBufferGeometry>
      <meshBasicNodeMaterial
        positionNode={positionNode}
        fragmentNode={fragmentNode}
        side={DoubleSide}
        forceSinglePass
        transparent
      />
    </mesh>
  );
}

export default function StructDrawIndirect() {
  return (
    <Canvas
      // The original never sets a tone mapping (WebGPURenderer's default).
      renderer={{ toneMapping: NoToneMapping }}
      background="#00001f"
      camera={{ position: [1, 1, 1], fov: 50, near: 0.1, far: 10000 }}>
      <IndirectTriangles />
      <DemoHelpers grid={false} />
    </Canvas>
  );
}
