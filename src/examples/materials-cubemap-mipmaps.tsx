/**
 * materials-cubemap-mipmaps
 * R3F port of three.js `webgpu_materials_cubemap_mipmaps`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materials_cubemap_mipmaps (~130 lines of JS)
 *
 * DEMONSTRATES
 * - Manually authored CUBE-texture mipmaps: nine independently-photographed 6-face sets
 *   (one per mip level, `cube_m00`..`cube_m08`) loaded and assembled into one
 *   `CubeTexture` whose `.mipmaps[1..8]` are the higher levels (`.mipmaps.shift()`
 *   peels level 0 off into the base texture) — same "manually authored beats generated"
 *   idea as `materials-texture-manualmipmap`, one dimension up. Loaded via fiber's
 *   `useLoader(CubeTextureLoader, [urls...])` with a NESTED array (one 6-url array per
 *   mip level) — the multi-resource form of the B20 pattern established in
 *   `cubemap-dynamic`/`clearcoat` (`useLoader(HDRCubeTextureLoader, [files])`), here
 *   returning nine `CubeTexture`s from one call instead of one
 * - Manual vs. auto mipmaps side by side on identical geometry: the left sphere's
 *   material reuses the manually-mipmapped cube texture as-is; the right sphere's
 *   material gets a CLONE with `.mipmaps = []` and `generateMipmaps = true`, letting
 *   the WebGPU backend build its own chain from the level-0 faces alone — the visual
 *   diff between hand-authored and auto-downsampled cube mips
 * - `MeshBasicMaterial`'s `envMap` reflecting a cube texture with NO lights in the
 *   scene at all — env-mapped reflection on an unlit material is its own pass, not a
 *   lighting contribution
 *
 * DIVERGENCE from original
 * - OrbitControls -> this repo's CameraControls via DemoHelpers, `minPolarAngle`/
 *   `maxPolarAngle` forwarded 1:1 (original locks the same vertical range so the
 *   camera can't flip past the horizon and see the spheres' unlit backsides edge-on)
 * - DemoHelpers grid disabled (`grid={false}`): the original scene has no ground/
 *   background, just two spheres floating in a black void
 * - No leva controls: nothing in the original is parameterized beyond the fixed
 *   manual-vs-auto comparison the example exists to teach
 */
import { Suspense, useMemo } from 'react'
import { Canvas, useLoader } from '@react-three/fiber/webgpu'
import { CubeTextureLoader, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three/webgpu'
import type { CubeTexture } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const CUBE_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/cube/angus/'
const MAX_LEVEL = 8

// One 6-face URL set per mip level: cube_m00_c00..c05.jpg (level 0) through
// cube_m08_c00..c05.jpg (level 8) — ported verbatim from the original's nested loop.
const LEVEL_URLS = Array.from({ length: MAX_LEVEL + 1 }, (_, level) =>
  Array.from({ length: 6 }, (_, face) => `${CUBE_PATH}cube_m0${level}_c0${face}.jpg`),
)

function MipmappedSpheres() {
  // Nine CubeTextures, one per mip level — the multi-resource form of the B20
  // useLoader(nested-array) pattern (see DEMONSTRATES).
  const levels = useLoader(CubeTextureLoader, LEVEL_URLS) as CubeTexture[]

  // Built once per `levels` identity (stable across re-renders — useLoader's
  // suspend-react cache keeps the same array reference) so the two materials don't
  // get a fresh texture/GPU sampler every render.
  const { manualTexture, autoTexture } = useMemo(() => {
    const manual = levels[0]
    manual.mipmaps = levels.slice(1)
    manual.colorSpace = SRGBColorSpace
    manual.minFilter = LinearMipmapLinearFilter
    manual.magFilter = LinearFilter
    manual.generateMipmaps = false
    manual.needsUpdate = true

    const auto = manual.clone()
    auto.mipmaps = []
    auto.generateMipmaps = true
    auto.needsUpdate = true

    return { manualTexture: manual, autoTexture: auto }
  }, [levels])

  return (
    <>
      <mesh position={[100, 0, 0]}>
        <sphereGeometry args={[100, 128, 128]} />
        <meshBasicNodeMaterial color="#ffffff" envMap={manualTexture} />
      </mesh>
      <mesh position={[-100, 0, 0]}>
        <sphereGeometry args={[100, 128, 128]} />
        <meshBasicNodeMaterial color="#ffffff" envMap={autoTexture} />
      </mesh>
    </>
  )
}

export default function MaterialsCubemapMipmaps() {
  return (
    <Canvas renderer camera={{ position: [0, 0, 500], fov: 50, near: 1, far: 10000 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <MipmappedSpheres />
      </Suspense>
      <DemoHelpers grid={false} minPolarAngle={Math.PI / 4} maxPolarAngle={Math.PI / 1.5} />
    </Canvas>
  )
}
