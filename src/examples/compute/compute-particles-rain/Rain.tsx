// The rain simulation: GPU storage buffers + compute kernels + the collision
// heightmap rig, plus the two particle meshes (drops and impact ripples). Uses
// fiber hooks (`useBuffers`/`useNodes`/`useFrame`/`useThree`), so it lives inside
// <Canvas>, not in the page shell.
import { useEffect, useMemo } from 'react'
import { useBuffers, useFrame, useNodes, useThree } from '@react-three/fiber/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  deltaTime,
  Fn,
  hash,
  If,
  instancedArray,
  instanceIndex,
  positionGeometry,
  positionWorld,
  texture,
  time,
  uint,
  uv,
  vec2,
} from 'three/tsl'
import { billboarding } from 'three/tsl'
import {
  DoubleSide,
  HalfFloatType,
  MeshBasicNodeMaterial,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RenderTarget,
  type Node,
  type WebGPURenderer,
} from 'three/webgpu'

export const MAX_PARTICLE_COUNT = 50_000

export interface RainProps {
  /** Live draw-count throttle for both particle meshes (three's `Mesh.count`). */
  dropCount: number
}

export function Rain({ dropCount }: RainProps) {
  const scene = useThree((state) => state.scene)
  const rawRenderer = useThree((state) => state.renderer)
  // Cast: useThree types renderer as the WebGL/WebGPU union even on the `/webgpu`
  // entry (fiber typing gap, UPSTREAM.md B9) — `.compute()` and RenderTarget-typed
  // `.setRenderTarget()` exist only on WebGPURenderer.
  const renderer = rawRenderer as WebGPURenderer

  // The collision rig: a top-down orthographic camera that sees ONLY layer 1 (the
  // colliders opt in via `layers.enable(1)`, see Colliders.tsx) renders world
  // positions into a HalfFloat render target — a live heightmap the compute kernel
  // samples to find the surface under each drop. Never disposed in a cleanup:
  // StrictMode would kill the memoized instance for good (AGENTS.md).
  const rig = useMemo(() => {
    const collisionCamera = new OrthographicCamera(-50, 50, 50, -50, 0.1, 50)
    collisionCamera.position.y = 50
    collisionCamera.lookAt(0, 0, 0)
    collisionCamera.layers.disableAll()
    collisionCamera.layers.enable(1)

    const collisionPosRT = new RenderTarget(1024, 1024)
    collisionPosRT.texture.type = HalfFloatType
    collisionPosRT.texture.magFilter = NearestFilter
    collisionPosRT.texture.minFilter = NearestFilter
    collisionPosRT.texture.generateMipmaps = false

    const collisionPosMaterial = new MeshBasicNodeMaterial()
    collisionPosMaterial.colorNode = positionWorld

    return { collisionCamera, collisionPosRT, collisionPosMaterial }
  }, [])

  // Ripple geometry: one flat quad + two crossed vertical quads merged into a single
  // instanced draw, exactly as the original builds it with BufferGeometryUtils.
  const rippleGeometry = useMemo(() => {
    const surfaceGeometry = new PlaneGeometry(2.5, 2.5)
    surfaceGeometry.rotateX(-Math.PI / 2)

    const xGeometry = new PlaneGeometry(1, 2)
    xGeometry.rotateY(-Math.PI / 2)

    const zGeometry = new PlaneGeometry(1, 2)

    return mergeGeometries([surfaceGeometry, xGeometry, zGeometry])
  }, [])

  // Particle state, GPU-only. UNSCOPED on purpose: scoped useBuffers names each
  // buffer `${scope}.${name}` and the dot lands in the WGSL struct name — runtime
  // shader compile error (fiber bug, UPSTREAM.md B16). Prefixed root-level keys.
  const { rainPositions, rainVelocities, ripplePositions, rippleTimes } = useBuffers(() => ({
    rainPositions: instancedArray(MAX_PARTICLE_COUNT, 'vec3'),
    rainVelocities: instancedArray(MAX_PARTICLE_COUNT, 'vec3'),
    ripplePositions: instancedArray(MAX_PARTICLE_COUNT, 'vec3'),
    rippleTimes: instancedArray(MAX_PARTICLE_COUNT, 'vec3'),
  }))

  // All node graphs built exactly once, closing over the TYPED hook returns above
  // (creator-state reads widen to fiber's BufferLike, losing `.element()`/
  // `.toAttribute()` — AGENTS.md). Also UNSCOPED (UPSTREAM.md B16): every one of
  // these reaches WGSL codegen. Original's `.setName('Particles')` dropped —
  // fiber re-labels stored nodes by key.
  const {
    rainComputeInit,
    rainComputeUpdate,
    rainColorNode,
    rainVertexNode,
    rippleColorNode,
    ripplePositionNode,
    rippleOpacityNode,
  } = useNodes(() => {
    // Build-time random salts (JS runs once when the graph is built — that is
    // exactly what the original's module-scope randUint() does too).
    const randUint = () => uint(Math.floor(Math.random() * 0xffffff))

    // World XZ (-50..50) → collision texture UV (0..1).
    const getCoord = (pos: Node<'vec2'>) => pos.add(50).div(100)

    // (1) Init kernel: scatter drops over the 100x100 field, randomize fall speed,
    // park every ripple far past its lifetime. Runs once, from the effect below;
    // StrictMode's double-run writes the same values (hash is deterministic).
    const rainComputeInit = Fn(() => {
      const position = rainPositions.element(instanceIndex)
      const velocity = rainVelocities.element(instanceIndex)
      const rippleTime = rippleTimes.element(instanceIndex)

      const randX = hash(instanceIndex)
      const randY = hash(instanceIndex.add(randUint()))
      const randZ = hash(instanceIndex.add(randUint()))

      position.x.assign(randX.mul(100).add(-50))
      position.y.assign(randY.mul(25))
      position.z.assign(randZ.mul(100).add(-50))

      velocity.y.assign(randX.mul(-0.04).add(-0.2))

      rippleTime.x.assign(1000)
    })().compute(MAX_PARTICLE_COUNT)

    // (2) Simulation kernel: integrate, then test each drop against the collision
    // heightmap sampled at its XZ. On impact: respawn the drop at the top in a new
    // random column, and hand its slot's ripple the impact point (rippleTime.x is
    // the ripple's age — the ripple graphs below animate from it). The trailing If
    // kills ripples whose surface has since moved out from under them (the
    // animated collision box / rotating monkey). GPU-side `If()`s — a JS `if`
    // here would run once at graph build (AGENTS.md).
    const rainComputeUpdate = Fn(() => {
      const position = rainPositions.element(instanceIndex)
      const velocity = rainVelocities.element(instanceIndex)
      const ripplePosition = ripplePositions.element(instanceIndex)
      const rippleTime = rippleTimes.element(instanceIndex)

      position.addAssign(velocity)

      rippleTime.x.addAssign(deltaTime.mul(4))

      const collisionArea = texture(rig.collisionPosRT.texture, getCoord(position.xz))

      const surfaceOffset = 0.05
      const floorPosition = collisionArea.y.add(surfaceOffset)

      // The drop sprite is 2 units tall with its pivot at the center — the visual
      // tip sits 0.9 below, so collide the tip, not the pivot.
      const ripplePivotOffsetY = -0.9

      If(position.y.add(ripplePivotOffsetY).lessThan(floorPosition), () => {
        position.y.assign(25)

        ripplePosition.xz.assign(position.xz)
        ripplePosition.y.assign(floorPosition)

        // reset hit time: x = time
        rippleTime.x.assign(1)

        // next drops will not fall in the same place. Casts: the typed uint
        // `.add()`/`hash()` surfaces reject float operands, but mixed-type math
        // is what the original writes and hash() itself starts with
        // `seed.toUint()` (three/src/nodes/math/Hash.js) — typed-TSL inference
        // gap (B10 cast family).
        const timeSalt = time as unknown as Node<'uint'>
        const timeSalt2 = time.add(randUint()) as unknown as Node<'uint'>
        position.x.assign(hash(instanceIndex.add(timeSalt)).mul(100).add(-50))
        position.z.assign(hash(instanceIndex.add(timeSalt2)).mul(100).add(-50))
      })

      const rippleOnSurface = texture(rig.collisionPosRT.texture, getCoord(ripplePosition.xz))
      const rippleFloorArea = rippleOnSurface.y.add(surfaceOffset)

      If(ripplePosition.y.greaterThan(rippleFloorArea), () => {
        rippleTime.x.assign(1000)
      })
    })().compute(MAX_PARTICLE_COUNT)

    // Drop sprite graphs: a soft vertical streak (bright near the falling tip) on a
    // camera-facing quad; `billboarding()` replaces the whole vertex transform,
    // placing each instance at its storage-buffer position.
    const rainColorNode = uv().distance(vec2(0.5, 0)).oneMinus().mul(3).exp().mul(0.1)
    const rainVertexNode = billboarding({ position: rainPositions.toAttribute() })

    // Ripple graphs: an expanding ring driven by the ripple's age. The storage read
    // is per-INSTANCE (instanceIndex), shared by all three merged quads of one ripple.
    const rippleAge = rippleTimes.element(instanceIndex).x

    const ring = Fn(() => {
      const center = uv().add(vec2(-0.5)).length().mul(7)
      const distanceFromWave = rippleAge.sub(center)

      return distanceFromWave.min(1).sub(distanceFromWave.max(1).sub(1))
    })

    return {
      rainComputeInit,
      rainComputeUpdate,
      rainColorNode,
      rainVertexNode,
      rippleColorNode: ring(),
      ripplePositionNode: positionGeometry.add(ripplePositions.toAttribute()),
      rippleOpacityNode: rippleAge.mul(0.3).oneMinus().max(0).mul(0.5),
    }
  })

  // ONCE: seed the buffers. Sync compute() is safe in an effect — fiber awaits
  // renderer.init() before children render (AGENTS.md compute pattern).
  useEffect(() => {
    renderer.compute(rainComputeInit)
  }, [renderer, rainComputeInit])

  // EVERY FRAME, ordered before the default render job (NOT phase:'render' — that
  // would take over rendering): 1) re-render the colliders' world positions into
  // the collision RT through scene.overrideMaterial (only layer-1 objects pass the
  // collision camera's mask), 2) restore, 3) step the simulation against the fresh
  // heightmap. Mirrors the original's animate() ordering exactly.
  useFrame(
    () => {
      scene.overrideMaterial = rig.collisionPosMaterial
      renderer.setRenderTarget(rig.collisionPosRT)
      renderer.render(scene, rig.collisionCamera)

      scene.overrideMaterial = null
      renderer.setRenderTarget(null)

      renderer.compute(rainComputeUpdate)
    },
    { before: 'render' },
  )

  return (
    <>
      {/* Drops: one 0.1x2 plane drawn `dropCount` times; positions live only on the
          GPU, so three's culling sphere knows nothing — frustumCulled must be off
          (AGENTS.md; the original carries this latent bug and never pans). */}
      <mesh count={dropCount} frustumCulled={false}>
        <planeGeometry args={[0.1, 2]} />
        <meshBasicNodeMaterial
          colorNode={rainColorNode}
          vertexNode={rainVertexNode}
          opacity={0.2}
          side={DoubleSide}
          forceSinglePass
          depthWrite={false}
          transparent
        />
      </mesh>
      {/* Ripples: the merged flat+crossed quads, offset per instance from the
          ripple-position storage buffer. */}
      <mesh count={dropCount} geometry={rippleGeometry} frustumCulled={false}>
        <meshBasicNodeMaterial
          colorNode={rippleColorNode}
          positionNode={ripplePositionNode}
          opacityNode={rippleOpacityNode}
          side={DoubleSide}
          forceSinglePass
          depthWrite={false}
          transparent
        />
      </mesh>
    </>
  )
}
