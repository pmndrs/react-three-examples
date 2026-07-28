/**
 * textures-2d-array-compressed
 * R3F port of three.js `webgpu_textures_2d-array_compressed`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_textures_2d-array_compressed (~100 lines of JS)
 *
 * DEMONSTRATES
 * - drei's `useKTX2` (`@react-three/drei/webgpu`): a compressed KTX2/BasisU texture
 *   ARRAY (a short animated clip, one frame per array layer) loaded, Suspense-gated,
 *   and `detectSupport()`-wired against the live `WebGPURenderer` in one hook call —
 *   the standalone-texture sibling of `loader-gltf-compressed`'s manual
 *   `KTX2Loader` + `extendLoader` wiring (that port predates `useKTX2` landing in
 *   this repo's drei alpha; this one shows the hook doing the same job with zero
 *   boilerplate)
 * - `texture(map, uv).depth(layerNode)` again (`textures-2d-array`'s sibling), this
 *   time on a `CompressedArrayTexture` instead of a `DataArrayTexture` — the same
 *   TSL accessor works identically across both texture kinds
 * - A frame-ramp layer index driven entirely by the TSL `time` builtin
 *   (`time.mul(rate).mod(layerCount)`) instead of the original's JS `Timer` +
 *   per-frame `uniform.value =` write — AGENTS.md's "prefer TSL builtins over
 *   hand-driven uniforms" applied to a case the original itself didn't
 *
 * DIVERGENCE from original
 * - The original increments a JS-side `uniform(0)` every frame via a `THREE.Timer`
 *   (`depthStep += delta * 10; uniform.value = depthStep % 5`). Ported as a pure TSL
 *   expression on the builtin `time` node — same linear ramp-and-wrap motion, no
 *   JS-side clock or uniform write per frame. `layerCount` is read once (JS-side,
 *   from `texture.image.depth`) when the color node is built, not re-read per frame.
 * - Ramp rate exposed as a leva control (`layersPerSecond`, default 2 ≈ the
 *   original's `10 / 5` layers-per-second pace) instead of a hardcoded constant
 * - `renderer={{ toneMapping: NoToneMapping }}` explicit — the original renders with
 *   the WebGPURenderer default (no tone mapping configured)
 * - DemoHelpers grid disabled (flat texture-mapped plane facing the camera, no
 *   ground plane in the original — same rationale as the two sibling texture ports)
 */
import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useKTX2 } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { texture, time, uv } from 'three/tsl'
import { NoToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const KTX2_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/spiritedaway.ktx2'
// Pinned to the r185 CDN release, same convention as loader-gltf-compressed's
// BasisU transcoder path (not drei's default drei-assets CDN).
const BASIS_TRANSCODER_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/jsm/libs/basis/'
const PLANE_WIDTH = 50
const PLANE_HEIGHT = 25

function AnimatedClipPlane({ layersPerSecond }: { layersPerSecond: number }) {
  const map = useKTX2(KTX2_URL, BASIS_TRANSCODER_PATH)
  // drei's `useKTX2` types the result's `image` as `unknown` (it can't know what the
  // transcoder produced); a KTX2 array texture's image carries the layer count.
  const layerCount = (map.image as { depth: number }).depth

  // Linear ramp through [0, layerCount) that wraps — the TSL-builtin replacement for
  // the original's JS `Timer` + per-frame `uniform.value = depthStep % 5` (see
  // DIVERGENCE). `layerCount` is a plain JS number read once the texture is loaded,
  // embedded as a literal into the graph below (not a uniform — it never changes).
  const layerNode = useMemo(
    () => time.mul(layersPerSecond).mod(layerCount),
    [layersPerSecond, layerCount],
  )
  const colorNode = texture(map, uv().flipY()).depth(layerNode)

  return (
    <mesh>
      <planeGeometry args={[PLANE_WIDTH, PLANE_HEIGHT]} />
      <meshBasicNodeMaterial colorNode={colorNode} />
    </mesh>
  )
}

export default function TexturesArray2DCompressed() {
  const { layersPerSecond } = useControls('textures-2d-array-compressed', {
    layersPerSecond: { value: 2, min: 0.5, max: 10, step: 0.5, label: 'layers / second' },
  })

  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 0, 70], fov: 45, near: 0.1, far: 2000 }}
    >
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <AnimatedClipPlane layersPerSecond={layersPerSecond} />
      </Suspense>
      <DemoHelpers grid={false} minDistance={20} maxDistance={200} />
    </Canvas>
  )
}
