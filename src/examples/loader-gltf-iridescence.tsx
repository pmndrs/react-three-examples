/**
 * loader-gltf-iridescence
 * R3F port of three.js `webgpu_loader_gltf_iridescence`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_loader_gltf_iridescence (~70 lines of JS)
 *
 * DEMONSTRATES
 * - `KHR_materials_iridescence` glTF import: `GLTFLoader` (wired up transparently by
 *   drei's `useGLTF`) converts the lamp's iridescent-glass material extension straight
 *   into a `MeshPhysicalNodeMaterial` with `iridescence`/`iridescenceIOR`/
 *   `iridescenceThicknessRange` set — no manual node-graph wiring on the R3F side, same
 *   "extension in, node material out" pattern as `loader-gltf-transmission`'s
 *   `KHR_materials_transmission`
 * - Iridescence needs a real environment to shift hue across — drei's `Environment`
 *   (`/webgpu`) drives both `scene.background` and `scene.environment` from one HDR,
 *   matching the original's `scene.background = scene.environment = texture`
 * - `CameraControls` continuous auto-rotate (`autoRotate`/`autoRotateSpeed`, negative
 *   speed for the original's reversed OrbitControls orbit direction) as a turntable
 *   shot for a small tabletop object, same technique as `loader-gltf-transmission`
 *
 * DIVERGENCE from original
 * - `backgroundBlurriness` exposed as a leva slider (default 0, matching the original's
 *   sharp unblurred background) — the original hard-codes a crisp HDR background with no
 *   GUI at all; this repo's convention for glTF+HDR ports (`loader-gltf`,
 *   `loader-gltf-transmission`) is to surface the one Environment parameter worth
 *   scrubbing live rather than leave it a hidden constant
 * - `renderer.toneMapping` (original hard-codes ACESFilmic, no exposure control) set once
 *   via `<Canvas renderer={{ toneMapping }}>` rather than exposed as a control — the
 *   `tonemapping` example already showcases live tone-mapping swaps
 * - The glTF ships no animation clips (a static lamp), so there is no `AnimationMixer`
 *   here, unlike the animated dish in `loader-gltf-transmission`
 * - Panning stays enabled (the original never calls `controls.enablePan = false`) —
 *   `DemoHelpers`' `pan` prop is left at its default
 * - DemoHelpers grid disabled (`grid={false}`): a macro lamp-on-a-turntable shot at
 *   ~0.5 unit camera distance with an HDR background filling the frame has no use for a
 *   ground grid at the default 0.5 unit cell size (same call as
 *   `loader-gltf-transmission`)
 */
import { Canvas } from '@react-three/fiber/webgpu'
import { Environment, useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { ACESFilmicToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/IridescenceLamp.glb'
const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/venice_sunset_1k.hdr'

// `useGLTF` runs the model through GLTFLoader's built-in
// `GLTFMaterialsIridescenceExtension`, which sets `iridescence`/`iridescenceIOR`/
// `iridescenceThicknessRange` directly on the resulting `MeshPhysicalNodeMaterial` —
// nothing left to wire up here, matching the original's plain `scene.add(gltf.scene)`.
function IridescenceLamp() {
  const { scene } = useGLTF(MODEL_URL)
  return <primitive object={scene} />
}

export default function LoaderGltfIridescence() {
  const { blurriness } = useControls('loader-gltf-iridescence', {
    blurriness: { value: 0, min: 0, max: 1, step: 0.01 },
  })

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [0.35, 0.05, 0.35], fov: 50, near: 0.05, far: 20 }}
    >
      <Environment files={HDR_URL} background backgroundBlurriness={blurriness} />
      <IridescenceLamp />
      <DemoHelpers
        grid={false}
        target={[0, 0.2, 0]}
        minDistance={0.3}
        maxDistance={1.5}
        autoRotate
        autoRotateSpeed={-0.5}
      />
    </Canvas>
  )
}
