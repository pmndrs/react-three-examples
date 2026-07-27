/**
 * volume-cloud
 * R3F port of three.js `webgpu_volume_cloud`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_volume_cloud (~150 lines of JS)
 *
 * DEMONSTRATES
 * - Volumetric raymarching of a `Data3DTexture` in TSL: the `RaymarchingBox` addon
 *   marches camera rays through a unit box, sampling the 3D texture via
 *   `texture3D().sample()` with front-to-back alpha compositing and an early
 *   `If(alpha >= 0.95) Break()` exit
 * - CPU-generated volume data: 128^3 ImprovedNoise perlin field shaped by a radial
 *   falloff, packed into a single-channel `Data3DTexture` (RedFormat,
 *   `unpackAlignment = 1`)
 * - The BackSide-box trick — rendering the volume on the box's inside faces keeps the
 *   cloud visible even when the camera enters the volume
 * - fiber's `useUniforms` driving threshold/opacity/range/steps/color live into the
 *   node graph — including a uniform-driven raymarch step count feeding the TSL
 *   `Loop` increment (run-time loop bound, not a build-time constant)
 * - A `CanvasTexture` gradient sky dome (1x32 2D-canvas gradient on a BackSide sphere)
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` panel becomes leva controls
 *   (threshold/opacity/range/steps — same ranges and defaults); the cloud's base color
 *   (a constant uniform 0x798aa0 in the original) is exposed as a leva color, and a
 *   `rotationSpeed` knob is added per this repo's convention of exposing animation rates
 * - Rotation accumulates `delta`-wise in `useFrame` so changing `rotationSpeed` doesn't
 *   jump the phase (the original assigns absolute `-performance.now() / 7500`)
 * - The original's `transparentRaymarchingTexture` takes its texture/uniforms as
 *   object-destructured `Fn` params; here it's a zero-arg `Fn` closing over them —
 *   destructured Fn params lose their types under strict tsc (documented three-side
 *   gap, UPSTREAM.md B10). The `Fn` itself stays: RaymarchingBox's `.toVar()`/
 *   `.assign()` calls need the active TSL stack it provides
 * - `renderer={{ toneMapping: NoToneMapping }}` explicit — the original renders with
 *   the WebGPURenderer default (no tone mapping); fiber's ACESFilmic default would
 *   mute the unlit additive cloud shading
 * - OrbitControls → DemoHelpers CameraControls; grid off (the original floats a cloud
 *   in a sky void); dolly-out capped at 9 so the camera stays inside the radius-10
 *   sky sphere (the original lets you dolly through it into the void)
 * - `useUniforms`' `UniformNode<T>` pins its TSL type param to `unknown` (documented
 *   fiber typing gap) — cast to `Node<'float'>`/`Node<'vec3'>` where uniforms feed math
 */
import { useMemo, useRef } from 'react'
import { Canvas, useFrame, useUniforms } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { Break, Fn, If, float, smoothstep, texture3D, vec3, vec4 } from 'three/tsl'
import {
  BackSide,
  CanvasTexture,
  Data3DTexture,
  LinearFilter,
  Mesh,
  NodeMaterial,
  NoToneMapping,
  RedFormat,
  SRGBColorSpace,
  Vector3,
} from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { RaymarchingBox } from 'three/addons/tsl/utils/Raymarching.js'
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js'
import { DemoHelpers } from '../utils/DemoHelpers'

interface CloudProps {
  threshold: number
  opacity: number
  range: number
  steps: number
  baseColor: string
  rotationSpeed: number
}

