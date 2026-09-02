/**
 * loader-gltf-compressed
 * R3F port of three.js `webgpu_loader_gltf_compressed`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_loader_gltf_compressed (~85 lines of JS)
 *
 * DEMONSTRATES
 * - Loading a gltfpack-compressed GLB (KTX2/BasisU compressed textures + Meshopt
 *   compressed geometry) through drei's `useGLTF` on the WebGPU path
 * - `useGLTF`'s options object wires all three compression extensions itself —
 *   `{ draco, meshopt, ktx2 }`. Passing a STRING for `ktx2` sets the BasisU
 *   transcoder path; drei creates a shared `KTX2Loader` and calls
 *   `detectSupport()` against the live renderer for you.
 * - Headlight pattern: a `pointLight` copying the camera position every `useFrame`
 *   tick — physically-based `power` in lumens (the original's `light.power = 1300`)
 * - Reinhard tone mapping configured once via `<Canvas renderer={{ toneMapping }}>`
 *
 * DIVERGENCE from original
 * - Headlight is a `useFrame` position-copy instead of the original's
 *   `camera.add(light); scene.add(camera)` parenting — a point light is
 *   omnidirectional, so tracking position alone is visually identical, and it keeps
 *   the default camera out of the JSX scene graph
 * - BasisU transcoder path pinned to the r185 jsdelivr CDN (`setTranscoderPath`);
 *   the original resolves it relative to threejs.org's own `jsm/libs/basis/`
 * - Light `power` exposed as a leva slider (original hard-codes 1300 lm) — direct
 *   value controls per corpus convention
 * - DemoHelpers grid disabled: the original is a product shot on a flat #eeeeee
 *   backdrop, and the mat's base sits at y = -0.8, so a ground grid at y ≈ 0 would
 *   slice through the middle of the model
 */
import { Suspense, useRef } from 'react'
import { ReinhardToneMapping, type PointLight } from 'three/webgpu'
import { Canvas, useFrame } from '@react-three/fiber/webgpu'
import { useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { DemoHelpers } from '../../utils/DemoHelpers'

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/coffeemat.glb'
// BasisU transcoder (basis_transcoder.js + .wasm) — same r185 pin as the model.
const BASIS_TRANSCODER_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/jsm/libs/basis/'

// coffeemat.glb was produced from the source scene with `gltfpack -cc -tc`:
// Meshopt-compressed geometry (-cc) + KTX2/BasisU-compressed textures (-tc).
function CoffeeMat() {
  const { scene } = useGLTF(MODEL_URL, { draco: true, meshopt: true, ktx2: BASIS_TRANSCODER_PATH })
  return <primitive object={scene} position={[0, -0.8, 0]} scale={0.01} />
}

// The original parents this light to the camera (`camera.add(light)`); copying the
// camera position per frame is equivalent for an omnidirectional point light.
function Headlight({ power }: { power: number }) {
  const lightRef = useRef<PointLight>(null)
  useFrame(({ camera }) => {
    lightRef.current?.position.copy(camera.position)
  })
  return <pointLight ref={lightRef} color={0xffffff} power={power} />
}

export default function LoaderGltfCompressed() {
  const { power } = useControls('loader-gltf-compressed', {
    power: { value: 1300, min: 100, max: 4000, step: 10 },
  })

  return (
    <Canvas
      renderer={{ toneMapping: ReinhardToneMapping }}
      background="#eeeeee"
      camera={{ position: [2, 2, 2], fov: 50, near: 1, far: 20 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <CoffeeMat />
      </Suspense>
      <Headlight power={power} />
      <DemoHelpers grid={false} minDistance={3} maxDistance={6} />
    </Canvas>
  )
}
