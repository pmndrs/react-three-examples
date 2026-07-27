/**
 * loader-gltf-compressed
 * R3F port of three.js `webgpu_loader_gltf_compressed`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_loader_gltf_compressed (~85 lines of JS)
 *
 * DEMONSTRATES
 * - Loading a gltfpack-compressed GLB (KTX2/BasisU compressed textures + Meshopt
 *   compressed geometry) through drei's `useGLTF` on the WebGPU path
 * - `useGLTF`'s `extendLoader` escape hatch: the one loader extension drei does NOT
 *   wire up itself is KTX2 — a `KTX2Loader` is created inside the callback, pointed at
 *   the r185 BasisU transcoder, and `detectSupport()`ed against the LIVE
 *   `WebGPURenderer` from `useThree` (safe here: fiber awaits `renderer.init()` before
 *   children render, and `detectSupport` probes GPU compressed-texture features via
 *   `renderer.hasFeature()`, which throws pre-init)
 * - `useGLTF`'s built-in Meshopt wiring: the third argument (`useMeshopt: true`)
 *   attaches `MeshoptDecoder`, replacing the original's manual
 *   `loader.setMeshoptDecoder(MeshoptDecoder)`
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
import { useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { ReinhardToneMapping, type PointLight } from 'three/webgpu'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { DemoHelpers } from '../utils/DemoHelpers'

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/coffeemat.glb'
// BasisU transcoder (basis_transcoder.js + .wasm) — same r185 pin as the model.
const BASIS_TRANSCODER_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/jsm/libs/basis/'

// coffeemat.glb was produced from the source scene with `gltfpack -cc -tc`:
// Meshopt-compressed geometry (-cc) + KTX2/BasisU-compressed textures (-tc).
// Draco (arg 2) and Meshopt (arg 3) are wired by drei itself; KTX2 needs the
// extendLoader escape hatch. detectSupport() reads the initialized renderer's
// compressed-texture capabilities to pick the BasisU transcode target.
function CoffeeMat() {
  const renderer = useThree((s) => s.renderer)
  const { scene } = useGLTF(MODEL_URL, true, true, (loader) => {
    loader.setKTX2Loader(new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_PATH).detectSupport(renderer))
  })
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
      camera={{ position: [2, 2, 2], fov: 50, near: 1, far: 20 }}
    >
      <CoffeeMat />
      <Headlight power={power} />
      <DemoHelpers grid={false} minDistance={3} maxDistance={6} />
    </Canvas>
  )
}
