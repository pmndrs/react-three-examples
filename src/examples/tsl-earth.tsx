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
 * - `useUniforms`' `UniformNode<T>` pins its TSL type param to `unknown` (documented
 *   fiber typing gap, see skinning-instancing/rtt/shadow-contact) — casts to
 *   `Node<'vec3'>`/`Node<'float'>` where the uniforms feed `mix()`/`remap()`
 * - DemoHelpers grid disabled (`grid={false}`) — the original is a globe in a black
 *   void with no ground plane; dolly range set to the original OrbitControls'
 *   `minDistance`/`maxDistance` (0.1 / 50)
 */
import { useEffect, useMemo } from 'react'
import { Canvas, useFrame, useUniforms } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { folder, useControls } from 'leva'
import { bumpMap, cameraPosition, max, mix, normalWorldGeometry, normalize, output, positionWorld, step, texture, uv, vec3, vec4 } from 'three/tsl'
import {
  BackSide,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  SphereGeometry,
  SRGBColorSpace,
} from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

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

interface GlobeProps {
  atmosphereDayColor: string
  atmosphereTwilightColor: string
  roughnessLow: number
  roughnessHigh: number
  rotationSpeed: number
}

function Globe({ atmosphereDayColor, atmosphereTwilightColor, roughnessLow, roughnessHigh, rotationSpeed }: GlobeProps) {
  const textures = useTexture({
    day: DAY_URL,
    night: NIGHT_URL,
    bumpRoughnessClouds: BUMP_ROUGHNESS_CLOUDS_URL,
  })

  const { uDayColor, uTwilightColor, uRoughnessLow, uRoughnessHigh } = useUniforms(
    {
      uDayColor: atmosphereDayColor,
      uTwilightColor: atmosphereTwilightColor,
      uRoughnessLow: roughnessLow,
      uRoughnessHigh: roughnessHigh,
    },
    'earth',
  )

  // Color-critical textures need sRGB decoding; the packed bump/roughness/clouds map is
  // data, not color, so it's left alone. `useTexture` (drei) doesn't set either — the
  // original's raw `TextureLoader.load` + manual property assignment, ported verbatim.
  useEffect(() => {
    textures.day.colorSpace = SRGBColorSpace
    textures.day.anisotropy = 8
    textures.night.colorSpace = SRGBColorSpace
    textures.night.anisotropy = 8
    textures.bumpRoughnessClouds.anisotropy = 8
  }, [textures])

  // Casts: `useUniforms` pins its TSL type param to `unknown` — see header DIVERGENCE.
  const uDayColorNode = uDayColor as unknown as Node<'vec3'>
  const uTwilightColorNode = uTwilightColor as unknown as Node<'vec3'>
  const uRoughnessLowNode = uRoughnessLow as unknown as Node<'float'>
  const uRoughnessHighNode = uRoughnessHigh as unknown as Node<'float'>

  // Built once per texture/uniform-node-identity change — `useUniforms` returns the same
  // node instances across re-renders (values mutate in place via `.value`), so in
  // practice this graph builds exactly once, matching the original's single `init()`.
  const rig = useMemo(() => {
    const viewDirection = positionWorld.sub(cameraPosition).normalize()
    const fresnel = viewDirection.dot(normalWorldGeometry).abs().oneMinus().toVar()

    const sunOrientation = normalWorldGeometry.dot(normalize(vec3(...SUN_POSITION))).toVar()

    const atmosphereColor = mix(uTwilightColorNode, uDayColorNode, sunOrientation.smoothstep(-0.25, 0.75))

    // globe
    const globeMaterial = new MeshStandardNodeMaterial()

    const cloudsStrength = texture(textures.bumpRoughnessClouds, uv()).b.smoothstep(0.2, 1)
    globeMaterial.colorNode = mix(texture(textures.day), vec3(1), cloudsStrength.mul(2))

    const roughness = max(texture(textures.bumpRoughnessClouds).g, step(0.01, cloudsStrength))
    globeMaterial.roughnessNode = roughness.remap(0, 1, uRoughnessLowNode, uRoughnessHighNode)

    const night = texture(textures.night)
    const dayStrength = sunOrientation.smoothstep(-0.25, 0.5)

    const atmosphereDayStrength = sunOrientation.smoothstep(-0.5, 1)
    const atmosphereMix = atmosphereDayStrength.mul(fresnel.pow(2)).clamp(0, 1)

    let finalOutput = mix(night.rgb, output.rgb, dayStrength)
    finalOutput = mix(finalOutput, atmosphereColor, atmosphereMix)

    globeMaterial.outputNode = vec4(finalOutput, output.a)

    const bumpElevation = max(texture(textures.bumpRoughnessClouds).r, cloudsStrength)
    globeMaterial.normalNode = bumpMap(bumpElevation)

    const sphereGeometry = new SphereGeometry(1, 64, 64)
    const globe = new Mesh(sphereGeometry, globeMaterial)

    // atmosphere
    const atmosphereMaterial = new MeshBasicNodeMaterial({ side: BackSide, transparent: true })
    let alpha = fresnel.remap(0.73, 1, 1, 0).pow(3)
    alpha = alpha.mul(sunOrientation.smoothstep(-0.5, 1))
    atmosphereMaterial.outputNode = vec4(atmosphereColor, alpha)

    const atmosphere = new Mesh(sphereGeometry, atmosphereMaterial)
    atmosphere.scale.setScalar(1.04)

    return { globe, atmosphere }
  }, [textures.day, textures.night, textures.bumpRoughnessClouds, uDayColorNode, uTwilightColorNode, uRoughnessLowNode, uRoughnessHighNode])

  useFrame((_state, delta) => {
    rig.globe.rotation.y += delta * 0.025 * rotationSpeed
  })

  return (
    <>
      <primitive object={rig.globe} />
      <primitive object={rig.atmosphere} />
    </>
  )
}

export default function TslEarth() {
  const { atmosphereDayColor, atmosphereTwilightColor, roughnessLow, roughnessHigh, rotationSpeed } = useControls('tsl-earth', {
    atmosphere: folder({
      atmosphereDayColor: '#4db2ff',
      atmosphereTwilightColor: '#bc490b',
    }),
    roughness: folder({
      roughnessLow: { value: 0.25, min: 0, max: 1, step: 0.001 },
      roughnessHigh: { value: 0.35, min: 0, max: 1, step: 0.001 },
    }),
    rotationSpeed: { value: 1, min: 0, max: 3, step: 0.05 },
  })

  return (
    <Canvas renderer background="#000000" camera={{ position: CAMERA_POSITION, fov: 25, near: 0.1, far: 100 }}>
      <directionalLight color="#ffffff" intensity={2} position={SUN_POSITION} />
      <Globe
        atmosphereDayColor={atmosphereDayColor}
        atmosphereTwilightColor={atmosphereTwilightColor}
        roughnessLow={roughnessLow}
        roughnessHigh={roughnessHigh}
        rotationSpeed={rotationSpeed}
      />
      <DemoHelpers grid={false} minDistance={0.1} maxDistance={50} />
    </Canvas>
  )
}
