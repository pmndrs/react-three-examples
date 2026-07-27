/**
 * tonemapping
 * R3F port of three.js `webgpu_tonemapping`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_tonemapping (~120 lines of JS)
 *
 * DEMONSTRATES
 * - `renderer.toneMapping` / `renderer.toneMappingExposure` as live-mutated
 *   WebGPURenderer properties (not TSL uniforms, not Canvas props) — same imperative
 *   pattern as `postprocessing-bloom-emissive`'s exposure control, extended here to also
 *   swap the tone-mapping OPERATOR itself (None/Linear/Reinhard/Cineon/ACESFilmic/AgX/
 *   Neutral) at runtime, which is the whole point of the original example
 * - drei's `Environment` (`/webgpu`) driving `scene.background` + `scene.environment`
 *   from one HDR, with `backgroundBlurriness`/`backgroundIntensity` as reactive props
 *   (no manual `HDRLoader` + `scene.backgroundBlurriness` wiring)
 * - `useGLTF`'s built-in DRACOLoader wiring (draco-compressed venice_mask.glb) — no
 *   manual `DRACOLoader`/`setDecoderPath`/`setDRACOLoader` plumbing
 * - `CameraControls` distance clamps (`minDistance`/`maxDistance`) for a macro subject
 *   where the original locks pan and limits dolly range tightly around the mask
 *
 * DIVERGENCE from original
 * - DemoHelpers grid disabled (`grid={false}`): the scene is a macro shot of a single
 *   mask at ~0.03-0.2 unit camera distances with an HDR background filling the frame;
 *   a ground grid at the default 0.5 unit cell size would be nonsensical at this scale
 * - The original's `renderer.inspector.createParameters` dat.gui-style panel is replaced
 *   with leva controls (tone-mapping type dropdown, exposure, background blurriness,
 *   background intensity) — same four parameters, same ranges
 * - Panning stays locked (`pan={false}`) matching the original's `controls.enablePan =
 *   false`; `minDistance`/`maxDistance` map directly to the original's OrbitControls
 *   values
 */
import { useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { Environment, useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  CineonToneMapping,
  LinearToneMapping,
  NeutralToneMapping,
  NoToneMapping,
  ReinhardToneMapping,
} from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const MASK_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/venice_mask.glb'
const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/venice_sunset_1k.hdr'

const TONE_MAPPING_OPTIONS = {
  None: NoToneMapping,
  Linear: LinearToneMapping,
  Reinhard: ReinhardToneMapping,
  Cineon: CineonToneMapping,
  ACESFilmic: ACESFilmicToneMapping,
  AgX: AgXToneMapping,
  Neutral: NeutralToneMapping,
} as const

function VeniceMask() {
  const { scene } = useGLTF(MASK_URL)
  return <primitive object={scene} />
}

// renderer.toneMapping / renderer.toneMappingExposure are WebGPURenderer properties,
// not TSL uniforms or Canvas-level config — mutated imperatively so the leva dropdown
// and exposure slider take effect without a pipeline rebuild.
function ToneMapping({ type, exposure }: { type: keyof typeof TONE_MAPPING_OPTIONS; exposure: number }) {
  const renderer = useThree((s) => s.renderer)

  useEffect(() => {
    renderer.toneMapping = TONE_MAPPING_OPTIONS[type]
  }, [renderer, type])

  useEffect(() => {
    renderer.toneMappingExposure = exposure
  }, [renderer, exposure])

  return null
}

export default function Tonemapping() {
  const { toneMapping, exposure } = useControls('tonemapping', {
    toneMapping: { value: 'Neutral', options: Object.keys(TONE_MAPPING_OPTIONS) },
    exposure: { value: 1, min: 0, max: 2, step: 0.01 },
  })

  const { blurriness, intensity } = useControls('background', {
    blurriness: { value: 0.3, min: 0, max: 1, step: 0.01 },
    intensity: { value: 1, min: 0, max: 1, step: 0.01 },
  })

  return (
    <Canvas
      renderer
      camera={{ position: [-0.02, 0.03, 0.05], fov: 45, near: 0.01, far: 10 }}
    >
      <directionalLight color={0xfff3ee} intensity={3} position={[1, 0.05, 0.7]} />
      <Environment files={HDR_URL} background backgroundBlurriness={blurriness} backgroundIntensity={intensity} />
      <VeniceMask />
      <ToneMapping type={toneMapping as keyof typeof TONE_MAPPING_OPTIONS} exposure={exposure} />
      <DemoHelpers grid={false} target={[0, 0.03, 0]} minDistance={0.03} maxDistance={0.2} pan={false} />
    </Canvas>
  )
}
