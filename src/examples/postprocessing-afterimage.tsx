/**
 * postprocessing-afterimage
 * R3F port of three.js `webgpu_postprocessing_afterimage`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_afterimage (~120 lines of JS)
 *
 * DEMONSTRATES
 * - `afterImage()` (three/addons AfterImageNode) as the pipeline `outputNode`: a
 *   history-buffer effect that composites each frame against a damped copy of the
 *   previous one, leaving motion trails behind the particle spiral
 * - The pass-owned-uniform dynamism pattern with a USER-created uniform (pattern c):
 *   the factory `nodeObject()`-wraps a plain `damp` number into a CONST node, so —
 *   exactly as the original does — a three/tsl `uniform()` is created in the mainCB,
 *   fed to `afterImage()`, registered via return-to-register, and mutated from a
 *   React effect on leva changes; no rebuild, no cast
 * - Swapping the pass chain at runtime: the `enabled` toggle assigns
 *   `renderPipeline.outputNode` (afterimage ⇄ raw scene pass) and sets
 *   `renderPipeline.needsUpdate = true` from an effect — the original's
 *   `updatePassChain()`, driven by React state instead of a GUI callback
 * - 50k instanced sprites from ONE `<sprite count={N}>`: per-instance
 *   `InstancedBufferAttribute`s (spawn position / color / time offset) read back in
 *   TSL via `instancedBufferAttribute()`, with `positionNode` animating the whole
 *   spiral on the GPU from the `time` built-in — zero per-frame attribute uploads
 * - NOT needed here: `samples: 0` on the pass — AfterImageNode renders a quad into
 *   its own internal single-sampled render targets and only SAMPLES its inputs
 *   (no texture copies, no depth), verified against the factory source
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` panel becomes leva (`damp`
 *   slider 0.25–1 and `enabled` checkbox, same ranges/defaults); the Inspector addon
 *   itself is dropped (this repo's shell has no inspector wiring)
 * - `frustumCulled={false}` on the sprite: instance placement lives only in
 *   `positionNode`, so three's culling sphere is the unit sprite plane at the origin —
 *   the original carries the same latent bug and just never moves its camera
 * - DemoHelpers CameraControls added (the original has no controls; dolly capped at
 *   5000, inside the far plane); grid disabled — the spiral floats in black space
 * - Spiral rotation uses `state.elapsed` (seconds) — same rate as the original's
 *   `time * 0.001` ms-based animation-loop timestamp
 * - Texture loading via drei's suspending `useTexture` instead of a bare
 *   `TextureLoader().load()` callback; sprite hotlinked from jsdelivr r185
 * - `renderer={{ toneMapping: NoToneMapping }}` set explicitly: the original renders
 *   with the WebGPURenderer default (NoToneMapping); fiber's Canvas would otherwise
 *   default to ACESFilmic and dim the additive trails
 */
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useRenderPipeline } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { afterImage } from 'three/addons/tsl/display/AfterImageNode.js'
import { cos, float, instancedBufferAttribute, mod, sin, texture, time, uniform, vec2, vec3, vec4 } from 'three/tsl'
import { AdditiveBlending, Color, InstancedBufferAttribute, NoToneMapping, SRGBColorSpace, Vector3 } from 'three/webgpu'
import type { Sprite, UniformNode } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const SPRITE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/sprites/circle.png'

const COUNT = 50000
const RADIUS = 600

