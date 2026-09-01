/**
 * tsl-earth
 * R3F port of three.js `webgpu_tsl_earth`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_tsl_earth (~156 lines of JS)
 *
 * DEMONSTRATES
 * - A physically-inspired day/night/atmosphere blend built entirely from TSL math on
 *   `MeshStandardNodeMaterial.outputNode`: the material's own PBR-lit `output` (driven
 *   by a real `<directionalLight>`) is mixed against a night-lights texture and a
 *   Fresnel-driven atmosphere rim color, gated by a hand-computed `sunOrientation`
 *   (`normalWorldGeometry · normalize(sunDirection)`) that has to track the light's
 *   actual position for the two to line up
 * - One packed texture (`earth_bump_roughness_clouds`) read through three separate
 *   channel swizzles (`.r`/`.g`/`.b`) to drive bump height, roughness, and cloud mask
 *   from a single sample — `bumpMap()` composes directly into `normalNode`
 * - A second, cheaper `MeshBasicNodeMaterial` (back-face atmosphere shell) sharing the
 *   same `sunOrientation`/`fresnel`/`atmosphereColor` node graph as the globe, so the
 *   rim glow and the day/night terminator stay in lock-step with one source of truth
 * - fiber's `useUniforms` feeding the four leva-controlled values (two colors, two
 *   roughness bounds) straight into the node graph — the WebGPU tsl-hooks pattern used
 *   throughout this repo instead of the original's `renderer.inspector` GUI
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` panel becomes leva controls
 *   (`atmosphereDayColor`, `atmosphereTwilightColor`, `roughnessLow`, `roughnessHigh`) —
 *   same four parameters, same defaults
 * - Added a `rotationSpeed` leva control (multiplies the original's hardcoded
 *   `delta * 0.025` spin) — the rest of this repo's ports expose an animation-rate knob
 *   rather than hiding it, and it's a free addition on top of an otherwise 1:1 rotation
 * - Globe + atmosphere mesh, both materials, and the shared sphere geometry are built
 *   imperatively in one `useMemo` (mirroring the original's `init()` almost line-for-
 *   line) rather than decomposed into JSX node-material props — the node graph has too
 *   many shared intermediate terms (`fresnel`, `sunOrientation`, `atmosphereColor`) to
 *   split across two declarative materials without duplicating the math
 * - DemoHelpers grid disabled (`grid={false}`) — the original is a globe in a black
 *   void with no ground plane; dolly range set to the original OrbitControls'
 *   `minDistance`/`maxDistance` (0.1 / 50)
 */
import { Suspense, useRef } from 'react'
import { bumpMap, cameraPosition, max, mix, normalWorldGeometry, normalize, output, positionWorld, step, texture, uv, vec3, vec4 } from 'three/tsl'
import { BackSide, SRGBColorSpace } from 'three/webgpu'
import type { Mesh } from 'three/webgpu'
import { Canvas, useFrame, useLocalNodes, useTexture, useUniforms } from '@react-three/fiber/webgpu'
import { folder, useControls } from 'leva'
import { DemoHelpers } from '../../utils/DemoHelpers'

const TEXTURE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/planets'
const DAY_URL = `${TEXTURE_BASE}/earth_day_4096.jpg`
const NIGHT_URL = `${TEXTURE_BASE}/earth_night_4096.jpg`
const BUMP_ROUGHNESS_CLOUDS_URL = `${TEXTURE_BASE}/earth_bump_roughness_clouds_4096.jpg`

// Static sun direction — shared between the real `<directionalLight>` (drives the
// material's standard PBR lighting into `output`) and the hand-rolled `sunOrientation`
// term below (drives the night/atmosphere blend). Both must agree for the terminator to
// line up, so this one constant feeds both.
const SUN_POSITION: [number, number, number] = [0, 0, 3]
const CAMERA_POSITION: [number, number, number] = [4.5, 2, 3]

