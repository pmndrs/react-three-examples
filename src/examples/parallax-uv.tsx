/**
 * parallax-uv
 * R3F port of three.js `webgpu_parallax_uv`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_parallax_uv (~140 lines of JS)
 *
 * DEMONSTRATES
 * - TSL `parallaxUV()`: a fake-depth ice sheet — the bottom texture's UVs are offset
 *   along the view direction by a displacement-map-driven amount, so the under-ice
 *   layer appears meters below the surface while the geometry stays a flat disc
 * - `blendOverlay()` compositing the parallaxed under-layer with the surface color
 *   map into `MeshStandardNodeMaterial.colorNode` (with the original's `.mul(5)`
 *   contrast boost), plus `roughnessNode` and `normalMap()` → `normalNode` sampled
 *   through the same scaled UVs — all set declaratively as JSX material props
 * - fiber `useUniforms` feeding leva's `parallaxScale`/`uvScale` straight into the
 *   node graph — live parallax-depth and tiling control with zero sync code
 * - drei `Environment` (`/webgpu`) driving background + IBL from one equirect HDR
 *   with a reactive `backgroundBlurriness`, replacing the original's manual
 *   `HDRLoader` + `scene.background/environment` wiring
 * - `renderer={{ toneMapping: ReinhardToneMapping, toneMappingExposure: 6 }}` — the
 *   original's exact tone-mapping response, set as Canvas-level renderer parameters
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` panel becomes leva controls
 *   (`backgroundBlurriness`, `parallaxScale`, `uvScale`) — same three parameters,
 *   same ranges and defaults
 * - DemoHelpers grid disabled (`grid={false}`) — the world-origin grid would sit
 *   directly on the ice disc at y=0 and shimmer/z-fight across the whole subject
 * - OrbitControls auto-rotate (speed -1) becomes CameraControls' `autoRotate` via
 *   DemoHelpers, with the original's 10/40 dolly limits
 * - Texture wrap/colorSpace setup happens in `useLayoutEffect` (must land before the
 *   first shader-graph build reads the textures), not awaited loader calls
 */
import { Suspense, useLayoutEffect, useMemo } from 'react'
import { Canvas, useUniforms } from '@react-three/fiber/webgpu'
import { Environment, useTexture } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { blendOverlay, normalMap, parallaxUV, texture, uv } from 'three/tsl'
import { NoColorSpace, ReinhardToneMapping, RepeatWrapping, SRGBColorSpace } from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const TEXTURE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures'
const HDR_URL = `${TEXTURE_BASE}/equirectangular/752-hdri-skies-com_1k.hdr`
const TOP_URL = `${TEXTURE_BASE}/ambientcg/Ice002_1K-JPG_Color.jpg`
const ROUGHNESS_URL = `${TEXTURE_BASE}/ambientcg/Ice002_1K-JPG_Roughness.jpg`
const NORMAL_URL = `${TEXTURE_BASE}/ambientcg/Ice002_1K-JPG_NormalGL.jpg`
const DISPLACE_URL = `${TEXTURE_BASE}/ambientcg/Ice002_1K-JPG_Displacement.jpg`
const BOTTOM_URL = `${TEXTURE_BASE}/ambientcg/Ice003_1K-JPG_Color.jpg`

interface IceGroundProps {
  parallaxScale: number
  uvScale: number
}

