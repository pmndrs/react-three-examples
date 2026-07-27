/**
 * postprocessing-outline
 * R3F port of three.js `webgpu_postprocessing_outline`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_outline (~230 lines of JS)
 *
 * DEMONSTRATES
 * - `outline()` (three/addons OutlineNode) in `useRenderPipeline`: the node renders
 *   its own depth/mask/blur passes per frame, and exposes `visibleEdge`/`hiddenEdge`
 *   mask channels that the example composes into a custom outline color graph
 *   (`visibleEdge.mul(color).add(hiddenEdge.mul(color)).mul(strength)`) added on top
 *   of the scene pass
 * - The user-created-uniform dynamism pattern (c): all six outline knobs
 *   (edgeStrength/edgeGlow/edgeThickness/pulsePeriod/both edge colors) are three/tsl
 *   `uniform()` nodes built inside the mainCB — exactly as the original does —
 *   registered via return-to-register and mutated (`.value`) from an effect on leva
 *   changes; no rebuild, no fiber `useUniforms`
 * - Hover selection via R3F pointer events instead of a manual Raycaster: one
 *   `onPointerMove` on the subjects group (events bubble up from every descendant
 *   mesh, `e.object` is the hit), mutating the outline node's `selectedObjects`
 *   array IN PLACE — zero React re-renders, zero pipeline rebuilds
 * - A TSL pulse effect: `oscSine(time.div(period))` gated by
 *   `pulsePeriod.greaterThan(0).select(...)` — run-time branching with TSL `select`,
 *   not build-time JS `if`
 * - `OBJLoader` via fiber's `useLoader` + `Suspense`, with the model normalized from
 *   its bounding sphere and placed via JSX props (loader cache left unscaled)
 *
 * DIVERGENCE from original
 * - The manual `Raycaster` + `pointermove` listener is replaced with an R3F
 *   `onPointerMove` handler on the subjects group (precedent: compute-particles);
 *   like the original, hovering empty space KEEPS the last selection
 * - The torus starts SELECTED (the original starts with nothing outlined until the
 *   first hover) — the outline is this example's entire subject, so the first-load
 *   view should show it; the first hover takes over normally
 * - The `renderer.inspector.createParameters` GUI is replaced with leva (same six
 *   knobs, same ranges/defaults); `.toInspector('Color')` tag and
 *   `renderer.inspector` dropped — this repo doesn't wire the three.js Inspector
 * - OrbitControls replaced by the DemoHelpers camera-controls baseline with the
 *   original's limits (dolly 5–20, pan locked). Grid disabled — the original has its
 *   own shadow-catching floor plane at y = -1.5
 * - `renderer={{ toneMapping: NoToneMapping }}` pinned: the original renders with
 *   the WebGPURenderer default (NoToneMapping); fiber's Canvas would otherwise
 *   default to ACESFilmic and mute the pure-white outline color
 * - Canvas `shadows` uses fiber's default shadow map type instead of reproducing
 *   `PCFShadowMap` (same divergence as geometry-loft)
 * - The tree's normalization scale/position land as JSX props instead of mutating
 *   the loaded object (StrictMode-safe: `scale.divideScalar` would compound)
 */
import { Suspense, useRef } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import type { ThreeEvent } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { NoToneMapping } from 'three/webgpu'
import type { Object3D } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { OutlinePipeline } from './OutlinePipeline'
import { SphereCloud, Floor, Torus, Tree } from './Subjects'

export default function PostprocessingOutline() {
  const { edgeStrength, edgeGlow, edgeThickness, pulsePeriod, visibleEdgeColor, hiddenEdgeColor } =
    useControls('outline', {
      edgeStrength: { value: 3.0, min: 0.01, max: 10, step: 0.01 },
      edgeGlow: { value: 0.0, min: 0, max: 1, step: 0.01 },
      edgeThickness: { value: 1.0, min: 1, max: 4, step: 0.01 },
      pulsePeriod: { value: 0.0, min: 0, max: 5, step: 0.01 },
      visibleEdgeColor: '#ffffff',
      hiddenEdgeColor: '#4e3636',
    })

  // The outline node's selection list. A single stable array shared between the
  // pointer handler (writes) and the OutlineNode (reads it every frame) — mutated
  // in place so hover never re-renders React or rebuilds the pipeline.
  const selectionRef = useRef<Object3D[]>([])

  // Nearest intersection wins (events fire front-to-back; stopPropagation blocks
  // the objects behind it) — the R3F equivalent of the original's `intersects[0]`.
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const selection = selectionRef.current
    selection.length = 0
    selection.push(e.object)
  }

  return (
    <Canvas
      // Original renders with the WebGPURenderer default tone mapping (none) —
      // match it explicitly; fiber's Canvas default is ACESFilmic.
      renderer={{ toneMapping: NoToneMapping }}
      shadows
      background="#000000"
      camera={{ position: [0, 0, 8], fov: 45, near: 0.1, far: 100 }}
    >
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
            const mesh = g?.children[0]
            if (mesh && selectionRef.current.length === 0) selectionRef.current.push(mesh)
          }}
        >
          <Torus />
        </group>
      </group>

      <OutlinePipeline
        selectionRef={selectionRef}
        edgeStrength={edgeStrength}
        edgeGlow={edgeGlow}
        edgeThickness={edgeThickness}
        pulsePeriod={pulsePeriod}
        visibleEdgeColor={visibleEdgeColor}
        hiddenEdgeColor={hiddenEdgeColor}
      />

      <DemoHelpers grid={false} minDistance={5} maxDistance={20} pan={false} />
    </Canvas>
  )
}