function Globe() {
  //* Controls =====================================================
  const { rotationSpeed, ...uniformValues } = useControls('tsl-earth', {
    atmosphere: folder({
      uDayColor: { value: '#4db2ff', label: 'day color' },
      uTwilightColor: { value: '#bc490b', label: 'twilight color' },
    }),
    roughness: folder({
      uRoughnessLow: { value: 0.25, min: 0, max: 1, step: 0.001, label: 'low' },
      uRoughnessHigh: { value: 0.35, min: 0, max: 1, step: 0.001, label: 'high' },
    }),
    rotationSpeed: { value: 1, min: 0, max: 3, step: 0.05 },
  })

  const { uDayColor, uTwilightColor, uRoughnessLow, uRoughnessHigh } = useUniforms(
    uniformValues,
    'earth',
  )

  const textures = useTexture({
    day: DAY_URL,
    night: NIGHT_URL,
    bumpRoughnessClouds: BUMP_ROUGHNESS_CLOUDS_URL,
  })

  //* Refs ---------------
  const globeRef = useRef<Mesh>(null);
  const atmosphereRef = useRef<Mesh>(null);


  //* Nodes ---------------
  const { globeColorNode, globeRoughnessNode, globeNormalNode, globeOutputNode, atmosphereOutputNode } =
    useLocalNodes(() => {
      // Color-critical textures need sRGB decoding; the packed bump/roughness/clouds
      // texture is data, not color, so it is left in its default color space.
      textures.day.colorSpace = SRGBColorSpace
      textures.day.anisotropy = 8
      textures.night.colorSpace = SRGBColorSpace
      textures.night.anisotropy = 8
      textures.bumpRoughnessClouds.anisotropy = 8

      const viewDirection = positionWorld.sub(cameraPosition).normalize()
      const fresnel = viewDirection.dot(normalWorldGeometry).abs().oneMinus().toVar()
      const sunOrientation = normalWorldGeometry.dot(normalize(vec3(...SUN_POSITION))).toVar()
      const atmosphereColor = mix(uTwilightColor, uDayColor, sunOrientation.smoothstep(-0.25, 0.75))

      // Globe
      const cloudsStrength = texture(textures.bumpRoughnessClouds, uv()).b.smoothstep(0.2, 1)
      const globeColorNode = mix(texture(textures.day), vec3(1), cloudsStrength.mul(2))

      const roughness = max(texture(textures.bumpRoughnessClouds).g, step(0.01, cloudsStrength))
      const globeRoughnessNode = roughness.remap(0, 1, uRoughnessLow, uRoughnessHigh)

      const night = texture(textures.night)
      const dayStrength = sunOrientation.smoothstep(-0.25, 0.5)

      const atmosphereDayStrength = sunOrientation.smoothstep(-0.5, 1)
      const atmosphereMix = atmosphereDayStrength.mul(fresnel.pow(2)).clamp(0, 1)

      const finalOutput = mix(mix(night.rgb, output.rgb, dayStrength), atmosphereColor, atmosphereMix)
      const globeOutputNode = vec4(finalOutput, output.a)

      const bumpElevation = max(texture(textures.bumpRoughnessClouds).r, cloudsStrength)
      const globeNormalNode = bumpMap(bumpElevation)

      // Atmosphere
      const alpha = fresnel.remap(0.73, 1, 1, 0).pow(3).mul(sunOrientation.smoothstep(-0.5, 1))
      const atmosphereOutputNode = vec4(atmosphereColor, alpha)

      return { globeColorNode, globeRoughnessNode, globeNormalNode, globeOutputNode, atmosphereOutputNode }
    })

  useFrame(({ delta }) => {
    if (globeRef.current) globeRef.current.rotation.y += delta * 0.025 * rotationSpeed
  })

  return (
    <>
      <mesh ref={globeRef}>
        <sphereGeometry  args={[1, 64, 64]} />
        <meshStandardNodeMaterial
          colorNode={globeColorNode}
          roughnessNode={globeRoughnessNode}
          normalNode={globeNormalNode}
          outputNode={globeOutputNode}
        />
      </mesh>
      <mesh ref={atmosphereRef} scale={1.04}>
        <sphereGeometry />
        <meshBasicNodeMaterial side={BackSide} transparent outputNode={atmosphereOutputNode} />
      </mesh>
    </>
  )
}

export default function TslEarth() {
  return (
    <Canvas renderer background="#000000" camera={{ position: CAMERA_POSITION, fov: 25, near: 0.1, far: 100 }}>
      <directionalLight color="#ffffff" intensity={2} position={SUN_POSITION} />
      <Suspense fallback={null}>
        <Globe />
      </Suspense>
      <DemoHelpers grid={false} minDistance={0.1} maxDistance={50} />
    </Canvas>
  )
}
