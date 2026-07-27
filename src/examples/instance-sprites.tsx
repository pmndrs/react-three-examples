/**
 * instance-sprites
 * R3F port of three.js `webgpu_instance_sprites`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_instance_sprites (~120 lines of JS)
 *
 * DEMONSTRATES
 * - 10,000 GPU-instanced sprites from ONE `<sprite count={N}>` and one
 *   `SpriteNodeMaterial`: `positionNode = instancedBufferAttribute(...)` scatters
 *   every instance from a per-instance attribute, so a single draw call renders the
 *   whole snowfield — the Sprite object itself never moves
 * - Per-instance animation with zero per-frame JS: `rotationNode =
 *   time.add(instanceIndex).sin()` gives each snowflake its own spin phase from the
 *   TSL `instanceIndex` built-in
 * - `scaleNode` as a live TSL `uniform()`: the sizeAttenuation toggle flips the
 *   material flag (a shader-rebuild property in r185 — its setter bumps
 *   `needsUpdate`) and swaps the scale value between world units (15) and
 *   clip-space size (0.03) by mutating `.value`
 * - `material.color` mutated per frame (`setHSL` hue sweep in `useFrame`) with no
 *   uniform plumbing — node-material color/scalar fields are reference-node-backed
 *   and re-read every frame
 * - Declarative `<fogExp2 attach="fog">`, auto-wrapped into a fog node by the
 *   WebGPU renderer (no custom TSL fog graph needed)
 *
 * DIVERGENCE from original
 * - The Inspector GUI (`renderer.inspector.createParameters`) becomes leva: same
 *   `sizeAttenuation` toggle, plus added `hueSpeed` (run-time multiplier on the hue
 *   sweep) and `count` (build-time rebuild of attribute + material) — the original
 *   hard-codes both
 * - The original's explicit `material.needsUpdate = true` in the toggle callback is
 *   dropped: r185's `sizeAttenuation` setter already bumps `needsUpdate` itself
 *   (verified in three/src/materials/nodes/SpriteNodeMaterial.js)
 * - Mouse-parallax camera drift (pointermove easing + per-frame `lookAt(origin)`)
 *   replaced by DemoHelpers CameraControls orbit — writing `camera.position`
 *   directly is futile alongside camera-controls; orbit is strictly more capable.
 *   Grid disabled (sprites float in a fogged black void); dolly capped inside the
 *   original's far plane
 * - `frustumCulled={false}` on the sprite: instance placement lives only in
 *   `positionNode`, so three's culling sphere is the unit sprite quad at the
 *   origin — the original carries the same latent bug and always looks at origin
 * - `renderer={{ toneMapping: NoToneMapping }}` set explicitly: the original
 *   renders with the WebGPURenderer default; fiber's Canvas would otherwise
 *   default to ACESFilmic and mute the hue sweep
 * - Texture via drei's suspending `useTexture` (B17 Suspense gate) instead of a
 *   bare `TextureLoader().load()`; snowflake sprite hotlinked from jsdelivr r185
 * - Hue clock driven by `state.elapsed` instead of `Date.now()` (same 0.05/s rate);
 *   `instanceIndex` explicitly `.toFloat()`ed before the float add (same codegen —
 *   TSL would coerce anyway; strict-tsc-friendly)
 */
import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { instancedBufferAttribute, instanceIndex, time, uniform } from 'three/tsl'
import { InstancedBufferAttribute, NoToneMapping, SpriteNodeMaterial, SRGBColorSpace } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const SNOWFLAKE_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/sprites/snowflake1.png'

interface SnowFieldProps {
  count: number
  sizeAttenuation: boolean
  hueSpeed: number
}

function SnowField({ count, sizeAttenuation, hueSpeed }: SnowFieldProps) {
  const map = useTexture(SNOWFLAKE_URL)

  // Build-time: attribute + material rebuilt only when `count` changes (fresh
  // randoms), exactly like the original's one-time scatter in a 2000-unit cube.
  const { material, scaleUniform } = useMemo(() => {
    map.colorSpace = SRGBColorSpace

    const positions = new Float32Array(count * 3)
    for (let i = 0; i < positions.length; i++) {
      positions[i] = 2000 * Math.random() - 1000
    }
    const positionAttribute = new InstancedBufferAttribute(positions, 3)

    const mat = new SpriteNodeMaterial({ sizeAttenuation: true, map, alphaMap: map, alphaTest: 0.1 })
    mat.color.setHSL(1.0, 0.3, 0.7, SRGBColorSpace)
    // Explicit type param: typed-TSL creators don't infer from their args (AGENTS.md).
    mat.positionNode = instancedBufferAttribute<'vec3'>(positionAttribute, 'vec3')
    mat.rotationNode = time.add(instanceIndex.toFloat()).sin()

    const scaleUniform = uniform(15)
    mat.scaleNode = scaleUniform

    return { material: mat, scaleUniform }
  }, [map, count])

  // sizeAttenuation is a build-time material flag — the r185 setter bumps
  // needsUpdate on change (shader rebuild); the paired scale value keeps the
  // flakes the same apparent size in both modes. Idempotent, StrictMode-safe.
  useEffect(() => {
    material.sizeAttenuation = sizeAttenuation
    scaleUniform.value = sizeAttenuation ? 15 : 0.03
  }, [material, scaleUniform, sizeAttenuation])

  // The original's per-frame hue sweep (Date.now() * 0.00005 ≡ 0.05/s), verbatim
  // otherwise: material.color is reference-node-backed, mutation is enough.
  useFrame((state) => {
    const t = state.elapsed * 0.05 * hueSpeed
    const h = ((360 * (1.0 + t)) % 360) / 360
    material.color.setHSL(h, 0.5, 0.5)
  })

  // Placement lives only in positionNode — see header DIVERGENCE.
  return <sprite material={material} count={count} frustumCulled={false} />
}

export default function InstanceSprites() {
  const { sizeAttenuation, hueSpeed, count } = useControls('instance-sprites', {
    sizeAttenuation: true,
    hueSpeed: { value: 1, min: 0, max: 5, step: 0.1 },
    count: { value: 10000, min: 1000, max: 100000, step: 1000 },
  })

  return (
    <Canvas
      // Original renders with the WebGPURenderer default tone mapping (none) —
      // match it explicitly; fiber's Canvas default is ACESFilmic (AGENTS.md).
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 0, 1000], fov: 55, near: 2, far: 2000 }}
    >
      <fogExp2 attach="fog" args={['#000000', 0.001]} />
      {/* B17 gate: useTexture suspends — never let suspension reach Canvas. */}
      <Suspense fallback={null}>
        <SnowField count={count} sizeAttenuation={sizeAttenuation} hueSpeed={hueSpeed} />
      </Suspense>
      <DemoHelpers grid={false} minDistance={10} maxDistance={1800} />
    </Canvas>
  )
}
