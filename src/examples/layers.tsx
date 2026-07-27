/**
 * layers
 * R3F port of three.js `webgpu_layers`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_layers (~140 lines of JS)
 *
 * DEMONSTRATES
 * - `THREE.Layers` as camera-side visibility routing: three blossom storms live on
 *   layers 0/1/2 (declarative fiber `layers-mask` dash-path prop on each mesh), and
 *   leva checkboxes drive `camera.layers.enable/disable` — same compiled scene, the
 *   camera simply stops drawing a layer
 * - 3 × 2500 GPU-instanced sprites from ONE `<mesh count={N}>` each: per-instance
 *   `InstancedBufferAttribute`s (spawn / rotation axis / drift direction / time
 *   offset) read back in TSL via `instancedBufferAttribute()`, with `positionNode`
 *   tumbling and drifting every blossom from the `time` built-in — zero per-frame
 *   attribute uploads
 * - `scene.backgroundNode` as a screen-space TSL gradient: horizontal `screenUV.x`
 *   pink→cream blend plus a radial glow toward the top edge (documented B11 cast —
 *   @types/three doesn't declare `backgroundNode`)
 * - One `MeshBasicNodeMaterial` per layer: shared blossom sprite as `map`/`alphaMap`
 *   with `alphaTest`, tinted per layer via the plain `color` JSX prop
 *
 * DIVERGENCE from original
 * - The Inspector GUI (`renderer.inspector.createParameters`) becomes leva checkboxes;
 *   the original's stateless `camera.layers.toggle(n)` callbacks become an explicit
 *   checkbox-state → `enable/disable` sync (direct value controls beat toggles that
 *   hide state; identical behavior). The Inspector addon itself is dropped (this
 *   repo's shell has no inspector wiring)
 * - `frustumCulled={false}` on each mesh: blossom placement lives only in
 *   `positionNode`, so three's culling sphere is the 0.25-unit plane at the origin —
 *   the original carries the same latent bug and just never moves its camera
 * - DemoHelpers CameraControls added (the original has no controls; dolly capped
 *   inside the far plane); grid disabled — the storm floats on the gradient sky
 * - The original's chained `screenUV.x.mix(a, b)` becomes functional
 *   `mix(a, b, screenUV.x)` — `.mix` is missing from @types' fluent surface, and the
 *   calling node is the interpolation FACTOR (AGENTS.md arg-order landmine)
 * - Texture loading via drei's suspending `useTexture` instead of a bare
 *   `TextureLoader().load()`; blossom sprite hotlinked from jsdelivr r185
 * - `renderer={{ toneMapping: NoToneMapping }}` set explicitly: the original renders
 *   with the WebGPURenderer default (NoToneMapping); fiber's Canvas would otherwise
 *   default to ACESFilmic and mute the pastel palette
 */
