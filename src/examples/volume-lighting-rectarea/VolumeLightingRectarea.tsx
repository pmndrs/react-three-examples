// Three spinning RectAreaLights (each with a visible glowing panel as a real child),
// the checker-roughness floor slab, the torus knot showcase surface, the fog-box
// volumetric-lighting mesh, and the layered render pipeline (main pass + quarter-res
// volumetric pass -> gaussian denoise -> additive compose). Uses fiber hooks
// throughout, so it lives inside <Canvas>; the page shell owns leva.
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu'
import { bayer16 } from 'three/addons/tsl/math/Bayer.js'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js'
import { checker, pass, screenCoordinate, screenUV, uv } from 'three/tsl'
import {
  BackSide,
  Layers,
  RectAreaLightNode,
  VolumeNodeMaterial,
  type Mesh,
  type Node,
  type RectAreaLight,
} from 'three/webgpu'
import { createFogScatteringNode, createFogTexture3D } from '../../utils/VolumetricFog'
import { LAYER_VOLUMETRIC_LIGHTING } from './constants'

// One-time, global BRDF texture registration for RectAreaLight on the WebGPU backend
// (same module-scope pattern as the lights-rectarealight port — idempotent, so safe
// to run at load rather than gating it behind an effect).
RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init())

const KNOT_POSITION: [number, number, number] = [0, 5.5, 0]

interface VolumeLightingRectareaProps {
  fogIntensity: number
  smokeAmount: number
  steps: number
  resolution: number
  denoiseStrength: number
  rotationSpeed: number
}

// A RectAreaLight with a visible panel as a real scene-graph child — a dark backing
// plane plus a color-matched emissive-looking front face (`BackSide` so it faces the
// same way the light shines), ported from the original's `createRectLightMesh()`.
function RectLightPanel({
  color,
  position,
  width,
  height,
  lightRef,
}: {
  color: string
  position: [number, number, number]
  width: number
  height: number
  lightRef: RefObject<RectAreaLight | null>
}) {
  return (
    <rectAreaLight ref={lightRef} color={color} intensity={5} width={width} height={height} position={position}>
      <mesh position={[0, 0, 0.08]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#111111" />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={color} side={BackSide} />
      </mesh>
    </rectAreaLight>
  )
}

export function VolumeLightingRectarea({
  fogIntensity,
  smokeAmount,
  steps,
  resolution,
  denoiseStrength,
  rotationSpeed,
}: VolumeLightingRectareaProps) {
  const { uSmokeAmount, uFogIntensity, uDenoiseStrength } = useUniforms(
    { uSmokeAmount: smokeAmount, uFogIntensity: fogIntensity, uDenoiseStrength: denoiseStrength },
    'volumeLightingRectarea',
  )
  // useUniforms' UniformNode<T> pins its TSL type param to `unknown` (fiber typing
  // gap, see AGENTS.md) — cast to the concrete node type the graphs below need.
  const uSmokeAmountNode = uSmokeAmount as unknown as Node<'float'>
  const uFogIntensityNode = uFogIntensity as unknown as Node<'float'>
  const uDenoiseStrengthNode = uDenoiseStrength as unknown as Node<'float'>

  const roughnessNode = useMemo(() => checker(uv().mul(400)), [])

  // --- Volumetric fog box: raymarched density from a tiled 3D noise field ---
  // (src/utils/VolumetricFog.ts — shared with volume-caustics/volume-lighting, whose
  // three.js originals duplicate this exact block; the octave/time constants here are
  // identical to volume-lighting's, since the original's scatteringNode is byte-for-
  // byte the same function)
  const fogTexture = useMemo(() => createFogTexture3D(), [])

  const volumetricMaterial = useMemo(() => {
    const material = new VolumeNodeMaterial()
    material.steps = steps
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

  // Layer split: the fog box is volumetric-pass-ONLY; the three lights ADD the layer
  // to their default membership so they keep lighting the knot in the main pass too —
  // `layers` isn't a plain prop (THREE.Layers is a bitmask object, not replaceable via
  // JSX assignment), so this is imperative, matching the sibling volume-* ports.
  const fogBoxRef = useRef<Mesh>(null)
  const light1Ref = useRef<RectAreaLight>(null)
  const light2Ref = useRef<RectAreaLight>(null)
  const light3Ref = useRef<RectAreaLight>(null)
  useLayoutEffect(() => {
    const fogBox = fogBoxRef.current
    const lights = [light1Ref.current, light2Ref.current, light3Ref.current]
    if (!fogBox || lights.some((l) => !l)) return
    fogBox.layers.disableAll()
    fogBox.layers.enable(LAYER_VOLUMETRIC_LIGHTING)
    lights.forEach((l) => l!.layers.enable(LAYER_VOLUMETRIC_LIGHTING))
  }, [])

  useFrame((_state, delta) => {
    const l1 = light1Ref.current
    const l2 = light2Ref.current
    const l3 = light3Ref.current
    if (!l1 || !l2 || !l3) return
    l1.rotation.y -= delta * rotationSpeed
    l2.rotation.y += delta * 0.5 * rotationSpeed
    l3.rotation.y += delta * rotationSpeed
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
      <RectLightPanel color="#ff0000" position={[-5, 6, 5]} width={4} height={10} lightRef={light1Ref} />
      <RectLightPanel color="#00ff00" position={[0, 6, 5]} width={4} height={10} lightRef={light2Ref} />
      <RectLightPanel color="#0000ff" position={[5, 6, 5]} width={4} height={10} lightRef={light3Ref} />

      <mesh>
        <boxGeometry args={[2000, 0.1, 2000]} />
        <meshStandardNodeMaterial color="#444444" roughnessNode={roughnessNode} />
      </mesh>

      <mesh position={KNOT_POSITION}>
        <torusKnotGeometry args={[1.5, 0.5, 200, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0} metalness={0} />
      </mesh>

      {/* Fog box: volumetric-pass-only (layer 10, see the effect above) */}
      <mesh ref={fogBoxRef} position={[0, 20, 0]} receiveShadow>
        <boxGeometry args={[50, 40, 50]} />
        <primitive object={volumetricMaterial} attach="material" />
      </mesh>
    </>
  )
}
