/**
 * postprocessing-anamorphic
 * R3F port of three.js `webgpu_postprocessing_anamorphic`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_anamorphic (~180 lines of JS)
 *
 * DEMONSTRATES
 * - Overriding `bloom()`'s internal high-pass filter (`bloomPass.highPassFn`) with a
 *   custom TSL `Fn` that does a horizontal-only blur of the bright-pass texture
 *   (`rtt()` renders it to an offscreen texture once, then `Loop()` samples it many
 *   times with a falloff) — the anamorphic "stretched horizontal streak" look, built
 *   entirely from TSL nodes the original three.js example itself defines inline
 * - `scene.backgroundNode` as a small radial-gradient `Fn()` (`screenUV.distance(0.5)`)
 *   instead of a texture — a shader IS the background, no asset at all
 * - `positionLocal` displacement driven by `instanceIndex` as a per-instance phase
 *   offset (`time.add(instanceIndex.toFloat().mul(0.5))`) — 200 instanced spheres
 *   bobbing on independent sine phases from ONE shared position node, GPU-only, zero
 *   CPU per-frame work (matrices are written once at mount, not per frame)
 * - Every bloom/anamorphic knob (`intensity`, `threshold`, `radius`, `samples`,
 *   `tintColor`, `timeScale`) is the app's OWN `uniform()` node, created once and
 *   handed straight into `bloom()`'s constructor — `strength.isNode` lets `BloomNode`
 *   adopt it directly as `.strength` (verified in the addon source), so leva just
 *   mutates `.value`; no return-to-register indirection needed for these (contrast
 *   `postprocessing-bloom`, where the pass creates its OWN uniforms internally)
 *
 * DIVERGENCE from original
 * - `renderer.inspector.createParameters` dat.gui panel replaced by leva controls,
 *   same six knobs and ranges
 * - `bloomPass.highPassFn`'s declared type (`@types/three`) is `(params) => void`,
 *   but the runtime implementation returns a `Node` (the addon's own default
 *   `luminosityHighPass` does the same) — a documented `@types` gap, cast once
 *   (AGENTS.md B10 family: Fn's typed param/return surface doesn't round-trip
 *   through custom addon function-property assignments)
 * - DemoHelpers baseline (grid + camera-controls) added; original had a fixed
 *   `OrbitControls`. Grid disabled — floating spheres against a shader backdrop, the
 *   original has no ground plane
 */
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { Canvas, useRenderPipeline, useThree } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import {
  Fn,
  Loop,
  color,
  float,
  instanceIndex,
  luminance,
  mix,
  positionLocal,
  rtt,
  screenUV,
  smoothstep,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  viewportSize,
} from 'three/tsl'
import {
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  MeshBasicNodeMaterial,
  MirroredRepeatWrapping,
  NeutralToneMapping,
  Object3D,
} from 'three/webgpu'
import type { Node, UniformNode } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const SPHERE_COUNT = 200

// Radial gradient backdrop — a shader, not a texture. Cast: `scene.backgroundNode`
// is duck-typed by the WebGPU renderer but not declared on `@types/three`'s `Scene`
// (AGENTS.md B11, same cast family as `pmrem-equirectangular`/`sprites`).
const gradientBackgroundNode = Fn(() => {
  const dist = screenUV.distance(0.5).mul(2.0)
  return mix(color(0x111111), color(0x000000), dist)
})()

// Cast: `scene.backgroundNode` is duck-typed by the WebGPU renderer but not declared
// on `@types/three`'s `Scene` (AGENTS.md B11, same cast family as
// `pmrem-equirectangular`/`sprites`). Set in a layout effect — read at first-render
// shader-graph build time (AGENTS.md imperative-setup rule).
function SceneBackground() {
  const scene = useThree((s) => s.scene)

  useLayoutEffect(() => {
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null }
    withBackgroundNode.backgroundNode = gradientBackgroundNode
    return () => {
      withBackgroundNode.backgroundNode = null
    }
  }, [scene])

  return null
}

const dummy = new Object3D()

// Custom high-pass: extract bright areas once into an offscreen texture (`rtt`), then
// blur ONLY horizontally with a falloff-weighted `Loop` — the anamorphic streak.
// Ported from the original inline `highPassFn` override. Untyped `Record<string,
// unknown>` param + internal casts: fiber's `three/tsl` module augmentation shadows
// `@types/three`'s own (differently-shaped) `Fn` overloads for object-destructured
// params (AGENTS.md B21) — a typed interface param here fails contravariance against
// the augmented signature, so the params come through untyped and get cast field by
// field instead.
const anamorphicHighPass = Fn((inputs: Record<string, unknown>) => {
  const input = inputs.input as Node<'vec4'>
  const threshold = inputs.threshold as Node<'float'>
  const smoothWidth = inputs.smoothWidth as Node<'float'>
  const samples = uniform(80)

  const v = luminance(input.rgb)
  const alpha = smoothstep(threshold, threshold.add(smoothWidth), v)
  const brightPass = rtt(mix(vec4(0), input, alpha), null, null, {
    wrapS: MirroredRepeatWrapping,
    wrapT: MirroredRepeatWrapping,
  })

  const total = vec4(0).toVar()
  const halfSamples = samples.div(2)
  const invSize = vec2(1.0).div(viewportSize)

  Loop({ start: halfSamples.negate(), end: halfSamples }, ({ i }) => {
    let softness = float(i).abs().div(halfSamples).oneMinus()
    softness = softness.pow(2.0)

    const shiftedUV = vec2(uv().x.add(invSize.x.mul(i).mul(4.0)), uv().y)
    total.addAssign(brightPass.sample(shiftedUV).mul(softness))
  })

  return total.div(samples.div(3.0))
})

