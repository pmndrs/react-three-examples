/**
 * loader-gltf-sheen
 * R3F port of three.js `webgpu_loader_gltf_sheen`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_loader_gltf_sheen (~90 lines of JS)
 *
 * DEMONSTRATES
 * - `KHR_materials_sheen` glTF import: `GLTFLoader` (wired up transparently by drei's
 *   `useGLTF`) converts the fabric mesh's sheen extension into a `MeshPhysicalNodeMaterial`
 *   with `sheen`/`sheenColor`/`sheenRoughness` populated — no manual node graph wiring.
 * - `scene.getObjectByName(...)` to reach a specific mesh inside a loaded glTF, mirroring
 *   the original's `gltf.scene.getObjectByName('SheenChair_fabric')` 1:1.
 * - Live sheen tweaking: TSL's `materialSheen` accessor (`MaterialNode.SHEEN`) reads
 *   `material.sheen` fresh every frame, so a leva slider writing straight to that plain
 *   numeric accessor is enough to react — no `useUniforms`/build-graph indirection needed,
 *   matching the original's direct `gui.add(object.material, 'sheen', 0, 1)` binding.
 * - drei's `Environment` (`/webgpu`) driving both `scene.background` and `scene.environment`
 *   from one HDR — the sheen highlight comes entirely from environment lighting (the
 *   original leaves its own `DirectionalLight` commented out for the same reason).
 *
 * DIVERGENCE from original
 * - HDR swapped: the original's `royal_esplanade_2k.hdr.jpg` is an UltraHDR JPEG requiring
 *   three.js's `UltraHDRLoader`, which drei's `/webgpu` `Environment`/`useEnvironment`
 *   doesn't wire up (same real gap flagged in `loader-gltf`/`loader-gltf-transmission`).
 *   Uses `monochrome_studio_02_1k.hdr` instead (plain Radiance HDR, r185-pinned) — a
 *   neutral studio backdrop suits a furniture/material study better than reusing one of
 *   the other two HDRs already picked for the other loader-gltf-* ports.
 * - `backgroundBlurriness`/PMREM (original has a commented-out
 *   `scene.backgroundBlurriness = 1` with a `@TODO: Needs PMREM` note) is left at 0 — the
 *   original itself never turns it on, so there is nothing to port.
 * - `renderer.inspector.createParameters` dat.gui panel replaced by a leva `sheen` slider
 *   bound to the same mesh/property the original's inspector panel exposed.
 * - DemoHelpers grid disabled (`grid={false}`): the HDR studio backdrop has its own floor
 *   plane, and the infinite grid moiré-aliases across it, competing with the fabric study
 *   (same call as the other two loader-gltf-* ports).
 */
import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { Environment, useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { ACESFilmicToneMapping, type Mesh, type MeshPhysicalNodeMaterial } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/SheenChair.glb'
const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/monochrome_studio_02_1k.hdr'

// Writes the leva `sheen` value straight onto the fabric mesh's material — `sheen` is a
// plain number accessor that TSL's `materialSheen` reference node re-reads every frame,
// so no useUniforms/build-graph plumbing is needed (see header DEMONSTRATES).
function SheenChair({ sheen }: { sheen: number }) {
  const { scene } = useGLTF(MODEL_URL)

  useEffect(() => {
    const fabric = scene.getObjectByName('SheenChair_fabric') as Mesh | undefined
    const material = fabric?.material as MeshPhysicalNodeMaterial | undefined
    if (material) material.sheen = sheen
  }, [scene, sheen])

  return <primitive object={scene} />
}

export default function LoaderGltfSheen() {
  const { sheen } = useControls('loader-gltf-sheen', {
    // SheenChair.glb authors `KHR_materials_sheen` with an implicit sheen factor of 1 —
    // matches the original's un-set dat.gui default (it only wires the slider, never
    // overrides the loaded value).
    sheen: { value: 1, min: 0, max: 1, step: 0.01 },
  })

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [-0.75, 0.7, 1.25], fov: 45, near: 0.1, far: 20 }}
    >
      <Environment files={HDR_URL} background />
      <SheenChair sheen={sheen} />
      <DemoHelpers grid={false} target={[0, 0.35, 0]} minDistance={1} maxDistance={10} />
    </Canvas>
  )
}
