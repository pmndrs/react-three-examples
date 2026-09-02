/**
 * particles
 * A column of fire and smoke, drawn as two big sprite fields whose entire animation —
 * spawn offset, lifetime, scale, rotation, colour — is one static TSL graph.
 * Original: https://threejs.org/examples/#webgpu_particles
 *
 * DEMONSTRATES
 * - `range(min, max)` as the whole particle system: it hands each instance a stable
 *   random value (float or vec3) as a generated instanced attribute, so 3000 sprites
 *   animate off `time` alone — no compute pass, no storage buffer, no CPU per-frame work
 * - A plain `<mesh count={n}>` with a `SpriteNodeMaterial`: `count` turns any mesh into
 *   an instanced draw, and `positionNode`/`scaleNode`/`rotationNode` place each sprite
 * - One shared sub-graph feeding two materials — `lifeTime`, `opacityNode` and
 *   `scaleNode` node objects are literally reused by the smoke and the fire, which is
 *   why both fields breathe in sync
 * - `IndirectStorageBufferAttribute` + `geometry.setIndirect(…)`: the fire's draw
 *   arguments (index count, instance count, offsets) live in a GPU buffer, so a compute
 *   pass could rewrite the instance count without a CPU round-trip
 * - leva's `speed` slider driving a `useUniforms` node that the graph multiplies `time`
 *   by — the same single knob the original's Inspector panel exposes
 *
 * DIVERGENCE from original
 * - The fire's `colorNode` is `mix(color(0xb72f17), color(0xb72f17), life)` upstream —
 *   both endpoints are the same colour, so the mix is a no-op. Ported as the flat
 *   colour it evaluates to (AGENTS.md: verify dead code before porting it faithfully)
 * - `frustumCulled={false}` on both fields. Their `positionNode` throws sprites up to
 *   5 local units (2000 world units) off the mesh origin, but three sizes the culling
 *   sphere from the untouched 1x1 plane — the original pops whole fields out of view
 *   when you orbit. Latent upstream bug, fixed here
 */
import { useLayoutEffect, useRef } from 'react';
import { AdditiveBlending, IndirectStorageBufferAttribute, NoToneMapping, Vector3 } from 'three/webgpu';
import type { PlaneGeometry } from 'three/webgpu';
import { color, mix, positionLocal, range, rotateUV, texture, time, uv } from 'three/tsl';
import { Canvas, useLocalNodes, useTexture, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const SMOKE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/opengameart/smoke1.png';

const SMOKE_COUNT = 2000;
const FIRE_COUNT = 1000;

//* Particle fields ===============================================

// Both fields live here because they share half their node graph — splitting them
// would mean rebuilding `lifeTime`/`opacityNode`/`scaleNode` twice and losing the
// lockstep the original gets for free.
function FireAndSmoke() {
  const { speed } = useControls('particles', { speed: { value: 0.2, min: 0, max: 1, step: 0.01 } });
  const { uSpeed } = useUniforms({ uSpeed: speed });

  const map = useTexture(SMOKE_URL);

  const { smokeColorNode, smokeOpacityNode, smokePositionNode, scaleNode, firePositionNode, fireOpacityNode } =
    useLocalNodes(() => {
      // Per-instance randoms. `range()` reads the mesh's `count` at graph-build time and
      // allocates one instanced attribute per call — these five are the entire "system".
      const lifeRange = range(0.1, 1);
      const offsetRange = range(new Vector3(-2, 3, -2), new Vector3(2, 5, 2));
      const scaleRange = range(0.3, 2);
      const rotateRange = range(0.1, 4);

      const scaledTime = time.add(5).mul(uSpeed);
      // Each instance runs its own clock at its own rate, wrapped to 0..1.
      const lifeTime = scaledTime.mul(lifeRange).mod(1);
      const life = lifeTime.div(lifeRange);

      // Cheap stand-in for lighting: lower sprites (the base of the plume) read brighter.
      const fakeLightEffect = positionLocal.y.oneMinus().max(0.2);

      const textureNode = texture(map, rotateUV(uv(), scaledTime.mul(rotateRange)));
      const opacityNode = textureNode.a.mul(life.oneMinus());
      const smokeColor = mix(color('#2c1501'), color('#222222'), positionLocal.y.mul(3).clamp());

      return {
        // Ember orange for the first ~40% of a life, then soot.
        smokeColorNode: mix(color('#f27d0c'), smokeColor, life.mul(2.5).min(1)).mul(fakeLightEffect),
        smokeOpacityNode: opacityNode,
        smokePositionNode: offsetRange.mul(lifeTime),
        scaleNode: scaleRange.mul(lifeTime.max(0.3)),
        firePositionNode: range(new Vector3(-1, 1, -1), new Vector3(1, 2, 1)).mul(lifeTime),
        fireOpacityNode: opacityNode.mul(0.5),
      };
    });

  // The fire's draw call is issued from a GPU buffer instead of CPU-side arguments:
  // [indexCount, instanceCount, firstIndex, baseVertex, firstInstance].
  const fireGeometryRef = useRef<PlaneGeometry>(null);
  useLayoutEffect(() => {
    const geometry = fireGeometryRef.current;
    if (!geometry?.index) return;
    const args = new Uint32Array([geometry.index.array.length, FIRE_COUNT, 0, 0, 0]);
    geometry.setIndirect(new IndirectStorageBufferAttribute(args, 5));
    return () => void geometry.setIndirect(null);
  }, []);

  return (
    <>
      <mesh count={SMOKE_COUNT} scale={400} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <spriteNodeMaterial
          colorNode={smokeColorNode}
          opacityNode={smokeOpacityNode}
          positionNode={smokePositionNode}
          scaleNode={scaleNode}
          depthWrite={false}
        />
      </mesh>

      <mesh count={FIRE_COUNT} scale={400} position={[0, -100, 0]} renderOrder={1} frustumCulled={false}>
        <planeGeometry ref={fireGeometryRef} args={[1, 1]} />
        <spriteNodeMaterial
          colorNode={color('#b72f17')}
          opacityNode={fireOpacityNode}
          positionNode={firePositionNode}
          scaleNode={scaleNode}
          blending={AdditiveBlending}
          transparent
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

export default function Particles() {
  return (
    <Canvas
      // The original never sets a tone mapping — WebGPURenderer's default is none.
      renderer={{ toneMapping: NoToneMapping }}
      background="#333333"
      camera={{ position: [1300, 500, 0], fov: 60, near: 1, far: 5000 }}>
      <FireAndSmoke />
      {/* The original's own GridHelper, kept — DemoHelpers' infinite grid is metre-scale
          and this scene is thousands of units across. */}
      <gridHelper args={[3000, 40, '#444444', '#444444']} position={[0, -75, 0]} />
      <DemoHelpers grid={false} target={[0, 500, 0]} maxDistance={2700} />
    </Canvas>
  );
}
