/**
 * backdrop
 * R3F port of three.js `webgpu_backdrop`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_backdrop (~130 lines of JS)
 *
 * DEMONSTRATES
 * - `viewportSharedTexture()` — sampling the renderer's own in-progress frame — fed
 *   through eight different TSL color-grading graphs (`hue`, channel inversion,
 *   `grayscale`, `saturation` blended via `backdropAlphaNode`, `blendOverlay` with a
 *   `checker` pattern, and two `viewportSafeUV(screenUV...floor...)` pixelation grids)
 *   into `MeshStandardNodeMaterial.backdropNode`/`backdropAlphaNode` — the same
 *   backdrop escape hatch as `refraction.tsx`'s single window, here composed into a
 *   gallery of simultaneous grading effects on one shared "portal" geometry (Portals.tsx)
 * - `scene.backgroundNode` — a `screenUV.y`-driven sky gradient (cast pattern, same gap
 *   as `reflection.tsx`'s `SceneBackground`)
 * - `material.outputNode` overriding a loaded GLTF's PBR shading with an
 *   `oscSine`/`posterize` pulse (same full-scene-effect-with-no-pipeline-pass pattern as
 *   `tsl-halftone`'s `HalftoneMichelle.tsx`, a much smaller graph) (Michelle.tsx)
 * - Escape hatch: a `SpotLight` attached to the camera via `camera.add()` (no
 *   declarative "light as camera child" in R3F — same pattern as
 *   `skinning-instancing`'s `CameraLight`, swapped to a spotlight) (SceneSetup.tsx)
 * - Escape hatch: the portal ring's auto-rotation pausing while the user drags the
 *   camera, wired through the `controlsRef` escape hatch and camera-controls' own
 *   `controlstart`/`controlend` events (the library's OrbitControls-compatible
 *   equivalent of the original's `controls.addEventListener('start'/'end', ...)`)
 *
 * DIVERGENCE from original
 * - The `outputNode` pulse is applied to every mesh in Michelle.glb, not just
 *   `object.children[0].children[0]` as in the original — same simplification as
 *   `tsl-halftone`'s `HalftoneMichelle.tsx` (the mesh list is only known once the model
 *   loads; traversing all of them is simpler than replicating the original's specific
 *   child-index reach and looks the same on this model)
 * - `rotateSpeed` (portal ring auto-rotation) exposed via leva, default 0.5 matches the
 *   original's hardcoded `delta * 0.5`
 * - `antialias: false` / `NeutralToneMapping` / `toneMappingExposure: 0.3` set via the
 *   `<Canvas renderer={{ ... }}>` prop (Layer 1 rule) instead of imperative
 *   `renderer.toneMapping` assignment
 * - DemoHelpers baseline (grid + camera-controls orbit) added; target `(0, 1, 0)`
 *   matches the original's `camera.lookAt`/`controls.target`. The original has no
 *   ground plane at all (just the sky-gradient background) — the grid is purely
 *   additive scale reference, not present in the source
 * - `renderer.inspector` dropped — this repo doesn't wire the Inspector RootState slot
 *   yet (same gap noted in `refraction`/`reflection`/`postprocessing-bloom-emissive`)
 * - Split into a folder (this file + SceneSetup.tsx + Michelle.tsx + Portals.tsx): the
 *   single-file port ran over the corpus's ~200-line threshold — split by scene role
 *   (background/camera-light fixtures / loaded character / backdrop ring), same
 *   rationale as `tsl-halftone`'s split
 */
import { Suspense, useCallback, useRef } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import type CameraControlsImpl from 'camera-controls'
import { NeutralToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { CameraLight, SceneBackground } from './SceneSetup'
import { Michelle } from './Michelle'
import { Portals } from './Portals'

export default function Backdrop() {
  const { rotateSpeed } = useControls('backdrop', {
    rotateSpeed: { value: 0.5, min: 0, max: 2, step: 0.05 },
  })

  // Pausing the portal ring's auto-rotation while the user drags the camera — the
  // callback ref fires once camera-controls' instance is available (React 19 callback
  // refs support a cleanup return, so both subscribe and unsubscribe live here).
  const rotatingRef = useRef(true)
  const setControls = useCallback((instance: CameraControlsImpl | null) => {
    if (!instance) return
    const onStart = () => {
      rotatingRef.current = false
    }
    const onEnd = () => {
      rotatingRef.current = true
    }
    instance.addEventListener('controlstart', onStart)
    instance.addEventListener('controlend', onEnd)
    return () => {
      instance.removeEventListener('controlstart', onStart)
      instance.removeEventListener('controlend', onEnd)
    }
  }, [])

  return (
    <Canvas
      renderer={{ antialias: false, toneMapping: NeutralToneMapping, toneMappingExposure: 0.3 }}
      camera={{ position: [1, 2, 3], fov: 50, near: 0.01, far: 100 }}
    >
      <SceneBackground />
      <CameraLight />
      <Suspense fallback={null}>
        <Michelle />
      </Suspense>
      <Portals rotateSpeed={rotateSpeed} rotatingRef={rotatingRef} />
      <DemoHelpers target={[0, 1, 0]} controlsRef={setControls} />
    </Canvas>
  )
}