import { Suspense, useLayoutEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { color, instancedBufferAttribute, mix, mod, positionLocal, rotate, screenUV, time, vec2 } from 'three/tsl'
import {
  DoubleSide,
  InstancedBufferAttribute,
  MathUtils,
  NoToneMapping,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three/webgpu'
import type { Node, Texture } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const SPRITE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/sprites/blossom.png'

const COUNT = 2500

// Layer index === array index: red on 0, yellow on 1, green on 2 (as the original).
const LAYER_COLORS = [0xd70654, 0xffd95f, 0xb8d576]

// The original's screen-space sky: a horizontal pink→cream gradient plus a lavender
// glow radiating from the top-center of the screen.
function Background() {
  const scene = useThree((state) => state.scene)

  useLayoutEffect(() => {
    const horizontalEffect = mix(color(0xf996ae), color(0xf6f0a3), screenUV.x)
    const lightEffect = screenUV.distance(vec2(0.5, 1.0)).oneMinus().mul(color(0xd9b6fd))
    // Cast: @types/three's Scene doesn't declare `backgroundNode` even though the
    // WebGPU renderer reads it generically (documented duck-typing gap, AGENTS.md B11).
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null }
    withBackgroundNode.backgroundNode = horizontalEffect.add(lightEffect)
    return () => {
      withBackgroundNode.backgroundNode = null
    }
  }, [scene])

  return null
}

// Checkbox state → camera layer mask. The camera starts with only layer 0 enabled;
// this sync (idempotent, StrictMode-safe) is the example's whole point: the three
// blossom meshes never change — the camera just includes/excludes their layers.
function CameraLayers({ layers }: { layers: [boolean, boolean, boolean] }) {
  const camera = useThree((state) => state.camera)
  const [red, yellow, green] = layers

  useLayoutEffect(() => {
    const flags = [red, yellow, green]
    flags.forEach((on, layer) => {
      if (on) camera.layers.enable(layer)
      else camera.layers.disable(layer)
    })
  }, [camera, red, yellow, green])

  return null
}

interface BlossomsProps {
  layer: number
  tint: number
  map: Texture
  geometry: PlaneGeometry
}

// One instanced blossom storm on a single layer: 2500 copies of the shared quad,
// placed, tumbled and drifted entirely on the GPU from per-instance attributes.
function Blossoms({ layer, tint, map, geometry }: BlossomsProps) {
  // Random instance data rolled once per mount, exactly like the original's loop:
  // spawn off-screen left, drift right-and-down along a normalized direction.
  const { positionAttribute, rotationAttribute, directionAttribute, timeAttribute } = useMemo(() => {
    const positions: number[] = []
    const rotations: number[] = []
    const directions: number[] = []
    const timeOffsets: number[] = []
    const v = new Vector3()

    for (let i = 0; i < COUNT; i++) {
      positions.push(
        MathUtils.randFloat(-25, -20),
        MathUtils.randFloat(-10, 50),
        MathUtils.randFloat(-5, 5),
      )
      v.set(MathUtils.randFloat(0.7, 0.9), MathUtils.randFloat(-0.3, -0.15), 0).normalize()
      rotations.push(Math.random(), Math.random(), Math.random())
      directions.push(v.x, v.y, v.z)
      timeOffsets.push(i / COUNT)
    }

    return {
      positionAttribute: new InstancedBufferAttribute(new Float32Array(positions), 3),
      rotationAttribute: new InstancedBufferAttribute(new Float32Array(rotations), 3),
      directionAttribute: new InstancedBufferAttribute(new Float32Array(directions), 3),
      timeAttribute: new InstancedBufferAttribute(new Float32Array(timeOffsets), 1),
    }
  }, [])

  // Explicit type params: typed-TSL creators don't infer from their args (AGENTS.md).
  const positionNode = useMemo(() => {
    const instancePosition = instancedBufferAttribute<'vec3'>(positionAttribute, 'vec3')
    const instanceRotation = instancedBufferAttribute<'vec3'>(rotationAttribute, 'vec3')
    const instanceDirection = instancedBufferAttribute<'vec3'>(directionAttribute, 'vec3')

    // Staggered, looping local clock per instance: offset + slow global time, mod 1.
    const localTime = instancedBufferAttribute<'float'>(timeAttribute, 'float').add(time.mul(0.02))
    const modTime = mod(localTime, 1.0)

    // Tumble the quad around its per-instance axis, then translate: spawn point plus
    // up to 50 units of drift along the per-instance direction over one loop.
    const rotatedPosition = rotate(positionLocal, instanceRotation.mul(modTime.mul(20)))
    return rotatedPosition.add(instancePosition).add(instanceDirection.mul(modTime.mul(50)))
  }, [positionAttribute, rotationAttribute, directionAttribute, timeAttribute])

  return (
    <mesh
      geometry={geometry}
      count={COUNT}
      frustumCulled={false}
      layers-mask={1 << layer}
    >
      <meshBasicNodeMaterial
        color={tint}
        map={map}
        alphaMap={map}
        alphaTest={0.1}
        side={DoubleSide}
        forceSinglePass
        positionNode={positionNode}
      />
    </mesh>
  )
}

// Suspends on the sprite fetch (B17 gate in the page component below); the quad
// geometry and the sRGB-tagged sprite are shared by all three layer materials.
function BlossomStorms() {
  const sprite = useTexture(SPRITE_URL)
  const map = useMemo(() => {
    sprite.colorSpace = SRGBColorSpace
    return sprite
  }, [sprite])
  const geometry = useMemo(() => new PlaneGeometry(0.25, 0.25), [])

  return (
    <>
      {LAYER_COLORS.map((tint, layer) => (
        <Blossoms key={layer} layer={layer} tint={tint} map={map} geometry={geometry} />
      ))}
    </>
  )
}

export default function Layers() {
  const { red, yellow, green } = useControls('layers', {
    red: { value: true, label: 'Red' },
    yellow: { value: true, label: 'Yellow' },
    green: { value: true, label: 'Green' },
  })

  return (
    <Canvas
      // Original renders with the WebGPURenderer default tone mapping (none) —
      // match it explicitly; fiber's Canvas default is ACESFilmic (AGENTS.md).
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [0, 0, 10], fov: 60, near: 0.1, far: 100 }}
    >
      <Background />
      <CameraLayers layers={[red, yellow, green]} />
      {/* B17 gate: useTexture suspends — never let suspension reach Canvas. */}
      <Suspense fallback={null}>
        <BlossomStorms />
      </Suspense>
      <DemoHelpers grid={false} maxDistance={60} />
    </Canvas>
  )
}
