/**
 * clipping-stencil
 * A torus knot sliced by three clip planes — but instead of a hollow cross-section, the
 * cut faces read as solid pink caps. The stencil buffer is what fills them in.
 * Original: https://threejs.org/examples/#webgl_clipping_stencil
 *
 * DEMONSTRATES
 * - The stencil "cap fill" trick: two invisible passes over the SAME geometry (back
 *   faces incrementing, front faces decrementing the stencil count, both clipped by one
 *   plane) leave a non-zero count exactly where the solid was cut open. A plane mesh then
 *   draws only where that count is non-zero, and resets it via `stencilZPass={ReplaceOp}`
 * - `<clippingGroup>`, not `material.clippingPlanes` — the new WebGPU node renderer reads
 *   clip planes from a `ClippingGroup` ancestor in the scene graph; the material property
 *   the original sets is a legacy WebGLRenderer/WebGLClipping field the WebGPU backend
 *   never reads (`ClippingContext.js` only ever looks at `clippingGroup.clippingPlanes`)
 * - `renderer={{ stencil: true }}` — the stencil attachment is a construction-time
 *   renderer parameter, so it has to be requested up front, like a WebGL context flag
 * - Node materials expose the full stencil surface (`stencilFunc`, `stencilFail`,
 *   `stencilZFail`, `stencilZPass`, `stencilRef`) as plain props — no GLSL, and the WebGPU
 *   backend maps them straight onto the pipeline's depth-stencil state
 * - `mesh.onAfterRender` as a JSX prop: it isn't in fiber's pointer-event regex, so it
 *   reaches the mesh as a plain assignment — no ref needed to clear the stencil per cap
 * - leva write-back (function form) for "negate this plane": flipping the checkbox calls
 *   `plane.negate()` and resyncs the constant slider to match, mirroring the original's
 *   dat.gui `.onChange`
 * - One `TorusKnotGeometry` shared by the three stencil-writing pairs and the visible
 *   solid (7 meshes) — `useMemo` + a `geometry` prop, the documented exception to "JSX
 *   child creates its own instance" for real sharing
 *
 * DIVERGENCE from original
 * - Drops `renderer.localClippingEnabled`. That flag exists only on the legacy
 *   WebGLRenderer/WebGLClipping path (verified: absent from every WebGPU/common renderer
 *   source file) — a no-op on this renderer, dead code by the letter of AGENTS.md's
 *   "verify before porting faithfully".
 * - The cap plane and its stencil-writing pair stay OUTSIDE / INSIDE the spinning group
 *   exactly like the original's `poGroup` (scene-attached, world-fixed) vs `object`
 *   (rotates) — easy to blur into one component since both are "this plane's stuff", but
 *   they render from separate trees below for that reason.
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  AlwaysStencilFunc,
  BackSide,
  DecrementWrapStencilOp,
  DoubleSide,
  FrontSide,
  IncrementWrapStencilOp,
  NotEqualStencilFunc,
  Plane,
  ReplaceStencilOp,
  TorusKnotGeometry,
  Vector3,
} from 'three/webgpu';
import type { BufferGeometry, Group, Mesh } from 'three/webgpu';
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu';
import { folder, useControls } from 'leva';

import { DemoHelpers } from '../../utils/DemoHelpers';

// Three fixed, always-present clip planes — not a repeated-instance array, so three
// named leva folders (matching the original's three dat.gui folders) rather than one
// dynamically-keyed control per plane.
const AXES = [
  { key: 'planeX', normal: new Vector3(-1, 0, 0) },
  { key: 'planeY', normal: new Vector3(0, -1, 0) },
  { key: 'planeZ', normal: new Vector3(0, 0, -1) },
] as const;

//* Stencil-writing pair (rotates with the knot) ====================

interface StencilGroupProps {
  torusGeometry: BufferGeometry;
  plane: Plane;
  renderOrder: number;
}

// Invisible increment/decrement pair over the torus knot, clipped by this ONE plane —
// leaves a non-zero stencil count exactly where the knot was cut open.
function StencilGroup({ torusGeometry, plane, renderOrder }: StencilGroupProps) {
  const clipByThis = useMemo(() => [plane], [plane]);
  return (
    <clippingGroup clippingPlanes={clipByThis}>
      <mesh geometry={torusGeometry} renderOrder={renderOrder}>
        <meshBasicNodeMaterial
          side={BackSide}
          depthWrite={false}
          depthTest={false}
          colorWrite={false}
          stencilWrite
          stencilFunc={AlwaysStencilFunc}
          stencilFail={IncrementWrapStencilOp}
          stencilZFail={IncrementWrapStencilOp}
          stencilZPass={IncrementWrapStencilOp}
        />
      </mesh>
      <mesh geometry={torusGeometry} renderOrder={renderOrder}>
        <meshBasicNodeMaterial
          side={FrontSide}
          depthWrite={false}
          depthTest={false}
          colorWrite={false}
          stencilWrite
          stencilFunc={AlwaysStencilFunc}
          stencilFail={DecrementWrapStencilOp}
          stencilZFail={DecrementWrapStencilOp}
          stencilZPass={DecrementWrapStencilOp}
        />
      </mesh>
    </clippingGroup>
  );
}

//* Cap plane (world-fixed, tracks the plane) ========================

interface CapProps {
  plane: Plane;
  otherPlanes: Plane[];
  renderOrder: number;
  displayHelper: boolean;
}

// The visible pink fill: clipped by the OTHER two planes, painted only where the
// stencil count left by this plane's StencilGroup is non-zero, then reset to 0. Tracks
// the plane's world position/orientation every frame — cheap, and the original
// recomputes it unconditionally too.
function Cap({ plane, otherPlanes, renderOrder, displayHelper }: CapProps) {
  const renderer = useThree((state) => state.renderer);
  const capRef = useRef<Mesh>(null);

  useFrame(() => {
    const cap = capRef.current!;
    plane.coplanarPoint(cap.position);
    cap.lookAt(cap.position.x - plane.normal.x, cap.position.y - plane.normal.y, cap.position.z - plane.normal.z);
  });

  return (
    <>
      <clippingGroup clippingPlanes={otherPlanes}>
        <mesh ref={capRef} renderOrder={renderOrder + 0.1} onAfterRender={() => renderer.clearStencil()}>
          <planeGeometry args={[4, 4]} />
          <meshStandardNodeMaterial
            color="#e91e63"
            metalness={0.1}
            roughness={0.75}
            stencilWrite
            stencilRef={0}
            stencilFunc={NotEqualStencilFunc}
            stencilFail={ReplaceStencilOp}
            stencilZFail={ReplaceStencilOp}
            stencilZPass={ReplaceStencilOp}
          />
        </mesh>
      </clippingGroup>
      <planeHelper visible={displayHelper} args={[plane, 2, '#ffffff']} />
    </>
  );
}

//* Scene ============================================================

function ClippingStencilScene() {
  const [{ animate, planeXHelper, planeXConstant, planeYHelper, planeYConstant, planeZHelper, planeZConstant }, set] =
    useControls('Clipping', () => ({
      animate: true,
      planeX: folder({
        planeXHelper: { value: false, label: 'displayHelper' },
        planeXConstant: { value: 0, min: -1, max: 1, label: 'constant' },
        planeXNegated: {
          value: false,
          label: 'negated',
          onChange: (_value, _path, { initial }) => {
            if (initial) return;
            planes[0].negate();
            set({ planeXConstant: planes[0].constant });
          },
        },
      }),
      planeY: folder({
        planeYHelper: { value: false, label: 'displayHelper' },
        planeYConstant: { value: 0, min: -1, max: 1, label: 'constant' },
        planeYNegated: {
          value: false,
          label: 'negated',
          onChange: (_value, _path, { initial }) => {
            if (initial) return;
            planes[1].negate();
            set({ planeYConstant: planes[1].constant });
          },
        },
      }),
      planeZ: folder({
        planeZHelper: { value: false, label: 'displayHelper' },
        planeZConstant: { value: 0, min: -1, max: 1, label: 'constant' },
        planeZNegated: {
          value: false,
          label: 'negated',
          onChange: (_value, _path, { initial }) => {
            if (initial) return;
            planes[2].negate();
            set({ planeZConstant: planes[2].constant });
          },
        },
      }),
    }));

  // Plain three.js Plane instances, mutated in place — every ClippingGroup below reads
  // the SAME objects every frame, and Plane has no reactive JSX representation.
  const planes = useMemo(() => AXES.map(({ normal }) => new Plane(normal.clone(), 0)), []);

  useEffect(() => {
    planes[0].constant = planeXConstant;
  }, [planes, planeXConstant]);
  useEffect(() => {
    planes[1].constant = planeYConstant;
  }, [planes, planeYConstant]);
  useEffect(() => {
    planes[2].constant = planeZConstant;
  }, [planes, planeZConstant]);

  // REVIEW(shared-instance): one TorusKnotGeometry across 7 meshes (3 stencil pairs +
  // the visible solid) — a JSX child would create 7. Real sharing, per rule 3.
  const geometry = useMemo(() => new TorusKnotGeometry(0.4, 0.15, 220, 60), []);

  const solidClipPlanes = useMemo(() => [...planes], [planes]);

  const groupRef = useRef<Group>(null);
  useFrame(({ delta }) => {
    if (!animate) return;
    const group = groupRef.current!;
    group.rotation.x += delta * 0.5;
    group.rotation.y += delta * 0.2;
  });

  const helpers = [planeXHelper, planeYHelper, planeZHelper];

  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight
        intensity={3}
        position={[5, 10, 7.5]}
        castShadow
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={2}
        shadow-camera-bottom={-2}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      {/* Rotates: the invisible stencil-writing pairs, and the visible cut solid. */}
      <group ref={groupRef}>
        {planes.map((plane, i) => (
          <StencilGroup key={AXES[i].key} torusGeometry={geometry} plane={plane} renderOrder={i + 1} />
        ))}
        <clippingGroup clippingPlanes={solidClipPlanes} clipShadows>
          <mesh geometry={geometry} renderOrder={6} castShadow>
            <meshStandardNodeMaterial color="#ffc107" metalness={0.1} roughness={0.75} shadowSide={DoubleSide} />
          </mesh>
        </clippingGroup>
      </group>

      {/* World-fixed: the three pink caps, each tracking its own plane. */}
      {planes.map((plane, i) => (
        <Cap
          key={AXES[i].key}
          plane={plane}
          otherPlanes={planes.filter((p) => p !== plane)}
          renderOrder={i + 1}
          displayHelper={helpers[i]}
        />
      ))}

      <mesh rotation-x={-Math.PI / 2} position-y={-1} receiveShadow>
        <planeGeometry args={[9, 9]} />
        <shadowMaterial color="#000000" opacity={0.25} side={DoubleSide} />
      </mesh>
    </>
  );
}

export default function ClippingStencil() {
  return (
    <Canvas
      renderer={{ stencil: true }}
      shadows
      background="#263238"
      camera={{ position: [2, 2, 2], fov: 36, near: 1, far: 100 }}>
      <ClippingStencilScene />
      <DemoHelpers minDistance={2} maxDistance={20} />
    </Canvas>
  );
}
