/**
 * video-panorama
 * R3F port of three.js `webgpu_video_panorama`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_video_panorama (~100 lines of JS)
 *
 * DEMONSTRATES
 * - `THREE.VideoTexture` driving a `meshBasicNodeMaterial`'s `map` from a plain
 *   `HTMLVideoElement` — three.js refreshes the GPU texture from the video's current
 *   frame every render, no manual `needsUpdate` bookkeeping required
 * - The inverted-sphere equirectangular-panorama trick: `geometry.scale(-1, 1, 1)`
 *   baked into the geometry (not a mesh-level transform — see DIVERGENCE) so the
 *   camera, sitting inside the sphere, sees correctly-oriented front faces instead of
 *   the culled back faces (and un-mirrored UVs) a plain sphere would show from inside
 * - Locked-orbit CameraControls (`minDistance === maxDistance`, `pan={false}`) to
 *   reproduce the original's hand-rolled lon/lat pointer-drag math — same
 *   "camera orbits in place at the sphere's center" pattern as the `sky` port
 *
 * DIVERGENCE from original
 * - Geometry inversion must stay a ONE-TIME bake on the `BufferGeometry` (matching the
 *   original's `geometry.scale(-1, 1, 1)` exactly), not a `<mesh scale={[-1, 1, 1]}>`
 *   transform: three's renderer compensates negative-determinant object matrices by
 *   flipping the front-face winding, which would cancel the mirror and bring back the
 *   culled-from-inside black sphere. Built once via `useMemo` + `<primitive attach="geometry">`.
 * - Original mouse-drag math (manual `lon`/`lat` + pointerdown/move/up listeners)
 *   replaced with CameraControls' built-in orbit-rotate, dolly/pan locked (see
 *   DEMONSTRATES) — no bespoke pointer plumbing needed
 * - The `<video>` element is created imperatively in a `useMemo` (not JSX/DOM), with
 *   `muted` + `playsInline` set explicitly alongside `loop`/`crossOrigin`: the original
 *   HTML tag has `muted playsinline` baked in, easy to lose once the element is
 *   constructed in JS. This combination is load-bearing, not cosmetic — every
 *   evergreen browser (and headless Chromium under the Playwright smoke suite) blocks
 *   autoplay-with-sound without a prior user gesture; muted+playsInline is the one
 *   combination that autoplays reliably without one. `.play()`'s rejection is caught
 *   defensively in case a stricter environment still blocks it.
 * - Only the `.webm` source is hotlinked (no `.mp4` fallback `<source>`) — this port
 *   targets Chromium/WebGPU only, so the original's dual-format fallback carries no
 *   information here
 * - DemoHelpers grid disabled (`grid={false}`) — a ground grid would cut across an
 *   inverted sphere meant to fill the whole frame like a skybox
 * - No leva controls: the only dynamic input in the original is the pointer-drag look
 *   direction, already interactive via CameraControls — there's no extra parameter
 *   worth exposing (same call as `rtt`)
 */
import { useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { SRGBColorSpace, SphereGeometry, VideoTexture } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const VIDEO_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/pano.webm'

// Fixed at the original's `distance = 0.5`: locks CameraControls' dolly range so the
// camera only orbits in place at the sphere's center, matching
// `camera.position = distance * sphericalDir(phi, theta); camera.lookAt(0, 0, 0)`.
const CAMERA_DISTANCE = 0.5
const CAMERA_POSITION: [number, number, number] = [CAMERA_DISTANCE, 0, 0]

function VideoPanoramaSphere() {
  const video = useMemo(() => {
    const el = document.createElement('video')
    el.loop = true
    el.muted = true
    el.playsInline = true
    el.crossOrigin = 'anonymous'
    el.src = VIDEO_URL
    return el
  }, [])

  useEffect(() => {
    // Muted autoplay is allowed without a prior user gesture in every evergreen
    // browser, including headless Chromium under Playwright; .catch() is defensive
    // only (see DIVERGENCE).
    video.play().catch(() => {})
    return () => {
      video.pause()
      video.src = ''
    }
  }, [video])

  const texture = useMemo(() => {
    const t = new VideoTexture(video)
    t.colorSpace = SRGBColorSpace
    return t
  }, [video])

  // Baked (not a mesh transform) — see DIVERGENCE for why the distinction matters.
  const geometry = useMemo(() => {
    const geo = new SphereGeometry(5, 60, 40)
    geo.scale(-1, 1, 1)
    return geo
  }, [])

  useEffect(() => {
    return () => {
      geometry.dispose()
      texture.dispose()
    }
  }, [geometry, texture])

  return (
    <mesh>
      <primitive object={geometry} attach="geometry" />
      <meshBasicNodeMaterial map={texture} />
    </mesh>
  )
}

export default function VideoPanorama() {
  return (
    <Canvas
      renderer
      camera={{ position: CAMERA_POSITION, fov: 75, near: 0.25, far: 10 }}
    >
      <VideoPanoramaSphere />
      <DemoHelpers grid={false} minDistance={CAMERA_DISTANCE} maxDistance={CAMERA_DISTANCE} pan={false} />
    </Canvas>
  )
}
