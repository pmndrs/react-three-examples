/**
 * postprocessing-outline
 * A tree, a cloud of colored spheres, and a torus — hover any of them to move the
 * glowing outline. The outline is drawn entirely in post, not a duplicated mesh.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_outline
 *
 * DEMONSTRATES
 * - `outline()` (three/addons OutlineNode): renders its own depth/mask/blur passes
 *   per frame and exposes `visibleEdge`/`hiddenEdge` masks composed into a custom
 *   outline color, added on top of the scene pass
 * - Hover selection via R3F pointer events instead of a manual Raycaster: one
 *   `onPointerMove` on the subjects group (events bubble from every descendant
 *   mesh), mutating the outline node's `selectedObjects` array IN PLACE — zero
 *   React re-renders, zero pipeline rebuilds
 * - A TSL pulse effect: `oscSine` gated by `pulsePeriod.greaterThan(0).select(...)`
 *   — run-time branching with TSL `select`, not build-time JS `if`
 * - `OBJLoader` via fiber's `useLoader` + `Suspense`, normalized from its bounding
 *   sphere and placed via JSX props
 *
 * DIVERGENCE from original
 * - The torus starts SELECTED (the original starts with nothing outlined until the
 *   first hover) — the outline is this example's entire subject, so the first-load
 *   view should show it; the first hover takes over normally
 */
import { Suspense, useRef } from 'react';
import { NoToneMapping } from 'three/webgpu';
import type { Object3D } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import type { ThreeEvent } from '@react-three/fiber/webgpu';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { OutlinePipeline } from './OutlinePipeline';
import { SphereCloud, Floor, Torus, Tree } from './Subjects';

export default function PostprocessingOutline() {
  // The outline node's selection list. A single stable array shared between the
  // pointer handler (writes) and the OutlineNode (reads it every frame) — mutated
  // in place so hover never re-renders React or rebuilds the pipeline.
  const selectionRef = useRef<Object3D[]>([]);

  // Nearest intersection wins (events fire front-to-back; stopPropagation blocks
  // the objects behind it) — the R3F equivalent of the original's `intersects[0]`.
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const selection = selectionRef.current;
    selection.length = 0;
    selection.push(e.object);
  };

  return (
    <Canvas
      // Original renders with the WebGPURenderer default tone mapping (none) —
      // match it explicitly; fiber's Canvas default is ACESFilmic.
      renderer={{ toneMapping: NoToneMapping }}
      shadows
      background="#000000"
      camera={{ position: [0, 0, 8], fov: 45, near: 0.1, far: 100 }}>
      <ambientLight color="#aaaaaa" intensity={0.6} />
      <directionalLight
        color="#ddffdd"
        intensity={2}
        position={[5, 5, 5]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-far={25}
      />

      {/* Everything inside is hover-selectable — the group-level handler receives
          bubbled pointer events from every descendant mesh, tree included. */}
      <group onPointerMove={onPointerMove}>
        <Suspense fallback={null}>
          <Tree />
        </Suspense>
        <SphereCloud />
        <Floor />
        {/* Seed the torus as the initial selection so the outline is visible
            before the first hover (see DIVERGENCE) — first hover takes over. */}
        <group
          ref={(g) => {
            const mesh = g?.children[0];
            if (mesh && selectionRef.current.length === 0) selectionRef.current.push(mesh);
          }}>
          <Torus />
        </group>
      </group>

      <OutlinePipeline selectionRef={selectionRef} />

      <DemoHelpers grid={false} minDistance={5} maxDistance={20} pan={false} />
    </Canvas>
  );
}
