/**
 * textures-2d-array
 * R3F port of three.js `webgpu_textures_2d-array`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_textures_2d-array (~85 lines of JS)
 *
 * DEMONSTRATES
 * - `THREE.DataArrayTexture`: a single-channel (RedFormat) CT-scan volume — 109
 *   slices of 256x256 — uploaded as one GPU array texture, no per-slice textures
 * - `texture(map, uv).depth(layerNode)`: TSL's array-layer selector, driven here by
 *   a continuously oscillating layer index rather than a fixed constant
 * - TSL builtins composed directly in the color node, zero JS-side uniform plumbing
 *   (AGENTS.md: prefer builtins over hand-driven uniforms) — `oscTriangle(time)`
 *   produces a [-1, 1] triangle wave, remapped to `[0, depth)` to sweep back and
 *   forth through the volume's layers every frame
 * - `.remap(0, 1, -0.1, 1.8)`: TSL's remap helper pushed OUTSIDE the safe [0, 1]
 *   range on purpose, punching up contrast on the (mostly dark) medical scan data
 * - `useZippedVolumeData` (`src/utils/useZippedVolumeData.ts`): a Suspense-friendly
 *   drei-gap-filler hook that loads + unzips the original's zip-archived raw volume
 *
 * DIVERGENCE from original
 * - The original's own resize/aspect handling is fiber's default — no manual
 *   `window.addEventListener('resize', ...)`
 * - `renderer={{ toneMapping: NoToneMapping }}` explicit: the remap already pushes
 *   the signal outside [0, 1] for contrast; fiber's ACESFilmic default would
 *   recompress exactly the range the remap widened
 * - DemoHelpers grid disabled (a flat volume-slice plane facing the camera, like
 *   `textures-partialupdate` — no ground plane in the original)
 */
import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { oscTriangle, texture, time, uv } from 'three/tsl'
import { DataArrayTexture, NoToneMapping, RedFormat } from 'three/webgpu'
import { useZippedVolumeData } from '../utils/useZippedVolumeData'
import { DemoHelpers } from '../utils/DemoHelpers'

const VOLUME_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/3d/head256x256x109.zip'
const VOLUME_ENTRY = 'head256x256x109'
const SIZE = { width: 256, height: 256, depth: 109 }
const PLANE_SIZE = 50

function HeadSlicePlane() {
  const data = useZippedVolumeData(VOLUME_URL, VOLUME_ENTRY)

  const map = useMemo(() => {
    const tex = new DataArrayTexture(data, SIZE.width, SIZE.height, SIZE.depth)
    tex.format = RedFormat
    tex.needsUpdate = true
    return tex
  }, [data])

  // Triangle-wave [-1, 1] -> [0, 1] -> [0, depth): sweeps back and forth through
  // every layer once every ~2s (oscTriangle's default period), a TSL builtin
  // driving the whole animation with no per-frame JS.
  const oscLayers = oscTriangle(time.mul(0.5)).add(1).mul(0.5).mul(SIZE.depth)
  const colorNode = texture(map, uv().flipY()).depth(oscLayers).r.remap(0, 1, -0.1, 1.8)

  return (
    <mesh>
      <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
      <meshBasicNodeMaterial colorNode={colorNode} />
    </mesh>
  )
}

export default function TexturesArray2D() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 0, 70], fov: 45, near: 0.1, far: 2000 }}
    >
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <HeadSlicePlane />
      </Suspense>
      <DemoHelpers grid={false} minDistance={20} maxDistance={200} />
    </Canvas>
  )
}
