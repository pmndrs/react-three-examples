/**
 * lights-projector
 * R3F port of three.js `webgpu_lights_projector`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_lights_projector (~230 lines of JS)
 *
 * DEMONSTRATES
 * - `ProjectorLight` (WebGPURenderer-only, `three/webgpu`, extends `SpotLight`):
 *   projects either a procedural TSL color graph, a `VideoTexture`, or a static image
 *   through its cone — three different "gel" sources swapped at runtime via leva,
 *   mirroring the original's GUI `type` dropdown
 * - `light.colorNode = Fn(([lightCoord]) => …)`: the renderer calls this function with
 *   the light's own projected UV coordinate every fragment
 *   (`SpotLightNode.setupDirect`, verified in `reference/three.js/src/nodes/lighting/
 *   SpotLightNode.js`) — a procedural caustic effect (`mx_worley_noise_float` animated
 *   by `time`) becomes the projected "gel" with zero texture upload, the TSL
 *   equivalent of a procedural gobo
 * - Same helper/orbit/PLY-statue rig as `lights-spotlight` (`SpotLightHelper` as a real
 *   child of the light, `PLYLoader` for the Lucy statue) — reused near-verbatim to show
 *   how directly `ProjectorLight` drops into the existing `SpotLight` rig shape
 *
 * DIVERGENCE from original
 * - `light.colorNode` is assigned through a cast — `@types/three` doesn't declare
 *   `colorNode` on `Light`/`SpotLight` (duck-typed, read generically by
 *   `SpotLightNode.setupDirect`); same cast-with-comment convention as the
 *   `scene.fogNode` gap documented in `sprites`/`lights-selective`
 * - `shadow.focus` is a plain leva slider (starts at `1`, the procedural default)
 *   instead of auto-snapping per `type` like the original's GUI `onChange` handlers —
 *   simpler two-way binding; the user can retune it by hand after switching to video
 *   (whose ideal focus, ~0.46, differs from the procedural/texture default)
 * - Video source is `sintel.mp4` only (no `.ogv` fallback source) — Chromium (this
 *   corpus's target/test browser) plays H.264 mp4 natively, so the original's
 *   multi-`<source>` fallback has no effect here
 * - OrbitControls -> this repo's CameraControls (via DemoHelpers), same
 *   target/min/max distance and `maxPolarAngle={Math.PI / 2}`
 * - `renderer={{ toneMapping: ACESFilmicToneMapping }}` — matches the original's
 *   explicit `renderer.toneMapping` assignment (this is fiber's `Canvas` default
 *   anyway, but stated explicitly per AGENTS.md's tone-mapping rule)
 * - DemoHelpers grid disabled (`grid={false}`) — the original's own floor plane IS the
 *   shadow/projection receiver this example is about
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { folder, useControls } from 'leva'
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js'
import { Fn, color, mx_worley_noise_float, time } from 'three/tsl'
import {
  ACESFilmicToneMapping,
  CameraHelper,
  LinearFilter,
  SRGBColorSpace,
  SpotLightHelper,
  VideoTexture,
} from 'three/webgpu'
import type { Node, ProjectorLight as ProjectorLightImpl, Texture } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const TEXTURE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/'
const COLORS_URL = `${TEXTURE_BASE}colors.png`
const VIDEO_URL = `${TEXTURE_BASE}sintel.mp4`
const LUCY_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/ply/binary/Lucy100k.ply'

type ProjectionType = 'procedural' | 'video' | 'texture'

// Stanford Lucy statue: same geometry-only PLY as lights-spotlight, no baked normals.
function Lucy() {
  const raw = useLoader(PLYLoader, LUCY_URL)

  const geometry = useMemo(() => {
    const geo = raw.clone()
    geo.scale(0.0024, 0.0024, 0.0024)
    geo.computeVertexNormals()
    return geo
  }, [raw])

  return (
    <mesh geometry={geometry} rotation-y={-Math.PI / 2} position={[0, 0.8, 0]} castShadow receiveShadow>
      <meshLambertMaterial />
    </mesh>
  )
}

function Floor() {
  return (
    <mesh position={[0, -1, 0]} rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[200, 200]} />
      <meshLambertMaterial color="#bcbcbc" />
    </mesh>
  )
}

interface ProjectorRigProps {
  type: ProjectionType
  color: string
  intensity: number
  distance: number
  angle: number
  penumbra: number
  decay: number
  focus: number
  helpers: boolean
}

// The projector light itself: orbits the statue at the original's fixed rate, projects
// one of three "gel" sources through its cone (see header DEMONSTRATES), and carries
// two three.js-core helpers as real scene-graph children (same pattern as
// lights-spotlight).
function ProjectorRig({ type, color: lightColor, intensity, distance, angle, penumbra, decay, focus, helpers }: ProjectorRigProps) {
  const lightRef = useRef<ProjectorLightImpl>(null)
  const helperPairRef = useRef<{ spot: SpotLightHelper; shadowCam: CameraHelper } | null>(null)
  const colorsTexture = useTexture(COLORS_URL)

  // Procedural caustic "gel": the renderer calls this with the light's own projected
  // UV every fragment (see header DEMONSTRATES). Built once — a pure TSL graph
  // template, not per-instance state.
  const causticEffect = useMemo(
    () =>
      Fn(([lightCoord]) => {
        // Fn's destructured param types as bare ShaderNodeObject<Node> (AGENTS.md B10
        // cast family) — the light passes its vec3 projected coordinate here.
        const projectorUV = lightCoord as unknown as Node<'vec3'>
        const waterLayer0 = mx_worley_noise_float(projectorUV.mul(10).add(time)).pow(2)
        return waterLayer0.mul(color('#5abcd8')).mul(2)
      }),
    [],
  )

  const [videoTexture] = useState(() => {
    const video = document.createElement('video')
    video.src = VIDEO_URL
    video.loop = true
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'
    return new VideoTexture(video)
  })

  useEffect(() => {
    colorsTexture.minFilter = LinearFilter
    colorsTexture.magFilter = LinearFilter
    colorsTexture.generateMipmaps = false
    colorsTexture.colorSpace = SRGBColorSpace
  }, [colorsTexture])

  // Swap the projected "gel" source — see header DEMONSTRATES/DIVERGENCE.
  useEffect(() => {
    const light = lightRef.current
    if (!light) return
    const nodeLight = light as unknown as { colorNode: typeof causticEffect | null }

    nodeLight.colorNode = null
    light.map = null
    videoTexture.image.pause()

    if (type === 'procedural') {
      nodeLight.colorNode = causticEffect
    } else if (type === 'video') {
      light.map = videoTexture as unknown as Texture
      videoTexture.image.play().catch(() => {})
    } else {
      light.map = colorsTexture as Texture
    }
  }, [type, causticEffect, videoTexture, colorsTexture])

  useEffect(() => {
    const light = lightRef.current
    if (!light) return
    light.shadow.focus = focus
  }, [focus])

  // Mount once: attach both helpers as real children of the light — see
  // lights-spotlight header DEMONSTRATES.
  useEffect(() => {
    const light = lightRef.current
    if (!light) return

    const spot = new SpotLightHelper(light)
    const shadowCam = new CameraHelper(light.shadow.camera)
    light.add(spot)
    light.add(shadowCam)
    helperPairRef.current = { spot, shadowCam }

    return () => {
      light.remove(spot)
      light.remove(shadowCam)
      spot.dispose()
      helperPairRef.current = null
    }
  }, [])

  useEffect(() => {
    const pair = helperPairRef.current
    if (!pair) return
    pair.spot.visible = helpers
    pair.shadowCam.visible = helpers
  }, [helpers])

  useFrame((state) => {
    const light = lightRef.current
    if (!light) return
    const t = state.time / 3000
    light.position.x = Math.cos(t) * 2.5
    light.position.z = Math.sin(t) * 2.5

    const pair = helperPairRef.current
    pair?.spot.update()
    pair?.shadowCam.update()
  })

  return (
    <projectorLight
      ref={lightRef}
      color={lightColor}
      intensity={intensity}
      position={[2.5, 5, 2.5]}
      angle={angle}
      penumbra={penumbra}
      decay={decay}
      distance={distance}
      castShadow
      shadow-mapSize-width={1024}
      shadow-mapSize-height={1024}
      shadow-camera-near={1}
      shadow-camera-far={10}
    />
  )
}

export default function LightsProjector() {
  const { type, color, intensity, distance, angle, penumbra, decay, focus, helpers } = useControls(
    'lights-projector',
    {
      type: { value: 'procedural' as ProjectionType, options: ['procedural', 'video', 'texture'] as ProjectionType[] },
      light: folder({
        color: '#ffffff',
        intensity: { value: 100, min: 0, max: 500, step: 5 },
        distance: { value: 0, min: 0, max: 20, step: 0.5 },
        angle: { value: Math.PI / 6, min: 0, max: Math.PI / 3, step: 0.01 },
        penumbra: { value: 1, min: 0, max: 1, step: 0.01 },
        decay: { value: 2, min: 1, max: 2, step: 0.01 },
      }),
      shadow: folder({
        focus: { value: 1, min: 0, max: 1, step: 0.01 },
      }),
      helpers: false,
    },
  )

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      shadows
      background="#000000"
      camera={{ position: [7, 4, 1], fov: 40, near: 0.1, far: 100 }}
    >
      <hemisphereLight color="#ffffff" groundColor="#8d8d8d" intensity={0.15} />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <ProjectorRig
          type={type as ProjectionType}
          color={color}
          intensity={intensity}
          distance={distance}
          angle={angle}
          penumbra={penumbra}
          decay={decay}
          focus={focus}
          helpers={helpers}
        />
        <Floor />
        <Lucy />
      </Suspense>
      <DemoHelpers
        grid={false}
        target={[0, 1, 0]}
        minDistance={2}
        maxDistance={10}
        maxPolarAngle={Math.PI / 2}
      />
    </Canvas>
  )
}
