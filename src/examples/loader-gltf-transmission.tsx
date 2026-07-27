/**
 * loader-gltf-transmission
 * R3F port of three.js `webgpu_loader_gltf_transmission`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_loader_gltf_transmission (~90 lines of JS)
 *
 * DEMONSTRATES
 * - `KHR_materials_transmission` glTF import: `GLTFLoader` (wired up transparently by
 *   drei's `useGLTF`) converts the dish's transmissive material extension straight into
 *   a `MeshPhysicalNodeMaterial` with `transmissionNode` set — no manual pass, render
 *   target, or node-graph wiring on the R3F side. The WebGPU renderer resolves the
 *   transmission sample (what's visible "through" the glass) from its own internal
 *   viewport-texture pass automatically, unlike the WebGL backend's separate
 *   `.background`-render-to-texture step
 * - Convincing transmission needs light to bend/reflect FROM something — drei's
 *   `Environment` (`/webgpu`) drives both `scene.background` and `scene.environment`
 *   from one HDR so the dish's glass has a real scene to refract
 * - A raw `THREE.AnimationMixer` playing a single clip BY INDEX
 *   (`mixer.clipAction(gltf.animations[0]).play()`), matching the original exactly —
 *   distinct from `loader-gltf`'s by-name-agnostic "play every clip" pattern, since here
 *   the original itself indexes into a known single-clip asset
 * - `CameraControls` continuous auto-rotate (`autoRotate`/`autoRotateSpeed`, negative
 *   speed for the original's reversed orbit direction) combined with tight
 *   `minDistance`/`maxDistance` dolly clamps for a macro turntable shot
 *
 * DIVERGENCE from original
 * - HDR swapped: the original's `royal_esplanade_2k.hdr.jpg` is an UltraHDR JPEG
 *   requiring three.js's `UltraHDRLoader`, which drei's `/webgpu` `Environment`/
 *   `useEnvironment` doesn't wire up (same real gap flagged in `loader-gltf`). No plain
 *   `.hdr` release of Royal Esplanade exists in the r185 examples tree, so this port
 *   uses `san_giuseppe_bridge_2k.hdr` instead (also r185-pinned, plain Radiance HDR) —
 *   same IBL/background technique, a different environment.
 * - `renderer.toneMapping`/`toneMappingExposure` (original hard-codes ACESFilmic @ 1)
 *   set once via `<Canvas renderer={{ toneMapping }}>` rather than exposed as a control
 *   — this port's `tonemapping` example already showcases live tone-mapping swaps, so
 *   duplicating that control surface here would just add noise to a transmission demo.
 * - `backgroundBlurriness` (hard-coded 0.35 in the original) exposed as a leva slider,
 *   consistent with `loader-gltf`/`tonemapping`'s "direct value controls beat hidden
 *   state" convention.
 * - Panning stays enabled (the original never calls `controls.enablePan = false`,
 *   unlike `tonemapping`'s locked pan) — `DemoHelpers`' `pan` prop is left at its
 *   default.
 * - DemoHelpers grid disabled (`grid={false}`): a macro dish-on-a-turntable shot at
 *   ~0.5-1 unit camera distances with an HDR background filling the frame has no use
 *   for a ground grid at the default 0.5 unit cell size.
 */
import { Suspense, useLayoutEffect, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber/webgpu'
import { Environment, useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { AnimationMixer, ACESFilmicToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/IridescentDishWithOlives.glb'
const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/san_giuseppe_bridge_2k.hdr'

// Plays clip index 0 via a raw AnimationMixer, matching the original's
// `mixer.clipAction( gltf.animations[ 0 ] ).play()` — the asset ships exactly one
// (turntable) clip, so indexing it directly (rather than `loader-gltf`'s play-every-
// clip-by-name approach for an arbitrary catalog) mirrors the original 1:1.
function Dish() {
  const { scene, animations } = useGLTF(MODEL_URL)
  const mixerRef = useRef<AnimationMixer | null>(null)

  useLayoutEffect(() => {
    if (animations.length === 0) return
    const mixer = new AnimationMixer(scene)
    mixer.clipAction(animations[0]).play()
    mixerRef.current = mixer
    return () => {
      mixer.stopAllAction()
      mixerRef.current = null
    }
  }, [scene, animations])

  useFrame((_, delta) => {
    mixerRef.current?.update(delta)
  })

  return <primitive object={scene} />
}

export default function LoaderGltfTransmission() {
  const { blurriness } = useControls('loader-gltf-transmission', {
    blurriness: { value: 0.35, min: 0, max: 1, step: 0.01 },
  })

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [0, 0.4, 0.7], fov: 45, near: 0.25, far: 20 }}
    >
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <Environment files={HDR_URL} background backgroundBlurriness={blurriness} />
        <Dish />
      </Suspense>
      <DemoHelpers
        grid={false}
        target={[0, 0.1, 0]}
        minDistance={0.5}
        maxDistance={1}
        autoRotate
        autoRotateSpeed={-0.75}
      />
    </Canvas>
  )
}
