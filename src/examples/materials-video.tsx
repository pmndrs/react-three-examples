/**
 * materials-video
 * R3F port of three.js `webgpu_materials_video`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materials_video (~130 lines of JS)
 *
 * DEMONSTRATES
 * - drei's `useVideoTexture` (`/webgpu`) replacing the original's hand-rolled
 *   `<video>` element + `THREE.VideoTexture` + `play()`/`loadedmetadata` bookkeeping —
 *   one suspending hook returns a live `THREE.VideoTexture` that three.js refreshes
 *   from the current frame every render, same zero-manual-`needsUpdate` deal as
 *   `video-panorama`
 * - A 20x10 grid of `BoxGeometry`s, each with its UVs shifted to sample one tile of the
 *   shared video texture (`change_uvs` from the original, ported verbatim as one-time
 *   per-cell geometry math) — 200 independent meshes/materials tiling a single texture,
 *   not 200 texture fetches
 * - Per-mesh HSL color cycling driven from `state.elapsed` (reference-node-backed
 *   `MeshPhongMaterial.color`, no uniform plumbing) composited with `map` — the video
 *   is tinted, not replaced, per cell
 *
 * DIVERGENCE from original
 * - Camera sway is ported from the original's manual `mousemove` + easing (camera
 *   drifts toward the pointer, always `lookAt`s the origin) using fiber's
 *   `state.pointer`/`state.size` inside a plain `useFrame` (no render-phase takeover
 *   needed here — only camera transform, not custom scissor/multi-scene rendering).
 *   DemoHelpers controls are disabled (`controls={false}`) so CameraControls' own
 *   per-frame `update()` doesn't fight the manual position writes
 * - The per-cell drift/rotation (`counter % 1000` pause-then-drift-then-reverse cycle)
 *   is ported as an integer frame counter, matching the original's frame-coupled
 *   cadence exactly rather than delta-scaling it — the original's own animation reads
 *   as "pulses of drift" specifically because it's frame-counted, not time-based;
 *   delta-scaling would change the character of the motion
 * - Only the `.mp4` source is hotlinked (no `.ogv` fallback) — Chromium/WebGPU only,
 *   same call as `video-panorama`
 * - No leva controls: every dynamic input in the original (drift, color cycle, camera
 *   sway) runs unconditionally with no exposed parameters
 */
import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber/webgpu'
import { useVideoTexture } from '@react-three/drei/webgpu'
import { BoxGeometry, Color, type Mesh } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const VIDEO_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/sintel.mp4'

const XGRID = 20
const YGRID = 10
const XSIZE = 480 / XGRID
const YSIZE = 204 / YGRID

interface Cell {
  geometry: BoxGeometry
  hue: number
  saturation: number
  position: [number, number, number]
  dx: number
  dy: number
}

// Shifts a BoxGeometry's UVs to sample one (ox, oy) tile of a unit-UV video texture —
// ported verbatim from the original's `change_uvs`.
function shiftUVs(geometry: BoxGeometry, unitX: number, unitY: number, offsetX: number, offsetY: number) {
  const uv = geometry.attributes.uv
  const array = uv.array as Float32Array
  for (let i = 0; i < array.length; i += 2) {
    array[i] = (array[i] + offsetX) * unitX
    array[i + 1] = (array[i + 1] + offsetY) * unitY
  }
  uv.needsUpdate = true
}

function VideoGrid() {
  const texture = useVideoTexture(VIDEO_URL, { muted: true, loop: true, crossOrigin: 'anonymous' })

  const cells = useMemo<Cell[]>(() => {
    const ux = 1 / XGRID
    const uy = 1 / YGRID
    const list: Cell[] = []
    for (let i = 0; i < XGRID; i++) {
      for (let j = 0; j < YGRID; j++) {
        const geometry = new BoxGeometry(XSIZE, YSIZE, XSIZE)
        shiftUVs(geometry, ux, uy, i, j)
        list.push({
          geometry,
          hue: i / XGRID,
          saturation: 1 - j / YGRID,
          position: [(i - XGRID / 2) * XSIZE, (j - YGRID / 2) * YSIZE, 0],
          dx: 0.001 * (0.5 - Math.random()),
          dy: 0.001 * (0.5 - Math.random()),
        })
      }
    }
    return list
  }, [])

  const meshRefs = useRef<(Mesh | null)[]>([])
  const counter = useRef(1)
  const color = useMemo(() => new Color(), [])

  useFrame((state) => {
    const time = state.elapsed * 0.05 // matches Date.now() * 0.00005
    const active = counter.current % 1000 > 200
    const flip = counter.current % 1000 === 0

    for (let i = 0; i < cells.length; i++) {
      const mesh = meshRefs.current[i]
      if (!mesh) continue
      const cell = cells[i]

      const hue = ((360 * (cell.hue + time)) % 360) / 360
      color.setHSL(hue, cell.saturation, 0.5)
      // meshPhongNodeMaterial isn't exported from `three/webgpu`'s type surface
      // (only the runtime JSX intrinsic + node-property interface are — B11-family
      // gap); each mesh here only ever carries a single MeshPhongNodeMaterial.
      const material = mesh.material as unknown as { color: Color }
      material.color.copy(color)

      if (active) {
        mesh.rotation.x += 10 * cell.dx
        mesh.rotation.y += 10 * cell.dy
        mesh.position.x -= 150 * cell.dx
        mesh.position.y += 150 * cell.dy
        mesh.position.z += 300 * cell.dx
      }
      if (flip) {
        cell.dx *= -1
        cell.dy *= -1
      }
    }

    counter.current += 1

    // Camera sway toward the pointer, always looking at the origin (original:
    // mousemove-driven easing; state.pointer is NDC (-1..1, y-up), rescaled to the
    // original's pixel-offset-from-center math).
    const { width, height } = state.size
    const camera = state.camera
    const targetX = state.pointer.x * (width / 2)
    const targetY = state.pointer.y * (height / 2) * 0.3
    camera.position.x += (targetX - camera.position.x) * 0.05
    camera.position.y += (targetY - camera.position.y) * 0.05
    camera.lookAt(0, 0, 0)
  })

  return (
    <>
      {cells.map((cell, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshRefs.current[i] = m
          }}
          geometry={cell.geometry}
          position={cell.position}
        >
          <meshPhongNodeMaterial map={texture} />
        </mesh>
      ))}
    </>
  )
}

export default function MaterialsVideo() {
  return (
    <Canvas renderer camera={{ position: [0, 0, 500], fov: 40, near: 1, far: 10000 }}>
      <directionalLight position={[0.5, 1, 1]} intensity={7} />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <VideoGrid />
      </Suspense>
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  )
}