function Cloud({ threshold, opacity, range, steps, baseColor, rotationSpeed }: CloudProps) {
  const meshRef = useRef<Mesh>(null)

  const { uThreshold, uOpacity, uRange, uSteps, uBaseColor } = useUniforms(
    {
      uThreshold: threshold,
      uOpacity: opacity,
      uRange: range,
      uSteps: steps,
      uBaseColor: baseColor,
    },
    'volumeCloud',
  )

  // 128^3 perlin field with a radial falloff, ported verbatim from the original's
  // init() — CPU-side generation is the showcased technique (compare compute-texture
  // for the GPU-written path).
  const cloudTexture = useMemo(() => {
    const size = 128
    const data = new Uint8Array(size * size * size)

    let i = 0
    const scale = 0.05
    const perlin = new ImprovedNoise()
    const vector = new Vector3()

    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const d = 1.0 - vector.set(x, y, z).subScalar(size / 2).divideScalar(size).length()
          data[i] = (128 + 128 * perlin.noise((x * scale) / 1.5, y * scale, (z * scale) / 1.5)) * d * d
          i++
        }
      }
    }

    const texture = new Data3DTexture(data, size, size, size)
    texture.format = RedFormat
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.unpackAlignment = 1
    texture.needsUpdate = true
    return texture
  }, [])

  // Casts: `useUniforms` pins its TSL type param to `unknown` — see header DIVERGENCE.
  const uThresholdNode = uThreshold as unknown as Node<'float'>
  const uOpacityNode = uOpacity as unknown as Node<'float'>
  const uRangeNode = uRange as unknown as Node<'float'>
  const uStepsNode = uSteps as unknown as Node<'float'>
  const uBaseColorNode = uBaseColor as unknown as Node<'vec3'>

  // Node graph builds once — uniform node identities are stable across re-renders
  // (leva changes mutate `.value` in place through useUniforms).
  const material = useMemo(() => {
    const map = texture3D(cloudTexture, null, 0)

    // Front-to-back compositing along the ray, early-out at ~full opacity — the
    // original's `transparentRaymarchingTexture`, as a zero-arg Fn closing over the
    // uniforms (header DIVERGENCE). The Fn wrapper is load-bearing: RaymarchingBox's
    // internal `.toVar()`/`.assign()` need the active TSL stack an Fn provides.
    const raymarchCloud = Fn(() => {
      const finalColor = vec4(0).toVar()

      RaymarchingBox(uStepsNode, ({ positionRay }) => {
        const mapValue = float(map.sample(positionRay.add(0.5)).r).toVar()

        mapValue.assign(
          smoothstep(uThresholdNode.sub(uRangeNode), uThresholdNode.add(uRangeNode), mapValue).mul(uOpacityNode),
        )

        // Cheap directional-derivative shading: density difference across the ray point.
        const shading = map.sample(positionRay.add(vec3(-0.01))).r.sub(map.sample(positionRay.add(vec3(0.01))).r)

        const col = shading.mul(3.0).add(positionRay.x.add(positionRay.y).mul(0.25)).add(0.2)

        finalColor.rgb.addAssign(finalColor.a.oneMinus().mul(mapValue).mul(col))
        finalColor.a.addAssign(finalColor.a.oneMinus().mul(mapValue))

        If(finalColor.a.greaterThanEqual(0.95), () => {
          Break()
        })
      })

      return vec4(finalColor.rgb.add(uBaseColorNode), finalColor.a)
    })

    const mat = new NodeMaterial()
    mat.colorNode = raymarchCloud()
    mat.side = BackSide // inside faces — volume survives the camera entering the box
    mat.transparent = true
    return mat
  }, [cloudTexture, uThresholdNode, uOpacityNode, uRangeNode, uStepsNode, uBaseColorNode])

  // Original: `mesh.rotation.y = -performance.now() / 7500` — accumulated here so the
  // added rotationSpeed knob rescales without a phase jump.
  useFrame((_state, delta) => {
    if (meshRef.current) meshRef.current.rotation.y -= (delta / 7.5) * rotationSpeed
  })

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

function Sky() {
  // 1x32 vertical gradient painted on a 2D canvas — ported verbatim.
  const skyMap = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 32

    const context = canvas.getContext('2d')
    if (context) {
      const gradient = context.createLinearGradient(0, 0, 0, 32)
      gradient.addColorStop(0.0, '#014a84')
      gradient.addColorStop(0.5, '#0561a0')
      gradient.addColorStop(1.0, '#437ab6')
      context.fillStyle = gradient
      context.fillRect(0, 0, 1, 32)
    }

    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace
    return map
  }, [])

  return (
    <mesh>
      <sphereGeometry args={[10]} />
      <meshBasicNodeMaterial map={skyMap} side={BackSide} />
    </mesh>
  )
}

export default function VolumeCloud() {
  const { threshold, opacity, range, steps, baseColor, rotationSpeed } = useControls('volume-cloud', {
    threshold: { value: 0.25, min: 0, max: 1, step: 0.01 },
    opacity: { value: 0.25, min: 0, max: 1, step: 0.01 },
    range: { value: 0.1, min: 0, max: 1, step: 0.01 },
    steps: { value: 100, min: 0, max: 200, step: 1 },
    baseColor: '#798aa0',
    rotationSpeed: { value: 1, min: 0, max: 3, step: 0.05 },
  })

  return (
    <Canvas
      // Original renders with the WebGPURenderer default (no tone mapping) — explicit
      // here because fiber's Canvas defaults to ACESFilmic (see header DIVERGENCE).
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [0, 0, 1.5], fov: 60, near: 0.1, far: 100 }}
    >
      <Sky />
      <Cloud
        threshold={threshold}
        opacity={opacity}
        range={range}
        steps={steps}
        baseColor={baseColor}
        rotationSpeed={rotationSpeed}
      />
      <DemoHelpers grid={false} maxDistance={9} />
    </Canvas>
  )
}
