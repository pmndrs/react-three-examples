/**
 * materials-matcap
 * R3F port of three.js `webgpu_materials_matcap`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materials_matcap (~155 lines of JS)
 *
 * DEMONSTRATES
 * - `MeshMatcapNodeMaterial` declaratively (`<meshMatcapNodeMaterial matcap normalMap
 *   color>`): view-space normal shading baked into a single texture lookup — no lights
 *   anywhere in the scene, fully typed via `@types/three`'s `MeshMatcapMaterialProperties`
 *   mixin
 * - Two matcap color-space paths side by side: an HDR EXR matcap (`EXRLoader` via
 *   fiber's `useLoader`, linear) vs an sRGB JPG matcap (`TextureLoader` +
 *   `SRGBColorSpace`, the original's `handleJPG` path)
 * - Matcap TEXTURE swaps flow live through `materialReference('matcap', 'texture')`
 *   (`reference/three.js/src/materials/nodes/MeshMatcapNodeMaterial.js`), but the
 *   texture's colorSpace decode is baked into the sampling graph at build time — so a
 *   swap sets `material.needsUpdate`, mirroring the original's own
 *   "because the color space can change" comment
 * - `renderer.toneMappingExposure` mutated imperatively from a leva slider (the
 *   `tonemapping` pattern), with the operator pinned to the original's ACESFilmic via
 *   `renderer={{ toneMapping }}`
 *
 * DIVERGENCE from original
 * - The drag-and-drop-your-own-matcap feature (FileReader plumbing for JPG/PNG/WebP/
 *   AVIF/EXR drops) is replaced with a leva dropdown of the two matcaps the three.js
 *   repo ships (040full.exr, matcap-porcelain-white.jpg) — both of the original's
 *   decode paths (EXR linear vs image sRGB) stay exercised, without file handling
 * - `renderer.inspector.createParameters` panel replaced with leva — same two
 *   parameters (color, exposure) plus the matcap dropdown above
 * - OrbitControls `enableZoom = false` / `enablePan = false` ported as
 *   `pan={false}` + `minDistance`/`maxDistance` both pinned at the camera's 13-unit
 *   start distance (camera-controls has no zoom disable flag — a locked dolly range is
 *   the same interaction)
 * - DemoHelpers grid disabled: the original is a floating head against a black
 *   backdrop, and a ground grid at y=0 would slice through the ~7-unit-tall scan
 */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useLoader, useThree } from '@react-three/fiber/webgpu'
import { useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { ACESFilmicToneMapping, SRGBColorSpace, TextureLoader } from 'three/webgpu'
import type { Mesh, MeshMatcapNodeMaterial, Texture } from 'three/webgpu'
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js'
import { DemoHelpers } from '../utils/DemoHelpers'

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples'
const MODEL_URL = `${ASSETS}/models/gltf/LeePerrySmith/LeePerrySmith.glb`
const NORMAL_URL = `${ASSETS}/models/gltf/LeePerrySmith/Infinite-Level_02_Tangent_SmoothUV.jpg`

// The two matcaps shipped in the three.js examples tree — one per decode path.
const MATCAP_URLS = {
  '040full (EXR)': `${ASSETS}/textures/matcaps/040full.exr`,
  'porcelain white (JPG)': `${ASSETS}/textures/matcaps/matcap-porcelain-white.jpg`,
} as const

type MatcapName = keyof typeof MATCAP_URLS

function Head({ matcapName, color }: { matcapName: MatcapName; color: string }) {
  // Both matcaps load up front (hooks can't be conditional; two small textures) —
  // swapping the dropdown is then instant instead of a Suspense round-trip.
  const matcapEXR = useLoader(EXRLoader, MATCAP_URLS['040full (EXR)'])
  const matcapJPG = useLoader(TextureLoader, MATCAP_URLS['porcelain white (JPG)'])
  const normalMap = useLoader(TextureLoader, NORMAL_URL)
  const { scene } = useGLTF(MODEL_URL)

  // The original takes gltf.scene.children[0] and re-materials it; we lift just the
  // geometry onto a declarative <mesh> so the material lives in JSX.
  const geometry = useMemo(() => (scene.children[0] as Mesh).geometry, [scene])

  // Image-format matcaps are sRGB (the original's handleJPG sets this on drop); the
  // EXR is linear float data and stays at EXRLoader's default. Layout effect: must
  // land before the first shader-graph build reads the texture (AGENTS Layer 1).
  useLayoutEffect(() => {
    matcapJPG.colorSpace = SRGBColorSpace
  }, [matcapJPG])

  const matcap: Texture = matcapName === '040full (EXR)' ? matcapEXR : matcapJPG

  // Texture swaps propagate live via materialReference, but the colorSpace decode is
  // baked into the sampling code at build time — rebuild on swap, exactly like the
  // original's `mesh.material.needsUpdate = true; // because the color space can change`.
  const materialRef = useRef<MeshMatcapNodeMaterial>(null)
  useLayoutEffect(() => {
    if (materialRef.current) materialRef.current.needsUpdate = true
  }, [matcap])

  return (
    <mesh geometry={geometry} position={[0, -0.25, 0]}>
      <meshMatcapNodeMaterial ref={materialRef} matcap={matcap} normalMap={normalMap} color={color} />
    </mesh>
  )
}

// renderer.toneMappingExposure is a live WebGPURenderer property, not Canvas config —
// mutate imperatively so the slider needs no pipeline rebuild (tonemapping pattern).
function Exposure({ exposure }: { exposure: number }) {
  const renderer = useThree((s) => s.renderer)
  useEffect(() => {
    renderer.toneMappingExposure = exposure
  }, [renderer, exposure])
  return null
}

export default function MaterialsMatcap() {
  const { matcap, color, exposure } = useControls('materials-matcap', {
    matcap: { value: '040full (EXR)' as MatcapName, options: Object.keys(MATCAP_URLS) as MatcapName[] },
    color: '#ffffff',
    exposure: { value: 1, min: 0, max: 2, step: 0.01 },
  })

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [0, 0, 13], fov: 40, near: 1, far: 100 }}
    >
      <Suspense fallback={null}>
        <Head matcapName={matcap} color={color} />
      </Suspense>
      <Exposure exposure={exposure} />
      {/* Grid off + dolly locked at the 13-unit start distance + pan off — see header. */}
      <DemoHelpers grid={false} pan={false} minDistance={13} maxDistance={13} />
    </Canvas>
  )
}
