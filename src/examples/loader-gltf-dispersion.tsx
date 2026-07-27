/**
 * loader-gltf-dispersion
 * R3F port of three.js `webgpu_loader_gltf_dispersion`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_loader_gltf_dispersion (~70 lines of JS)
 *
 * DEMONSTRATES
 * - `KHR_materials_dispersion` glTF import: `GLTFLoader` (wired up transparently by
 *   drei's `useGLTF`) converts the test object's dispersive-glass extension straight
 *   into a `MeshPhysicalNodeMaterial` with `dispersion` set — the WebGPU renderer then
 *   splits the transmission sample per RGB channel (wavelength-dependent IOR) to
 *   produce the prismatic color fringing; no manual node-graph wiring on the R3F side,
 *   same "extension in, node material out" pattern as the other loader-gltf-* ports
 * - Dispersion rides on transmission, and transmission needs a real scene to refract —
 *   drei's `Environment` (`/webgpu`) drives both `scene.background` and
 *   `scene.environment` from one HDR, matching the original's
 *   `scene.background = scene.environment = hdrTexture`. Unlike the other cluster
 *   members this original ships a plain Radiance `.hdr`, so the exact upstream asset
 *   hotlinks directly (no UltraHDR swap needed here)
 * - `renderer={{ toneMapping }}` for the original's Reinhard tone mapping —
 *   Canvas-level renderer parameters replacing v9's post-hoc `gl.toneMapping` mutation
 * - `CameraControls` slow auto-rotate as a turntable: dispersion fringing is
 *   view-dependent, so the rainbow edges sweep across the glass as the camera orbits
 *   (same technique as `loader-gltf-iridescence`/`-anisotropy`)
 *
 * DIVERGENCE from original
 * - `backgroundBlurriness` (hard-coded 0.5 in the original) exposed as a leva slider
 *   defaulting to 0.5 — this cluster's "direct value controls beat hidden state"
 *   convention (`loader-gltf`, `loader-gltf-transmission`, `loader-gltf-anisotropy`).
 * - Auto-rotate added (the original's OrbitControls are static) — a turntable makes
 *   the view-dependent chromatic fringing the star; same call as
 *   `loader-gltf-iridescence`/`-anisotropy`.
 * - `maxDistance` clamped to 2 instead of the original's 10: the original keeps its
 *   `camera.far` at 5, so dollying out past ~5 units would frustum-cull the model
 *   while the controls happily continue to 10 — this port keeps the far plane and
 *   bounds the dolly inside it instead of reproducing the dead zone.
 * - Panning stays enabled (the original never disables it) — `DemoHelpers`' `pan`
 *   prop left at its default.
 * - DemoHelpers grid disabled (`grid={false}`): a centimeter-scale glass test object
 *   orbited at ~0.2 unit camera distances with an HDR background filling the frame has
 *   no use for a ground grid at the default 0.5 unit cell size (same call as the
 *   other loader-gltf-* ports).
 */
import { Canvas } from '@react-three/fiber/webgpu'
import { Environment, useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { ReinhardToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/DispersionTest.glb'
const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/pedestrian_overpass_1k.hdr'

// `useGLTF` runs the model through GLTFLoader's built-in
// `GLTFMaterialsDispersionExtension`, which sets `dispersion` on the resulting
// `MeshPhysicalNodeMaterial` (alongside the transmission/volume extensions the asset
// also carries) — nothing left to wire up here, matching the original's plain
// `scene.add(gltf.scene)`.
function DispersionTest() {
  const { scene } = useGLTF(MODEL_URL)
  return <primitive object={scene} />
}

export default function LoaderGltfDispersion() {
  const { blurriness } = useControls('loader-gltf-dispersion', {
    blurriness: { value: 0.5, min: 0, max: 1, step: 0.01 },
  })

  return (
    <Canvas
      renderer={{ toneMapping: ReinhardToneMapping }}
      camera={{ position: [0.1, 0.05, 0.15], fov: 45, near: 0.01, far: 5 }}
    >
      <Environment files={HDR_URL} background backgroundBlurriness={blurriness} />
      <DispersionTest />
      <DemoHelpers
        grid={false}
        target={[0, 0, 0]}
        minDistance={0.1}
        maxDistance={2}
        autoRotate
        autoRotateSpeed={-0.5}
      />
    </Canvas>
  )
}