function InstancedSpheres({ timeScale }: { timeScale: UniformNode<'float', number> }) {
  const geometry = useMemo(() => new IcosahedronGeometry(0.1, 3), [])

  const material = useMemo(() => {
    const mat = new MeshBasicNodeMaterial({ color: 0xffffff })
    // Animate each instance up/down continuously — instanceIndex as a phase offset,
    // fully GPU-side (no per-frame CPU matrix loop, unlike a CPU-animated InstancedMesh).
    mat.positionNode = positionLocal.add(
      vec3(0, time.add(instanceIndex.toFloat().mul(0.5)).mul(timeScale).sin().mul(5.0), 0),
    )
    return mat
  }, [timeScale])

  return (
    <instancedMesh
      args={[geometry, material, SPHERE_COUNT]}
      // Frustum-culled from a unit-sized CPU geometry origin — the positionNode
      // relocates instances far outside it (AGENTS.md tsl-galaxy pattern).
      frustumCulled={false}
      ref={(mesh: InstancedMesh | null) => {
        if (!mesh) return
        const colorObj = new Color()
        for (let i = 0; i < SPHERE_COUNT; i++) {
          dummy.position.set(
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20,
          )
          dummy.updateMatrix()
          mesh.setMatrixAt(i, dummy.matrix)
          colorObj.setHex(Math.random() * 0xffffff)
          mesh.setColorAt(i, colorObj)
        }
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      }}
    />
  )
}

interface PostFXProps {
  intensity: UniformNode<'float', number>
  threshold: UniformNode<'float', number>
  radius: UniformNode<'float', number>
  tintColor: UniformNode<'color', Color>
}

function PostFX({ intensity, threshold, radius, tintColor }: PostFXProps) {
  useRenderPipeline(({ renderPipeline, passes }) => {
    if (!renderPipeline) return

    const scenePassColor = passes.scenePass.getTextureNode()
    const bloomPass = bloom(scenePassColor, intensity, radius, threshold)
    bloomPass.setResolutionScale(0.25)

    // `highPassFn`'s declared type is `(params) => void`; the runtime (and the
    // addon's own default) returns a Node — documented @types gap, cast once.
    bloomPass.highPassFn = anamorphicHighPass as unknown as typeof bloomPass.highPassFn

    const anamorphicPass = bloomPass.mul(tintColor)
    renderPipeline.outputNode = scenePassColor.add(anamorphicPass)
  })

  return null
}

export default function PostprocessingAnamorphic() {
  const { intensity, threshold, tintColor, radius, timeScale } = useControls(
    'postprocessing-anamorphic',
    {
      intensity: { value: 5.0, min: 0, max: 10, step: 0.1 },
      threshold: { value: 0.3, min: 0, max: 0.9, step: 0.01 },
      tintColor: { value: '#7a8aff' },
      radius: { value: 0.0, min: 0, max: 1, step: 0.01 },
      timeScale: { value: 0.5, min: 0, max: 1, step: 0.01 },
    },
  )

  // Own uniform nodes, created once — handed straight into `bloom()` (see header
  // DEMONSTRATES). Mutated in effects below, never rebuilt.
  const uIntensity = useMemo(() => uniform(5.0), [])
  const uThreshold = useMemo(() => uniform(0.3), [])
  const uRadius = useMemo(() => uniform(0.0), [])
  const uTintColor = useMemo(() => uniform(new Color(0x7a8aff)), [])
  const uTimeScale = useMemo(() => uniform(0.5), [])

  useEffect(() => {
    uIntensity.value = intensity
  }, [uIntensity, intensity])
  useEffect(() => {
    uThreshold.value = threshold
  }, [uThreshold, threshold])
  useEffect(() => {
    uRadius.value = radius
  }, [uRadius, radius])
  useEffect(() => {
    uTintColor.value.set(tintColor)
  }, [uTintColor, tintColor])
  useEffect(() => {
    uTimeScale.value = timeScale
  }, [uTimeScale, timeScale])

  return (
    <Canvas
      // Original sets NeutralToneMapping explicitly (not fiber's ACESFilmic default).
      renderer={{ toneMapping: NeutralToneMapping }}
      camera={{ position: [0, 0, 20], fov: 45, near: 0.25, far: 250 }}
    >
      <SceneBackground />
      <InstancedSpheres timeScale={uTimeScale} />
      <PostFX intensity={uIntensity} threshold={uThreshold} radius={uRadius} tintColor={uTintColor} />
      <DemoHelpers grid={false} minDistance={2} maxDistance={25} />
    </Canvas>
  )
}
