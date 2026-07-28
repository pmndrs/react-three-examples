/**
 * textures-partialupdate
 * R3F port of three.js `webgpu_textures_partialupdate`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_textures_partialupdate (~90 lines of JS)
 *
 * DEMONSTRATES
 * - `renderer.copyTextureToTexture(src, dst, srcRegion, dstPosition)`: a GPU-side
 *   texture-to-texture blit that patches a rectangular region of a live texture
 *   WITHOUT re-uploading the whole image — the small `DataTexture` "patch" is the
 *   `src`, the plane's diffuse map is the `dst`
 * - A `DataTexture` whose CPU-side `Uint8Array` is rewritten and re-flagged
 *   (`needsUpdate = true`) every update tick, then blitted at a random position —
 *   the same technique a tiled-texture-streaming or minimap-overlay system would use
 * - `copyTextureToTexture` is declared identically on both the WebGL and WebGPU
 *   renderer types (`Renderer.d.ts`, common base class) — no B9 renderer-union cast
 *   needed here, unlike most WebGPU-only imperative calls in this corpus
 *
 * DIVERGENCE from original
 * - The original's `Timer`-gated `if (elapsedTime - last > 0.1)` becomes a plain
 *   `state.elapsed` threshold check inside `useFrame` — same cadence, no manual
 *   `Timer` instance to connect/disconnect
 * - Patch size (32px) and update interval (0.1s) exposed as leva controls instead of
 *   hardcoded constants — direct-value controls over hidden state, per corpus
 *   convention
 * - `renderer={{ toneMapping: NoToneMapping }}` explicit: the original renders with
 *   the WebGPURenderer default (no tone mapping set), and this demo is about exact
 *   texture-patch colors — fiber's ACESFilmic default would visibly shift them
 * - DemoHelpers grid disabled (a flat texture-mapped plane facing the camera has no
 *   ground plane to speak of); orbit controls stay on as harmless corpus baseline
 */
import { Suspense, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { Color, DataTexture, LinearFilter, MathUtils, NoToneMapping, SRGBColorSpace, Vector2 } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const DIFFUSE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/carbon/Carbon.png'

function PartialUpdatePlane({ patchSize, updateInterval }: { patchSize: number; updateInterval: number }) {
  const renderer = useThree((state) => state.renderer)
  const diffuseMap = useTexture(DIFFUSE_URL)

  useMemo(() => {
    diffuseMap.colorSpace = SRGBColorSpace
    diffuseMap.minFilter = LinearFilter
    diffuseMap.generateMipmaps = false
  }, [diffuseMap])

  // Non-node instance captured by the per-frame closure below — lazy useState keeps
  // identity stable across a StrictMode re-render (AGENTS.md: compute-particles-snow
  // pattern), even though nothing here is a create-once GPU kernel.
  const [dataTexture] = useState(() => {
    const data = new Uint8Array(patchSize * patchSize * 4)
    const tex = new DataTexture(data, patchSize, patchSize)
    tex.colorSpace = SRGBColorSpace
    return tex
  })
  const position = useMemo(() => new Vector2(), [])
  const color = useMemo(() => new Color(), [])
  const lastUpdate = useRef(0)

  useFrame((state) => {
    if (state.elapsed - lastUpdate.current < updateInterval) return
    lastUpdate.current = state.elapsed

    position.x = patchSize * MathUtils.randInt(1, 16) - patchSize
    position.y = patchSize * MathUtils.randInt(1, 16) - patchSize

    color.setHex(Math.random() * 0xffffff)
    const r = Math.floor(color.r * 255)
    const g = Math.floor(color.g * 255)
    const b = Math.floor(color.b * 255)

    const data = dataTexture.image.data as Uint8Array
    const size = patchSize * patchSize
    for (let i = 0; i < size; i++) {
      const stride = i * 4
      data[stride] = r
      data[stride + 1] = g
      data[stride + 2] = b
      data[stride + 3] = 255
    }
    dataTexture.needsUpdate = true

    renderer.copyTextureToTexture(dataTexture, diffuseMap, null, position)
  })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <meshBasicNodeMaterial map={diffuseMap} />
    </mesh>
  )
}

export default function TexturesPartialUpdate() {
  const { patchSize, updateInterval } = useControls('textures-partialupdate', {
    patchSize: { value: 32, min: 8, max: 64, step: 8, label: 'patch size (px)' },
    updateInterval: { value: 0.1, min: 0.02, max: 0.5, step: 0.02, label: 'update interval (s)' },
  })

  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 0, 2], fov: 70, near: 0.01, far: 10 }}
    >
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <PartialUpdatePlane patchSize={patchSize} updateInterval={updateInterval} />
      </Suspense>
      <DemoHelpers grid={false} minDistance={1} maxDistance={6} />
    </Canvas>
  )
}
