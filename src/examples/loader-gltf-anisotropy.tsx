/**
 * loader-gltf-anisotropy
 * R3F port of three.js `webgpu_loader_gltf_anisotropy`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_loader_gltf_anisotropy (~60 lines of JS)
 *
 * DEMONSTRATES
 * - `KHR_materials_anisotropy` glTF import: `GLTFLoader` (wired up transparently by
 *   drei's `useGLTF`) converts the barn lamp's brushed-metal extension straight into a
 *   `MeshPhysicalNodeMaterial` with `anisotropy`/`anisotropyRotation` (+ anisotropy
 *   texture) populated — no manual node-graph wiring, same "extension in, node material
 *   out" pattern as the other loader-gltf-* material-extension ports
 * - Anisotropic highlights are pure environment response — drei's `Environment`
 *   (`/webgpu`) drives both `scene.background` and `scene.environment` from one HDR,
 *   matching the original's `scene.background = scene.environment = texture`; there is
 *   no analytic light in the scene at all
 * - `renderer={{ toneMapping, toneMappingExposure }}` for the original's brightened
 *   ACESFilmic @ 1.35 — Canvas-level renderer parameters replacing v9's post-hoc
 *   `gl.toneMapping` mutation
 * - `CameraControls` slow auto-rotate as a turntable: anisotropy is view-dependent, so
 *   the stretched highlight visibly sweeps across the brushed shade as the camera orbits
 *   (same technique as `loader-gltf-iridescence`/`-transmission`)
 *
 * DIVERGENCE from original
 * - HDR swapped: the original's `royal_esplanade_2k.hdr.jpg` is an UltraHDR JPEG
 *   requiring three.js's `UltraHDRLoader`, which drei's `/webgpu` `Environment` doesn't
 *   wire up (UPSTREAM.md B13, same gap as `loader-gltf-sheen`/`-transmission`); no plain
 *   `.hdr` Royal Esplanade exists in the r185 tree. Uses `pedestrian_overpass_1k.hdr`
 *   instead (plain Radiance HDR, r185-pinned) — bright architectural daylight, the
 *   closest stand-in for Royal Esplanade's look among the r185 HDRs not already used by
 *   the other loader-gltf-* ports.
 * - `backgroundBlurriness` (hard-coded 0.5 in the original) exposed as a leva slider
 *   defaulting to 0.5 — this cluster's "direct value controls beat hidden state"
 *   convention (`loader-gltf`, `loader-gltf-transmission`).
 * - Auto-rotate added (the original's OrbitControls are static) — a turntable makes the
 *   view-dependent anisotropic highlight the star; same call as
 *   `loader-gltf-iridescence`.
 * - Panning stays enabled (the original never disables it) — `DemoHelpers`' `pan` prop
 *   left at its default.
 * - DemoHelpers grid disabled (`grid={false}`): the lamp hangs BELOW y=0 (orbit target
 *   y = -0.08) so the world-origin grid plane would slice straight through the subject
 *   of a macro shot (same call as the other loader-gltf-* ports).
 */
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { Environment, useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { ACESFilmicToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/AnisotropyBarnLamp.glb'
const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/pedestrian_overpass_1k.hdr'

// `useGLTF` runs the model through GLTFLoader's built-in
// `GLTFMaterialsAnisotropyExtension`, which sets `anisotropy`/`anisotropyRotation` (and
// the anisotropy direction texture) directly on the resulting `MeshPhysicalNodeMaterial`
// — nothing left to wire up here, matching the original's plain `scene.add(gltf.scene)`.
function BarnLamp() {
  const { scene } = useGLTF(MODEL_URL)
  return <primitive object={scene} />
}

export default function LoaderGltfAnisotropy() {
  const { blurriness } = useControls('loader-gltf-anisotropy', {
    blurriness: { value: 0.5, min: 0, max: 1, step: 0.01 },
  })

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.35 }}
      camera={{ position: [-0.35, -0.2, 0.35], fov: 40, near: 0.01, far: 10 }}
    >
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <Environment files={HDR_URL} background backgroundBlurriness={blurriness} />
        <BarnLamp />
      </Suspense>
      <DemoHelpers
        grid={false}
        target={[0, -0.08, 0.11]}
        minDistance={0.1}
        maxDistance={2}
        autoRotate
        autoRotateSpeed={-0.5}
      />
    </Canvas>
  )
}
