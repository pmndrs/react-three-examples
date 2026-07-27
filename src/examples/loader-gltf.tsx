/**
 * loader-gltf
 * R3F port of three.js `webgpu_loader_gltf`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_loader_gltf (~225 lines of JS)
 *
 * DEMONSTRATES
 * - Live model catalog: fetches KhronosGroup's `glTF-Sample-Assets` `model-index.json`
 *   at runtime (same external index the original itself fetches) and feeds the
 *   resulting names into a leva dropdown via `useControls`'s deps-array schema
 *   recreation — the schema's `options` list only exists once the fetch resolves
 * - Variant resolution: mirrors the original's `loadModel` logic exactly (prefer the
 *   `glTF-Binary` variant, fall back to `glTF`) to build each model's download URL
 * - `useGLTF` + `Suspense`, keyed on the resolved model URL, as a hot-swappable model
 *   loader — swapping the leva dropdown unmounts the old model subtree and suspends a
 *   fresh `useGLTF` fetch, replacing the original's manual traverse-and-dispose teardown
 *   in `loadModel` with a React unmount + drei's suspense cache
 * - A raw `THREE.AnimationMixer` playing EVERY clip on the loaded model (matching the
 *   original's `for (const animation of gltf.animations) mixer.clipAction(animation)
 *   .play()`) instead of `useAnimations`' by-name pattern used elsewhere in this repo —
 *   appropriate here because clip names are unknowable ahead of time for an arbitrary,
 *   user-selectable community model catalog
 * - drei's `Environment` (`/webgpu`) background with a reactive `backgroundBlurriness`
 *   leva control, replacing the original's manual HDR loader + `scene.backgroundBlurriness`
 *   dat.gui wiring
 * - `renderer.toneMapping` set via the `<Canvas renderer={{ toneMapping }}>` prop
 *
 * DIVERGENCE from original
 * - HDR swapped: the original's `royal_esplanade_2k.hdr.jpg` is an UltraHDR JPEG that
 *   needs three.js's `UltraHDRLoader`; drei's `/webgpu` `Environment`/`useEnvironment`
 *   doesn't wire that loader up. Uses `quarry_01_1k.hdr` (plain Radiance HDR, also from
 *   the three.js examples, r185-pinned) instead — same IBL/background technique, a
 *   different environment.
 * - Per-model auto camera framing (the original's Box3-based `fitCameraToSelection`,
 *   which recomputes camera position + orbit distance limits on every model swap) is
 *   DROPPED — a real, verified gap, not routed around silently:
 *   1) `camera-controls` v3's `update()` unconditionally overwrites `camera.position`/
 *      `lookAt()` every frame from its own internal spherical/target state (verified
 *      against `node_modules/camera-controls` dist source) — external `camera.position`
 *      mutation is silently discarded on the next frame; only the instance's own
 *      `fitToBox`/`setLookAt`/`moveTo` methods can reframe it.
 *   2) Fiber's `<Canvas camera={{ position, fov, near, far }}>` config is applied ONCE
 *      at Canvas creation (verified against `renderer.tsx`'s `configure()`) — passing a
 *      new `camera` prop object on re-render is a no-op.
 *   `src/utils/CameraControls.tsx` doesn't expose an imperative fit/moveTo escape hatch
 *   (and this port is scoped to not modify `src/utils/`), so there is no reactive path
 *   to reframe per model. The camera stays fixed at the original's own DamagedHelmet-
 *   tuned framing (position/fov/target/min-max distance below, identical to the
 *   original's OrbitControls defaults for its default model). Swapping to a very
 *   differently-scaled sample model (BoomBox, LittlestTokyo, ABeautifulGame, ... all
 *   confirmed loadable) may render very small/large until the user manually dollies —
 *   flagged as a CameraControls gap (needs a `fitToBox`/`moveTo` escape hatch), not a bug.
 * - Manual per-mesh geometry/material/texture disposal on model swap (the original's
 *   teardown before loading the next model) is dropped in favor of React unmount +
 *   drei's `useGLTF` suspense cache, consistent with this repo's existing simplification
 *   pattern (`instance-mesh`) — repeatedly swapping through many large models in one
 *   session grows GPU memory faster than the original; a real tradeoff, not a bug.
 * - `renderer.inspector.createParameters` dat.gui panel replaced by leva: `model`
 *   dropdown (sourced from the live-fetched index) and `blurriness` slider — the same
 *   two parameters the original exposes.
 */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber/webgpu'
import { Environment, useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { AnimationMixer, ACESFilmicToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const MODEL_INDEX_URL =
  'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/model-index.json'
const MODEL_BASE_URL = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models'
const DEFAULT_MODEL_URL = `${MODEL_BASE_URL}/DamagedHelmet/glTF-Binary/DamagedHelmet.glb`
const HDR_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/quarry_01_1k.hdr'

interface GltfSampleModel {
  name: string
  variants: Record<string, string>
}

// Mirrors the original's `loadModel`: prefer the single-file glTF-Binary variant,
// fall back to the multi-file glTF variant; the variant's own extension picks the
// KhronosGroup repo folder ('glTF-Binary' vs 'glTF').
function resolveModelUrl(model: GltfSampleModel): string {
  const variant = model.variants['glTF-Binary'] ?? model.variants['glTF']
  const folder = variant.endsWith('.glb') ? 'glTF-Binary' : 'glTF'
  return `${MODEL_BASE_URL}/${model.name}/${folder}/${variant}`
}

// Plays every animation clip on the loaded model via a raw AnimationMixer — the
// original's own behavior (`for (const animation of gltf.animations) ...play()`).
// Not drei's `useAnimations`: clip names are unknown ahead of time for an arbitrary,
// user-picked community model, so there's no "by name" list to play selectively.
function Model({ url }: { url: string }) {
  const { scene, animations } = useGLTF(url)
  const mixerRef = useRef<AnimationMixer | null>(null)

  useLayoutEffect(() => {
    if (animations.length === 0) return
    const mixer = new AnimationMixer(scene)
    for (const clip of animations) mixer.clipAction(clip).play()
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

export default function LoaderGltf() {
  const [modelIndex, setModelIndex] = useState<GltfSampleModel[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(MODEL_INDEX_URL)
      .then((res) => res.json())
      .then((models: GltfSampleModel[]) => {
        if (!cancelled) setModelIndex(models)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const modelNames = useMemo(() => modelIndex.map((m) => m.name), [modelIndex])

  const { model, blurriness } = useControls(
    'loader-gltf',
    {
      model: { value: 'DamagedHelmet', options: modelNames.length > 0 ? modelNames : ['DamagedHelmet'] },
      blurriness: { value: 0, min: 0, max: 1, step: 0.01 },
    },
    [modelNames],
  )

  const modelInfo = modelIndex.find((m) => m.name === model)
  const modelUrl = modelInfo ? resolveModelUrl(modelInfo) : DEFAULT_MODEL_URL

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [-1.8, 0.6, 2.7], fov: 45, near: 0.25, far: 20 }}
    >
      <Suspense fallback={null}>
        <Environment files={HDR_URL} background backgroundBlurriness={blurriness} />
        <Model key={modelUrl} url={modelUrl} />
      </Suspense>
      {/* Grid off: HDR environment fills the frame and the helmet floats at origin —
          the infinite grid renders through both (same call as tonemapping/bloom). */}
      <DemoHelpers grid={false} target={[0, 0, -0.2]} minDistance={2} maxDistance={10} />
    </Canvas>
  )
}
