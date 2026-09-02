// The compute pipeline + sprite field for compute-particles. Uses fiber hooks
// (`useBuffers`/`useNodes`/`useUniforms`/`useFrame`/`useThree`), so it lives inside
// <Canvas>, not in the page shell.
import { useEffect } from 'react'
import { float, Fn, hash, If, instancedArray, instanceIndex, shapeCircle, uniform, uv, vec3 } from 'three/tsl'
import { Vector3 } from 'three/webgpu'
import { useBuffers, useFrame, useNodes, useThree, useUniforms, type ThreeEvent } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'

const PARTICLE_COUNT = 200_000
const SEPARATION = 0.2
// Non-integer on purpose (the original does the same): the grid layout below only
// needs mod/div against it, exact squareness doesn't matter.
const AMOUNT = Math.sqrt(PARTICLE_COUNT)

export function Particles() {
  //* Controls =====================================================
  const values = useControls('compute-particles', {
    gravity: { value: -0.00098, min: -0.0098, max: 0, step: 0.0001 },
    bounce: { value: 0.8, min: 0.1, max: 1, step: 0.01 },
    friction: { value: 0.99, min: 0.96, max: 0.99, step: 0.01 },
    size: { value: 0.12, min: 0.12, max: 0.5, step: 0.01 },
  })
  const { uGravity, uBounce, uFriction, uSize } = useUniforms(
    {
      uGravity: values.gravity,
      uBounce: values.bounce,
      uFriction: values.friction,
      uSize: values.size,
    },
    'computeParticles',
  )

  const renderer = useThree((state) => state.renderer)

  //* GPU State ====================================================
  // The particle state, GPU-only. useBuffers is create-if-not-exists, so the
  // storage survives StrictMode double-render and the closures below are safe.
  const { particlePositions, particleVelocities, particleColors } = useBuffers(
    () => ({
      particlePositions: instancedArray(PARTICLE_COUNT, 'vec3'),
      particleVelocities: instancedArray(PARTICLE_COUNT, 'vec3'),
      particleColors: instancedArray(PARTICLE_COUNT, 'vec3'),
    }),
    'computeParticles',
  )

  //* Compute Graph =================================================
  const { computeInit, computeUpdate, computeHit, uClickPos, spritePositionNode, spriteColorNode, spriteOpacityNode } =
    useNodes(() => {
      // This event-driven uniform is intentionally graph-owned: React re-renders
      // must not overwrite the latest pointer position.
      const uClickPos = uniform(new Vector3(0, -1, 0))
      const offset = float(AMOUNT / 2)

      // (1) Init kernel: lay particles out as a flat grid and seed their tint.
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

      // (2) Simulation kernel: integrate gravity and bounce off the floor.
      const computeUpdate = Fn(() => {
        const position = particlePositions.element(instanceIndex)
        const velocity = particleVelocities.element(instanceIndex)

        velocity.addAssign(vec3(0.0, uGravity, 0.0))
        position.addAssign(velocity)
        velocity.mulAssign(uFriction)

        If(position.y.lessThan(0), () => {
          position.y.assign(0)
          velocity.y.assign(velocity.y.negate().mul(uBounce))
          velocity.x.mulAssign(0.9)
          velocity.z.mulAssign(0.9)
        })
      })().compute(PARTICLE_COUNT)

      // (3) Hit kernel: apply a randomized radial impulse from the pointer.
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
        spritePositionNode: particlePositions.toAttribute(),
        spriteColorNode: uv().mul(particleColors.element(instanceIndex)),
        spriteOpacityNode: shapeCircle(),
      }
    }, 'computeParticles')

  // ONCE: seed the buffers after commit. StrictMode may run this effect twice,
  // but the kernel is idempotent.
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
          scaleNode={uSize}
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
