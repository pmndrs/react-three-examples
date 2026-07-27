/**
 * tsl-halftone
 * R3F port of three.js `webgpu_tsl_halftone`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_tsl_halftone (~277 lines of JS)
 *
 * DEMONSTRATES
 * - A reusable TSL `Fn` (`halftoneLayer`, in halftoneEffect.ts) implementing a
 *   screen-space halftone dot grid gated by how much the surface normal faces a light
 *   `direction` — built once, then composited fresh against each material's own
 *   `output` node
 * - `NodeMaterial.outputNode` overriding a standard PBR shading result (`output`)
 *   directly on the material — a full-scene effect with no `useRenderPipeline` pass,
 *   since it only needs the current fragment's own shaded color, not neighboring texels
 * - fiber's `useUniforms` batch hook feeding two independently-configured halftone
 *   layers live from leva, memoized against the returned uniform-NODE identities (not
 *   their `.value`s) so a leva tweak mutates the GPU-side uniform without rebuilding the
 *   `outputNode` graph or recompiling the shader
 * - One layer's dot-grid direction animated every frame directly on the uniform's
 *   `.value` (`state.elapsed`-driven), independent of React re-renders — the
 *   build-time-vs-run-time TSL split in practice
 * - The same halftone composite applied to three different materials (two primitives
 *   with a memoized-per-mesh declarative `outputNode` prop, plus every mesh material
 *   inside a loaded GLTF) to show the effect composes with a model's existing PBR
 *   shading instead of replacing it
 *
 * DIVERGENCE from original
 * - dat.gui + `renderer.inspector` replaced with leva; the two dot layers get their own
 *   leva groups (`tsl-halftone-purple` / `tsl-halftone-cyan`) instead of dat.gui
 *   subfolders keyed by array index
 * - The cyan layer's animated x/y direction components aren't exposed as leva sliders
 *   (a per-frame write overwrites them anyway); only its z component and the rest of its
 *   parameters are controllable — same live values as the original's `.listen()` fields,
 *   minus a pointless editable-yet-overwritten control
 * - `outputNode` is assigned via a memoized JSX prop for the two primitives
 *   (declarative) instead of the original's one-shot imperative assignment at init; the
 *   GLTF meshes still get it imperatively in an effect since that mesh list is only
 *   known once the model finishes loading
 * - DemoHelpers baseline (grid + camera-controls orbit, distance-limited to match the
 *   original's OrbitControls `minDistance`/`maxDistance`) added; the original is a fixed
 *   black void with no ground reference
 * - `THREE.Timer` dropped — `useFrame`'s `state.elapsed` (seconds) drives the animated
 *   direction instead
 * - Split into a folder (this file + HalftoneScene.tsx + halftoneEffect.ts +
 *   HalftonePrimitives.tsx + HalftoneMichelle.tsx): the single-file port ran ~260 lines,
 *   over the corpus's ~200-line threshold — split by scene role (uniform/frame wiring /
 *   TSL effect graph / primitive shapes / loaded model). This file only calls leva's
 *   `useControls` (plain React state, works anywhere); `useUniforms`/`useFrame` need the
 *   R3F reconciler context, so they — and everything downstream of them — live in
 *   HalftoneScene.tsx, rendered as a child of `<Canvas>`, not in this component
 */
import { Canvas } from '@react-three/fiber/webgpu'
import { folder, useControls } from 'leva'
import { HalftoneScene } from './HalftoneScene'

export default function TslHalftone() {
  const { ambientIntensity, directionalIntensity, materialColor } = useControls('tsl-halftone', {
    lights: folder({
      ambientIntensity: { value: 3, min: 0, max: 10, step: 0.001 },
      directionalIntensity: { value: 8, min: 0, max: 20, step: 0.001 },
    }),
    material: folder({
      materialColor: { value: '#ff622e', label: 'color' },
    }),
  })

  const purpleControls = useControls('tsl-halftone-purple', {
    count: { value: 140, min: 1, max: 200, step: 1 },
    color: '#fb00ff',
    direction: { value: { x: -0.4, y: -1, z: 0.5 }, step: 0.01 },
    start: { value: 1, min: -1, max: 1, step: 0.01 },
    end: { value: 0, min: -1, max: 1, step: 0.01 },
    mixLow: { value: 0, min: 0, max: 1, step: 0.01 },
    mixHigh: { value: 0.5, min: 0, max: 1, step: 0.01 },
    radius: { value: 0.8, min: 0, max: 1, step: 0.01 },
  })

  const cyanControls = useControls('tsl-halftone-cyan', {
    count: { value: 180, min: 1, max: 200, step: 1 },
    color: '#94ffd1',
    directionZ: { value: -0.2, min: -1, max: 1, step: 0.01, label: 'direction z' },
    start: { value: 0.55, min: -1, max: 1, step: 0.01 },
    end: { value: 0.2, min: -1, max: 1, step: 0.01 },
    mixLow: { value: 0.5, min: 0, max: 1, step: 0.01 },
    mixHigh: { value: 1, min: 0, max: 1, step: 0.01 },
    radius: { value: 0.8, min: 0, max: 1, step: 0.01 },
  })

  return (
    <Canvas renderer background="#000000" camera={{ position: [6, 3, 10], fov: 25, near: 0.1, far: 100 }}>
      <HalftoneScene
        ambientIntensity={ambientIntensity}
        directionalIntensity={directionalIntensity}
        materialColor={materialColor}
        purpleControls={purpleControls}
        cyanControls={cyanControls}
      />
    </Canvas>
  )
}
