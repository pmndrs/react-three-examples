/**
 * materials-transmission
 * R3F port of three.js `webgpu_materials_transmission`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materials_transmission (~200 lines of JS)
 *
 * DEMONSTRATES
 * - `MeshPhysicalNodeMaterial` as a full transmission playground: every physical knob
 *   the original's GUI exposes (color, transmission, opacity, metalness, roughness,
 *   ior, thickness, specularIntensity, specularColor, envMapIntensity) driven straight
 *   from leva through plain JSX material props — all of these are reference-node-backed
 *   in the WebGPU node pipeline (re-read per frame), so there is zero `needsUpdate` or
 *   uniform plumbing on the R3F side
 * - Transmission on WebGPU: the renderer resolves what's visible "through" the glass
 *   from its own internal viewport-texture pass — no manual render target, unlike the
 *   WebGL backend's separate transmission render
 * - A procedural striped `CanvasTexture` alphaMap (2x2 canvas, bottom row white) with
 *   `NearestFilter` + `RepeatWrapping` at repeat (1, 3.5) — crisp alternating
 *   transparent bands on a `DoubleSide`, `transparent` sphere, so backfaces show
 *   through the cutouts
 * - `renderer.toneMappingExposure` mutated live from a leva slider (renderer property,
 *   not Canvas config — same pattern as `tonemapping` / `postprocessing-bloom-emissive`)
 *
 * DIVERGENCE from original
 * - HDR swapped: the original's `royal_esplanade_2k.hdr.jpg` is an UltraHDR JPEG
 *   requiring three.js's `UltraHDRLoader`, which drei's `/webgpu` `Environment` doesn't
 *   wire up (UPSTREAM B13 — fifth hit, same swap as `loader-gltf-transmission`). This
 *   port uses `san_giuseppe_bridge_2k.hdr` (r185-pinned, plain Radiance HDR) instead —
 *   same background + IBL technique, a different esplanade.
 * - IBL wired as `scene.environment` via drei's `Environment` (one component for
 *   background + environment) instead of the original's per-material `envMap` — the
 *   `envMapIntensity` control stays per-material either way (`EnvironmentNode`
 *   multiplies by `materialEnvIntensity`, verified in three 0.185.1 source).
 * - OrbitControls -> this repo's CameraControls (via DemoHelpers), same 10/150 dolly
 *   clamps as the original; grid disabled (`grid={false}`) — a glass sphere floating
 *   in an HDR skybox has no ground plane to grid.
 * - `renderer.inspector = new Inspector()` + its `createParameters` GUI dropped — this
 *   repo doesn't wire the Inspector RootState slot (same gap noted in `clearcoat`);
 *   the parameter surface is leva instead.
 * - The original's unused `lightIntensity` param dropped (its scene has no lights —
 *   the param is declared but never wired to anything upstream).
 */
import { Suspense, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { Environment } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  DoubleSide,
  NearestFilter,
  RepeatWrapping,
} from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/san_giuseppe_bridge_2k.hdr'

// Procedural stripe alpha map, matching the original's generateTexture(): a 2x2 canvas
// with only the bottom row painted white — alphaMap reads it as opaque/transparent
// bands once RepeatWrapping tiles it 3.5x vertically. Module scope: a constant,
// idempotent asset (same rationale as clearcoat's FlakesTexture canvas), which also
// sidesteps a StrictMode double-create.
function generateStripeCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 2
  const context = canvas.getContext('2d')!
  context.fillStyle = 'white'
  context.fillRect(0, 1, 2, 1)
  return canvas
}
const stripeAlphaMap = new CanvasTexture(generateStripeCanvas())
stripeAlphaMap.magFilter = NearestFilter
stripeAlphaMap.wrapS = stripeAlphaMap.wrapT = RepeatWrapping
stripeAlphaMap.repeat.set(1, 3.5)

// Sets renderer.toneMappingExposure imperatively — a WebGPURenderer property, not
// Canvas config, so a leva-driven change has to land on the live renderer (pattern:
// tonemapping, postprocessing-bloom-emissive).
function ToneMappingExposure({ exposure }: { exposure: number }) {
  const renderer = useThree((s) => s.renderer)

  useEffect(() => {
    renderer.toneMappingExposure = exposure
  }, [renderer, exposure])

  return null
}

interface SphereParams {
  color: string
  transmission: number
  opacity: number
  metalness: number
  roughness: number
  ior: number
  thickness: number
  specularIntensity: number
  specularColor: string
  envMapIntensity: number
}

// The transmissive sphere. Every material field here is reference-node-backed in the
// WebGPU node pipeline (materialTransmission, materialIOR, materialThickness, ... are
// re-read each frame), so leva edits flow through plain prop updates — no needsUpdate.
function TransmissiveSphere(params: SphereParams) {
  return (
    <mesh>
      <sphereGeometry args={[20, 64, 32]} />
      <meshPhysicalNodeMaterial
        color={params.color}
        metalness={params.metalness}
        roughness={params.roughness}
        ior={params.ior}
        alphaMap={stripeAlphaMap}
        envMapIntensity={params.envMapIntensity}
        transmission={params.transmission}
        specularIntensity={params.specularIntensity}
        specularColor={params.specularColor}
        opacity={params.opacity}
        thickness={params.thickness}
        side={DoubleSide}
        transparent
      />
    </mesh>
  )
}

export default function MaterialsTransmission() {
  const { exposure, ...sphereParams } = useControls('materials-transmission', {
    color: '#ffffff',
    transmission: { value: 1, min: 0, max: 1, step: 0.01 },
    opacity: { value: 1, min: 0, max: 1, step: 0.01 },
    metalness: { value: 0, min: 0, max: 1, step: 0.01 },
    roughness: { value: 0, min: 0, max: 1, step: 0.01 },
    ior: { value: 1.5, min: 1, max: 2, step: 0.01 },
    thickness: { value: 0.01, min: 0, max: 5, step: 0.01 },
    specularIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
    specularColor: '#ffffff',
    envMapIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
    exposure: { value: 1, min: 0, max: 1, step: 0.01 },
  })

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [0, 0, 120], fov: 40, near: 1, far: 2000 }}
    >
      <ToneMappingExposure exposure={exposure} />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <Environment files={HDR_URL} background />
        <TransmissiveSphere {...sphereParams} />
      </Suspense>
      <DemoHelpers grid={false} minDistance={10} maxDistance={150} />
    </Canvas>
  )
}
