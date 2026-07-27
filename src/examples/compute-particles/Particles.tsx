// The compute pipeline + sprite field for compute-particles. Uses fiber hooks
// (`useBuffers`/`useNodes`/`useUniforms`/`useFrame`/`useThree`), so it lives inside
// <Canvas>, not in the page shell.
import { useEffect } from 'react'
import {
  useBuffers,
  useFrame,
  useNodes,
  useThree,
  useUniforms,
  type ThreeEvent,
} from '@react-three/fiber/webgpu'
import { float, Fn, hash, If, instancedArray, instanceIndex, shapeCircle, uniform, uv, vec3 } from 'three/tsl'
import { Vector3, type Node, type WebGPURenderer } from 'three/webgpu'

const PARTICLE_COUNT = 200_000
const SEPARATION = 0.2
// Non-integer on purpose (the original does the same): the grid layout below only
// needs mod/div against it, exact squareness doesn't matter.
const AMOUNT = Math.sqrt(PARTICLE_COUNT)

export interface ParticlesProps {
  gravity: number
  bounce: number
  friction: number
  size: number
}

export function Particles({ gravity, bounce, friction, size }: ParticlesProps) {
  const rawRenderer = useThree((state) => state.renderer)
  // Cast: useThree types renderer as the WebGL/WebGPU union even on the `/webgpu`
  // entry (fiber typing gap, UPSTREAM.md B9) — `.compute()` exists only on WebGPURenderer.
  const renderer = rawRenderer as WebGPURenderer

  // Leva knobs → live uniforms: create-or-update semantics sync new values on every
  // re-render, the compute graphs below reference the stable node instances.
  const { uGravity, uBounce, uFriction, uSize } = useUniforms(
    { uGravity: gravity, uBounce: bounce, uFriction: friction, uSize: size },
    'computeParticles', // WGSL-identifier rule: camelCase scope, never kebab-case
  )
  // Casts: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`
  // (documented fiber typing gap — see tsl-galaxy et al.).
  const uGravityNode = uGravity as unknown as Node<'float'>
  const uBounceNode = uBounce as unknown as Node<'float'>
  const uFrictionNode = uFriction as unknown as Node<'float'>
  const uSizeNode = uSize as unknown as Node<'float'>

  // The particle state, GPU-only. useBuffers is create-if-not-exists, so the
  // storage survives StrictMode double-render and the closures below are safe.
  // UNSCOPED on purpose: scoped useBuffers names each buffer `${scope}.${name}`
  // and the dot lands in the WGSL struct name — runtime shader compile error
  // (fiber bug, UPSTREAM.md B16; same family as scoped useNodes). Root-level
  // keys are bare identifiers, so they stay WGSL-legal; prefix them instead.
  const { particlePositions, particleVelocities, particleColors } = useBuffers(() => ({
    particlePositions: instancedArray(PARTICLE_COUNT, 'vec3'),
    particleVelocities: instancedArray(PARTICLE_COUNT, 'vec3'),
    particleColors: instancedArray(PARTICLE_COUNT, 'vec3'),
  }))

  // All node graphs built exactly once. We close over the typed hook returns instead
  // of reading them back through the creator-state ScopedStore — the store leaf
  // widens to fiber's `BufferLike` union, losing `.element()`/`.toAttribute()`
  // (same finding as compute-texture). Also UNSCOPED (UPSTREAM.md B16): the sprite
  // nodes below reach WGSL codegen, and a scope would inject a `.` into their names.
  // Fiber setNames each stored node after its key, so the bare keys double as the
  // labels the original set via `.setName('Init Particles')` etc.
  const { computeInit, computeUpdate, computeHit, uClickPos, spritePositionNode, spriteColorNode, spriteOpacityNode } =
    useNodes(() => {
      // Pointer-driven uniform: plain TSL `uniform()`, NOT useUniforms — mutated
      // imperatively per pointer event; a React re-render must never write it back
      // (see header DIVERGENCE).
      const uClickPos = uniform(new Vector3(0, -1, 0))

      const offset = float(AMOUNT / 2)

      // (1) Init kernel: lay the particles out as a flat grid, give each a random
      // red/green tint. Runs once, from the effect below.
      const computeInit = Fn(() => {
        const position = particlePositions.element(instanceIndex)
        const color = particleColors.element(instanceIndex)

        const x = instanceIndex.mod(AMOUNT)
        const z = instanceIndex.div(AMOUNT)

        position.x.assign(offset.sub(x).mul(SEPARATION))
        position.z.assign(offset.sub(z).mul(SEPARATION))

        color.x.assign(hash(instanceIndex))
        color.y.assign(hash(instanceIndex.add(2)))
      })().compute(PARTICLE_COUNT)

      // (2) Simulation kernel: integrate gravity, bounce off the floor. The floor
      // test is a TSL `If()` — a JS `if` here would run once at graph build.
      const computeUpdate = Fn(() => {
        const position = particlePositions.element(instanceIndex)
        const velocity = particleVelocities.element(instanceIndex)

        velocity.addAssign(vec3(0.0, uGravityNode, 0.0))
        position.addAssign(velocity)
        velocity.mulAssign(uFrictionNode)

        If(position.y.lessThan(0), () => {
          position.y.assign(0)
          velocity.y.assign(velocity.y.negate().mul(uBounceNode))

          // floor friction
          velocity.x.assign(velocity.x.mul(0.9))
          velocity.z.assign(velocity.z.mul(0.9))
        })
      })().compute(PARTICLE_COUNT)

      // (3) Hit kernel: radial impulse away from the pointer, falling off over
      // 3 units, per-particle randomized. Dispatched per pointer event.
      const computeHit = Fn(() => {
        const position = particlePositions.element(instanceIndex)
        const velocity = particleVelocities.element(instanceIndex)

        const dist = position.distance(uClickPos)
        const direction = position.sub(uClickPos).normalize()
        const distArea = float(3).sub(dist).max(0)

        const power = distArea.mul(0.01)
        const relativePower = power.mul(hash(instanceIndex).mul(1.5).add(0.5))

        velocity.addAssign(direction.mul(relativePower))
      })().compute(PARTICLE_COUNT)

      return {
        computeInit,
        computeUpdate,
        computeHit,
        uClickPos,
        // Sprite graph: position straight from the storage buffer, per-instance
        // color tint, round shape from `shapeCircle()`.
        spritePositionNode: particlePositions.toAttribute(),
        spriteColorNode: uv().mul(particleColors.element(instanceIndex)),
        spriteOpacityNode: shapeCircle(),
      }
    })

  // ONCE: seed the buffers. Sync compute() is safe in an effect — fiber awaits
  // renderer.init() before children render; StrictMode re-run writes the same grid.
  useEffect(() => {
    renderer.compute(computeInit)
  }, [renderer, computeInit])

  // EVERY FRAME: step the simulation before the default render phase draws it.
  useFrame(
    () => {
      renderer.compute(computeUpdate)
    },
    { phase: 'update' },
  )

  // ON DEMAND: ripple away from the pointer. `event.point` is the world-space
  // plane intersection — R3F already did the raycast.
  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    // A held button means this move is a camera-controls drag — skip the ripple
    // (the original's isOrbitControlsActive guard).
    if (event.buttons !== 0) return

    uClickPos.value.copy(event.point)
    uClickPos.value.y = -1 // push from below the floor so particles pop upward

    renderer.compute(computeHit)
  }

  return (
    <>
      {/* One Sprite drawing 200k instances; positions live only on the GPU, so
          three's culling sphere knows nothing — frustumCulled must be off. */}
      <sprite count={PARTICLE_COUNT} frustumCulled={false}>
        <spriteNodeMaterial
          positionNode={spritePositionNode}
          colorNode={spriteColorNode}
          scaleNode={uSizeNode}
          opacityNode={spriteOpacityNode}
          alphaToCoverage
          transparent
        />
      </sprite>
      {/* Invisible hit plane: material-invisible (not mesh-invisible) so it still
          raycasts; the only object with pointer handlers. */}
      <mesh rotation-x={-Math.PI / 2} onPointerMove={onPointerMove}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </>
  )
}