function IceGround({ parallaxScale, uvScale }: IceGroundProps) {
  // Creator hook BEFORE the suspending hook (AGENTS.md / UPSTREAM B18): deferred to
  // the post-suspense re-render, useUniforms' store write would land after siblings
  // have subscribed and trip React's setState-during-render warning.
  const { uParallaxScale, uUvScale } = useUniforms(
    { uParallaxScale: parallaxScale, uUvScale: uvScale },
    'parallaxIce',
  )

  const textures = useTexture({
    top: TOP_URL,
    roughness: ROUGHNESS_URL,
    normal: NORMAL_URL,
    displace: DISPLACE_URL,
    bottom: BOTTOM_URL,
  })

  // Wrap mode and colorSpace must be set before the first shader-graph build reads
  // the textures (samplers/decode are baked at first RAF render) — layout effect,
  // not passive effect (AGENTS.md useLayoutEffect rule). Only the two color maps are
  // sRGB; roughness/normal/displacement are data, exactly as in the original.
  useLayoutEffect(() => {
    for (const tex of Object.values(textures)) {
      tex.wrapS = RepeatWrapping
      tex.wrapT = RepeatWrapping
    }
    textures.top.colorSpace = SRGBColorSpace
    textures.bottom.colorSpace = SRGBColorSpace
    textures.roughness.colorSpace = NoColorSpace
    textures.normal.colorSpace = NoColorSpace
    textures.displace.colorSpace = NoColorSpace
  }, [textures])

  // Casts: fiber's `UniformNode<T>` pins the TSL type param to `unknown` (documented
  // upstream typing gap — see AGENTS.md / UPSTREAM B10 family).
  const uParallaxScaleNode = uParallaxScale as unknown as Node<'float'>
  const uUvScaleNode = uUvScale as unknown as Node<'float'>

  // Built once per texture/uniform identity — uniform values mutate in place via
  // `.value`, so leva edits reach the shader without a graph rebuild.
  const nodes = useMemo(() => {
    const scaledUV = uv().mul(uUvScaleNode)

    // Displacement sample drives how far the bottom layer's UVs slide along the
    // view direction — the whole "depth" of the ice is this one offset.
    const offsetUV = texture(textures.displace, scaledUV).mul(uParallaxScaleNode)
    const parallaxUVOffset = parallaxUV(scaledUV, offsetUV)
    const parallaxResult = texture(textures.bottom, parallaxUVOffset)

    const iceNode = blendOverlay(texture(textures.top, scaledUV), parallaxResult)

    return {
      colorNode: iceNode.mul(5), // increase the color intensity to 5 (contrast)
      roughnessNode: texture(textures.roughness, scaledUV),
      normalNode: normalMap(texture(textures.normal, scaledUV)),
    }
  }, [textures, uParallaxScaleNode, uUvScaleNode])

  return (
    <mesh rotation-x={-Math.PI / 2}>
      <circleGeometry args={[25, 64]} />
      <meshStandardNodeMaterial
        colorNode={nodes.colorNode}
        roughnessNode={nodes.roughnessNode}
        normalNode={nodes.normalNode}
        metalness={0}
      />
    </mesh>
  )
}

export default function ParallaxUv() {
  const { backgroundBlurriness, parallaxScale, uvScale } = useControls('parallax-uv', {
    backgroundBlurriness: { value: 0.4, min: 0, max: 1, step: 0.01 },
    parallaxScale: { value: 0.5, min: 0.2, max: 0.5, step: 0.01 },
    uvScale: { value: 3, min: 1, max: 5, step: 0.1 },
  })

  return (
    <Canvas
      renderer={{ toneMapping: ReinhardToneMapping, toneMappingExposure: 6 }}
      camera={{ position: [15, 7, 15], fov: 45, near: 0.1, far: 100 }}
    >
      {/* One explicit Suspense gate (B17) wrapping Environment + the lit node-material
          mesh (B15): the first shader build must already see scene.environment. The
          creator-hook component renders before the suspending Environment sibling
          (B18 escalation, compute-particles-rain pattern). */}
      <Suspense fallback={null}>
        <IceGround parallaxScale={parallaxScale} uvScale={uvScale} />
        <Environment files={HDR_URL} background backgroundBlurriness={backgroundBlurriness} />
      </Suspense>
      <DemoHelpers
        grid={false}
        target={[0, 0, 0]}
        minDistance={10}
        maxDistance={40}
        autoRotate
        autoRotateSpeed={-1}
      />
    </Canvas>
  )
}