// Particle Spiral (after oosmoxiecode): 50k instances of one sprite. Each instance
// carries a spawn point on a sphere shell, a hue, and a time offset; everything else —
// the inward spiral, the pulse orbit, the fade — is TSL running on the GPU.
function ParticleSpiral() {
  const map = useTexture(SPRITE_URL)
  const spriteRef = useRef<Sprite>(null)

  const { positionAttribute, colorAttribute, timeAttribute } = useMemo(() => {
    const vertex = new Vector3()
    const color = new Color()
    const vertices: number[] = []
    const colors: number[] = []
    const timeOffsets: number[] = []

    for (let i = 0; i < COUNT; i++) {
      // Random point on a sphere shell of radius RADIUS.
      const angle = Math.random() * Math.PI * 2
      const u = Math.random() * 2 - 1
      const ring = Math.sqrt(1 - u * u) * RADIUS
      vertex.set(Math.cos(angle) * ring, Math.sin(angle) * ring, u * RADIUS)
      vertices.push(vertex.x, vertex.y, vertex.z)

      color.setHSL(i / COUNT, 0.7, 0.7, SRGBColorSpace)
      colors.push(color.r, color.g, color.b)

      timeOffsets.push(i / COUNT)
    }

    return {
      positionAttribute: new InstancedBufferAttribute(new Float32Array(vertices), 3),
      colorAttribute: new InstancedBufferAttribute(new Float32Array(colors), 3),
      timeAttribute: new InstancedBufferAttribute(new Float32Array(timeOffsets), 1),
    }
  }, [])

  // Explicit type params: typed-TSL creators don't infer from their args (AGENTS.md).
  const { colorNode, positionNode, scaleNode } = useMemo(() => {
    const localTime = instancedBufferAttribute<'float'>(timeAttribute, 'float').add(time.mul(0.1))
    const modTime = mod(localTime, 1.0)
    const accTime = modTime.mul(modTime)

    const angle = accTime.mul(40.0)
    const pulse = vec2(sin(angle).mul(20.0), cos(angle).mul(20.0))
    const pos = instancedBufferAttribute<'vec3'>(positionAttribute, 'vec3')

    const animated = vec3(
      pos.x.mul(accTime).add(pulse.x),
      pos.y.mul(accTime).add(pulse.y),
      pos.z.mul(accTime).mul(1.75),
    )
    const fAlpha = modTime.oneMinus().mul(2.0)

    return {
      colorNode: texture(map).mul(vec4(instancedBufferAttribute<'vec3'>(colorAttribute, 'vec3'), fAlpha)),
      positionNode: animated,
      scaleNode: float(2),
    }
  }, [map, positionAttribute, colorAttribute, timeAttribute])

  // Whole-spiral rotation: SpriteNodeMaterial runs positionNode through the model
  // matrix (only the quad itself billboards), so object rotation works as usual.
  useFrame((state) => {
    const sprite = spriteRef.current
    if (!sprite) return
    sprite.rotation.z = state.elapsed
  })

  return (
    <sprite ref={spriteRef} count={COUNT} frustumCulled={false}>
      <spriteNodeMaterial
        blending={AdditiveBlending}
        depthWrite={false}
        colorNode={colorNode}
        positionNode={positionNode}
        scaleNode={scaleNode}
      />
    </sprite>
  )
}

interface PostFXProps {
  damp: number
  enabled: boolean
}

// Afterimage over the scene pass. `afterImage()` const-wraps a numeric damp, so —
// like the original — the uniform is created here, fed into the factory, registered
// by returning it, and mutated in an effect. The enabled toggle swaps outputNode.
function PostFX({ damp, enabled }: PostFXProps) {
  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    if (!renderPipeline) return

    // Initial value from the closure ONCE (callbacks never re-run on re-render);
    // later changes flow through the registered uniform below.
    const uDamp = uniform(damp)

    const afterImagePass = afterImage(passes.scenePass.getTextureNode(), uDamp)
    renderPipeline.outputNode = afterImagePass

    return { afterImagePass, uDamp }
  })

  useEffect(() => {
    // Only `.value` is touched, so the node-type param can stay unknown.
    const uDamp = passes.uDamp as UniformNode<unknown, number> | undefined
    if (!uDamp) return
    uDamp.value = damp
  }, [passes, damp])

  // The original's updatePassChain(): bypass the effect by outputting the raw scene
  // pass; outputNode is a plain property, so the pipeline must be told to rebuild.
  useEffect(() => {
    const afterImagePass = passes.afterImagePass as ReturnType<typeof afterImage> | undefined
    if (!renderPipeline || !afterImagePass) return
    renderPipeline.outputNode = enabled ? afterImagePass : passes.scenePass
    renderPipeline.needsUpdate = true
  }, [renderPipeline, passes, enabled])

  return null
}

export default function PostprocessingAfterimage() {
  const { damp, enabled } = useControls('postprocessing-afterimage', {
    damp: { value: 0.8, min: 0.25, max: 1, step: 0.01 },
    enabled: true,
  })

  return (
    <Canvas
      // Original renders with the WebGPURenderer default tone mapping (none) —
      // match it explicitly; fiber's Canvas default is ACESFilmic.
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 0, 1000], fov: 60, near: 1, far: 10000 }}
    >
      <Suspense fallback={null}>
        <ParticleSpiral />
      </Suspense>
      <PostFX damp={damp} enabled={enabled} />
      <DemoHelpers grid={false} maxDistance={5000} />
    </Canvas>
  )
}
