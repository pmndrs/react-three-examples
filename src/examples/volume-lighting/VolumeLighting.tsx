// The teapot, floor, animated point + spot lights (the spot casts a "colors.png"
// light-cookie projection), the fog-box volumetric-lighting mesh, and the layered
// render pipeline (main pass + quarter-res volumetric pass -> gaussian denoise ->
// additive compose). Uses fiber hooks throughout, so it lives inside <Canvas>; the
// page shell owns leva and Suspense.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { bayer16 } from 'three/addons/tsl/math/Bayer.js'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js'
import { pass, screenCoordinate, screenUV } from 'three/tsl'
import {
  DoubleSide,
  Layers,
  VolumeNodeMaterial,
  type Mesh,
  type Node,
  type PointLight,
  type SpotLight,
} from 'three/webgpu'
import { createFogScatteringNode, createFogTexture3D } from '../../utils/VolumetricFog'
import { COLORS_MAP_URL, LAYER_VOLUMETRIC_LIGHTING } from './constants'

interface VolumeLightingProps {
  pointLightIntensity: number
  spotIntensity: number
  fogIntensity: number
  smokeAmount: number
  steps: number
  resolution: number
  denoiseStrength: number
}

export function VolumeLighting({
  pointLightIntensity,
  spotIntensity,
  fogIntensity,
  smokeAmount,
  steps,
  resolution,
  denoiseStrength,
}: VolumeLightingProps) {
  const colorsMap = useTexture(COLORS_MAP_URL) // spot light cookie

  const { uSmokeAmount, uFogIntensity, uDenoiseStrength } = useUniforms(
    { uSmokeAmount: smokeAmount, uFogIntensity: fogIntensity, uDenoiseStrength: denoiseStrength },
    'volumeLighting',
  )
  // useUniforms' UniformNode<T> pins its TSL type param to `unknown` (fiber typing
  // gap, see AGENTS.md) — cast to the concrete node type the graphs below need.
  const uSmokeAmountNode = uSmokeAmount as unknown as Node<'float'>
  const uFogIntensityNode = uFogIntensity as unknown as Node<'float'>
  const uDenoiseStrengthNode = uDenoiseStrength as unknown as Node<'float'>

  const teapotGeometry = useMemo(() => new TeapotGeometry(0.8, 18), [])

  // --- Volumetric fog box: raymarched density from a tiled 3D noise field ---
  // (src/utils/VolumetricFog.ts — shared with volume-caustics/volume-lighting-rectarea,
  // whose three.js originals duplicate this exact block)
  const fogTexture = useMemo(() => createFogTexture3D(), [])

  const volumetricMaterial = useMemo(() => {
    const material = new VolumeNodeMaterial()
    material.steps = steps
    // Dithering to reduce raymarch banding (no `frameId` jitter here — original omits it).
    material.offsetNode = bayer16(screenCoordinate)
    material.scatteringNode = createFogScatteringNode({
      fogTexture,
      smokeAmount: uSmokeAmountNode,
      octaves: [[0.1], [0.05, 1], [0.02, 2]],
      timeSpeed: [1, 0.3],
    })
    return material
    // `steps` intentionally omitted — handled by the effect below via `.steps =` so
    // changing it doesn't rebuild the scattering node graph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fogTexture, uSmokeAmountNode])

  useEffect(() => {
    volumetricMaterial.steps = steps
  }, [volumetricMaterial, steps])

  // Layer split: the fog box + both lights render in the half-res volumetric pass in
  // ADDITION to the main pass (lights keep their default layer 0 membership too) —
  // `layers` isn't a plain prop (THREE.Layers is a bitmask object, not replaceable via
  // JSX assignment), so this is imperative, matching the volume-caustics/volume-fire
  // ports.
  const fogBoxRef = useRef<Mesh>(null)
  const pointLightRef = useRef<PointLight>(null)
  const spotLightRef = useRef<SpotLight>(null)
  useLayoutEffect(() => {
    const fogBox = fogBoxRef.current
    const pointLightObj = pointLightRef.current
    const spotLightObj = spotLightRef.current
    if (!fogBox || !pointLightObj || !spotLightObj) return
    fogBox.layers.disableAll()
    fogBox.layers.enable(LAYER_VOLUMETRIC_LIGHTING)
    pointLightObj.layers.enable(LAYER_VOLUMETRIC_LIGHTING)
    spotLightObj.layers.enable(LAYER_VOLUMETRIC_LIGHTING)
  }, [])

  // --- Animation: orbiting point light, sweeping spot light, spinning teapot ---
  // (the original's `spotLight.lookAt(0, 0, 0)` every frame is a no-op — a SpotLight's
  // beam direction comes from `.target`'s world position, defaulted to the origin and
  // never reparented, not from the light's own quaternion — dropped, see header DIVERGENCE)
  const teapotRef = useRef<Mesh>(null)
  useFrame((state) => {
    const t = state.elapsed
    const scale = 2.4
    const pointLightObj = pointLightRef.current
    const spotLightObj = spotLightRef.current
    const teapot = teapotRef.current
    if (pointLightObj) {
      pointLightObj.position.set(Math.sin(t * 0.7) * scale, Math.cos(t * 0.5) * scale, Math.cos(t * 0.3) * scale)
    }
    if (spotLightObj) spotLightObj.position.x = Math.cos(t * 0.3) * scale
    if (teapot) teapot.rotation.y = t * 0.2
  })

  // --- Render pipeline: main scene pass (feeds the fog box's depth occlusion) +
  //     quarter-resolution volumetric-only pass -> gaussian denoise -> additive compose ---
  const { passes } = useRenderPipeline(({ renderPipeline, passes, scene, camera }) => {
    if (!renderPipeline) return

    const volumetricLayer = new Layers()
    volumetricLayer.disableAll()
    volumetricLayer.enable(LAYER_VOLUMETRIC_LIGHTING)

    const volumetricPass = pass(scene, camera, { depthBuffer: false, samples: 0 })
    volumetricPass.setLayers(volumetricLayer)
    volumetricPass.setResolutionScale(0.25)

    const sceneDepth = passes.scenePass.getTextureNode('depth')
    volumetricMaterial.depthNode = sceneDepth.sample(screenUV)

    const blurredVolumetric = gaussianBlur(volumetricPass, uDenoiseStrengthNode)

    const sceneColor = passes.scenePass.getTextureNode()
    renderPipeline.outputNode = sceneColor.add(blurredVolumetric.mul(uFogIntensityNode))

    // Return to register — the effect below mutates its uniform-backed knob.
    return { volumetricPass }
  })

  useEffect(() => {
    const volumetricPass = passes.volumetricPass as { setResolutionScale: (s: number) => void } | undefined
    volumetricPass?.setResolutionScale(resolution)
  }, [passes, resolution])

  return (
    <>
      <mesh ref={teapotRef} geometry={teapotGeometry} castShadow>
        <meshStandardNodeMaterial color="#ffffff" side={DoubleSide} />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[0, -3, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardNodeMaterial color="#ffffff" />
      </mesh>

      {/* Fog box: renders in the volumetric pass only (layer 10, see the effect above) */}
      <mesh ref={fogBoxRef} position={[0, 2, 0]} receiveShadow>
        <boxGeometry args={[20, 10, 20]} />
        <primitive object={volumetricMaterial} attach="material" />
      </mesh>

      <pointLight
        ref={pointLightRef}
        color="#f9bb50"
        intensity={pointLightIntensity}
        distance={100}
        castShadow
        position={[0, 1.4, 0]}
      />

      <spotLight
        ref={spotLightRef}
        color="#ffffff"
        intensity={spotIntensity}
        position={[2.5, 5, 2.5]}
        angle={Math.PI / 6}
        penumbra={1}
        decay={2}
        distance={0}
        map={colorsMap}
        castShadow
        shadow-intensity={0.98}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={15}
        shadow-focus={1}
      />
    </>
  )
}
