// The compute pipeline + sprite field for tsl-compute-attractors-particles.
// Uses fiber hooks (`useBuffers`/`useNodes`/`useUniforms`/`useFrame`/`useThree`),
// so it lives inside <Canvas>, not in the page shell.
import { useEffect } from 'react'
import { useBuffers, useFrame, useNodes, useThree, useUniforms } from '@react-three/fiber/webgpu'
import {
  cos,
  float,
  Fn,
  hash,
  If,
  instancedArray,
  instanceIndex,
  Loop,
  mix,
  mod,
  PI,
  sin,
  uint,
  uniformArray,
  vec3,
  vec4,
} from 'three/tsl'
import { AdditiveBlending, Vector3, type Node, type WebGPURenderer } from 'three/webgpu'
import { ATTRACTOR_COUNT, ATTRACTOR_DEFAULT_POSITIONS, ATTRACTOR_ROTATION_AXES } from './attractors'

export const PARTICLE_COUNT = 2 ** 18 // 262,144 — same as the original
const GRAVITY_CONSTANT = 6.67e-11

// Build-time random seed for the hash-based per-particle randoms (the original
// inlines `Math.random() * 0xffffff` at graph build the same way).
const seed = () => uint(Math.floor(Math.random() * 0xffffff))

export interface AttractorParticlesProps {
  /** Live attractor positions (leva), synced into the uniformArray each render. */
  attractorPositions: readonly { x: number; y: number; z: number }[]
  attractorMass: number
  particleGlobalMass: number
  timeScale: number
  spinningStrength: number
  maxSpeed: number
  velocityDamping: number
  scale: number
  boundHalfExtent: number
  colorA: string
  colorB: string
  /** Incremented by the leva Reset button — re-dispatches the init kernel. */
  resetCount: number
}

export function AttractorParticles({
  attractorPositions,
  attractorMass,
  particleGlobalMass,
  timeScale,
  spinningStrength,
  maxSpeed,
  velocityDamping,
  scale,
  boundHalfExtent,
  colorA,
  colorB,
  resetCount,
}: AttractorParticlesProps) {
  const rawRenderer = useThree((state) => state.renderer)
  // Cast: useThree types renderer as the WebGL/WebGPU union even on the `/webgpu`
  // entry (fiber typing gap, UPSTREAM.md B9) — `.compute()` exists only on WebGPURenderer.
  const renderer = rawRenderer as WebGPURenderer

  // Leva knobs → live uniforms: create-or-update semantics sync new values on
  // every re-render; the graphs below reference the stable node instances.
  const {
    uAttractorMass,
    uParticleGlobalMass,
    uTimeScale,
    uSpinningStrength,
    uMaxSpeed,
    uVelocityDamping,
    uScale,
    uBoundHalfExtent,
    uColorA,
    uColorB,
  } = useUniforms(
    {
      uAttractorMass: attractorMass,
      uParticleGlobalMass: particleGlobalMass,
      uTimeScale: timeScale,
      uSpinningStrength: spinningStrength,
      uMaxSpeed: maxSpeed,
      uVelocityDamping: velocityDamping,
      uScale: scale,
      uBoundHalfExtent: boundHalfExtent,
      uColorA: colorA,
      uColorB: colorB,
    },
    'attractorParticles', // WGSL-identifier rule: camelCase scope, never kebab-case
  )
  // Casts: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`
  // (documented fiber typing gap — see tsl-galaxy et al.).
  const uAttractorMassNode = uAttractorMass as unknown as Node<'float'>
  const uParticleGlobalMassNode = uParticleGlobalMass as unknown as Node<'float'>
  const uTimeScaleNode = uTimeScale as unknown as Node<'float'>
  const uSpinningStrengthNode = uSpinningStrength as unknown as Node<'float'>
  const uMaxSpeedNode = uMaxSpeed as unknown as Node<'float'>
  const uVelocityDampingNode = uVelocityDamping as unknown as Node<'float'>
  const uScaleNode = uScale as unknown as Node<'float'>
  const uBoundHalfExtentNode = uBoundHalfExtent as unknown as Node<'float'>
  const uColorANode = uColorA as unknown as Node<'vec3'>
  const uColorBNode = uColorB as unknown as Node<'vec3'>

  // The particle state, GPU-only. UNSCOPED on purpose: scoped useBuffers names
  // each buffer `${scope}.${name}` and the dot lands in the WGSL struct name —
  // runtime shader compile error (fiber bug, UPSTREAM.md B16). Root-level keys
  // are bare identifiers, so they stay WGSL-legal; prefix them instead.
  const { attractorParticlePositions, attractorParticleVelocities } = useBuffers(() => ({
    attractorParticlePositions: instancedArray(PARTICLE_COUNT, 'vec3'),
    attractorParticleVelocities: instancedArray(PARTICLE_COUNT, 'vec3'),
  }))

  // All node graphs built exactly once; we close over the TYPED useBuffers
  // returns instead of reading back through the creator-state ScopedStore
  // (which widens to `BufferLike`, losing `.element()`/`.toAttribute()`).
  // Also UNSCOPED (UPSTREAM.md B16). Fiber setNames each stored node after its
  // key, so the bare keys replace the original's `.setName('Update Particles')`.
  const { computeInit, computeUpdate, uAttractorPositions, spritePositionNode, spriteColorNode, spriteScaleNode } =
    useNodes(() => {
      // Attractor state as uniformArrays, indexable from the GPU loop. The
      // position Vector3s are LIVE — the sync effect below mutates them and the
      // kernel sees it, zero extra plumbing (same idea as lights-pointlights).
      // Explicit type argument: `uniformArray` infers its element type param as
      // bare `string` from a 'vec3' literal, so `.element()` loses the fluent
      // TSL surface — same family as the `instancedBufferAttribute<T>` rule.
      const uAttractorPositions = uniformArray<'vec3'>(
        ATTRACTOR_DEFAULT_POSITIONS.map((v) => v.clone()),
        'vec3',
      )
      const uAttractorRotationAxes = uniformArray<'vec3'>(
        ATTRACTOR_ROTATION_AXES.map((v) => v.clone()),
        'vec3',
      )

      const sphericalToVec3 = Fn(([phiRaw, thetaRaw]) => {
        // Cast: Fn destructured params type as bare ShaderNodeObject<Node>, so
        // typed TSL math won't resolve through them (three typing gap, UPSTREAM.md B10).
        const phi = phiRaw as unknown as Node<'float'>
        const theta = thetaRaw as unknown as Node<'float'>
        const sinPhiRadius = sin(phi)
        return vec3(sinPhiRadius.mul(sin(theta)), cos(phi), sinPhiRadius.mul(cos(theta)))
      })

      // (1) Init kernel: flat disc of particles (wide in x/z, thin in y), each
      // with a small random spherical velocity. Dispatched at mount + on Reset.
      const computeInit = Fn(() => {
        const position = attractorParticlePositions.element(instanceIndex)
        const velocity = attractorParticleVelocities.element(instanceIndex)

        const basePosition = vec3(
          hash(instanceIndex.add(seed())),
          hash(instanceIndex.add(seed())),
          hash(instanceIndex.add(seed())),
        )
          .sub(0.5)
          .mul(vec3(5, 0.2, 5))
        position.assign(basePosition)

        const phi = hash(instanceIndex.add(seed())).mul(PI).mul(2)
        const theta = hash(instanceIndex.add(seed())).mul(PI)
        const baseVelocity = sphericalToVec3(phi, theta).mul(0.05)
        velocity.assign(baseVelocity)
      })().compute(PARTICLE_COUNT)

      // Per-particle mass multiplier — shared by the update kernel (physics)
      // and the sprite scaleNode (heavier particle = bigger sprite).
      const particleMassMultiplier = hash(instanceIndex.add(seed())).remap(0.25, 1).toVar()
      const particleMass = particleMassMultiplier.mul(uParticleGlobalMassNode).toVar()

      // (2) Update kernel: Newtonian gravity toward each attractor plus a
      // rotational force around its axis, speed clamp (GPU `If()`, not JS `if`),
      // damping, integration, and a wrap-around bounding box.
      const computeUpdate = Fn(() => {
        // Fixed timestep (like the original) for a consistent simulation.
        const delta = float(1 / 60)
          .mul(uTimeScaleNode)
          .toVar()
        const position = attractorParticlePositions.element(instanceIndex)
        const velocity = attractorParticleVelocities.element(instanceIndex)

        const force = vec3(0).toVar()

        Loop(ATTRACTOR_COUNT, ({ i }) => {
          const attractorPosition = uAttractorPositions.element(i)
          const attractorRotationAxis = uAttractorRotationAxes.element(i)
          const toAttractor = attractorPosition.sub(position)
          const distance = toAttractor.length()
          const direction = toAttractor.normalize()

          // gravity
          const gravityStrength = particleMass
            .mul(uAttractorMassNode)
            .mul(GRAVITY_CONSTANT)
            .div(distance.pow(2))
            .toVar()
          force.addAssign(direction.mul(gravityStrength))

          // spinning
          const spinningForce = attractorRotationAxis.mul(gravityStrength).mul(uSpinningStrengthNode)
          force.addAssign(spinningForce.cross(toAttractor))
        })

        // velocity
        velocity.addAssign(force.mul(delta))
        const speed = velocity.length()
        If(speed.greaterThan(uMaxSpeedNode), () => {
          velocity.assign(velocity.normalize().mul(uMaxSpeedNode))
        })
        velocity.mulAssign(float(uVelocityDampingNode).oneMinus())

        // position
        position.addAssign(velocity.mul(delta))

        // box loop: wrap positions into the [-half, +half] cube
        const halfHalfExtent = float(uBoundHalfExtentNode).div(2).toVar()
        position.assign(mod(position.add(halfHalfExtent), uBoundHalfExtentNode).sub(halfHalfExtent))
      })().compute(PARTICLE_COUNT)

      // Sprite graph: position straight from the storage buffer; color ramps
      // from colorA to colorB with speed; scale follows the particle's mass.
      const speed = attractorParticleVelocities.toAttribute().length()
      const colorMix = speed.div(uMaxSpeedNode).smoothstep(0, 0.5)

      return {
        computeInit,
        computeUpdate,
        uAttractorPositions,
        spritePositionNode: attractorParticlePositions.toAttribute(),
        spriteColorNode: vec4(mix(uColorANode, uColorBNode, colorMix), 1),
        spriteScaleNode: particleMassMultiplier.mul(uScaleNode),
      }
    })

  // ONCE at mount + on every leva Reset press: (re)seed the buffers. Sync
  // compute() is safe in an effect — fiber awaits renderer.init() before
  // children render; StrictMode's double-run re-seeds the same distribution.
  useEffect(() => {
    renderer.compute(computeInit)
  }, [renderer, computeInit, resetCount])

  // Sync the leva attractor positions into the live uniformArray Vector3s.
  // Runs every render — three Vector3.set calls, cheap. Cast: the types
  // declare `array: unknown[]`, but a 'vec3' uniformArray holds Vector3s.
  useEffect(() => {
    const live = uAttractorPositions.array as Vector3[]
    attractorPositions.forEach((p, i) => live[i]?.set(p.x, p.y, p.z))
  })

  // EVERY FRAME: step the simulation before the default render phase draws it.
  // Compute dispatch is not a render takeover — never `phase: 'render'`.
  useFrame(
    () => {
      renderer.compute(computeUpdate)
    },
    { phase: 'update' },
  )

  return (
    /* One sprite drawing 262k instances; positions live only on the GPU, so
       three's culling sphere knows nothing — frustumCulled must be off. */
    <sprite count={PARTICLE_COUNT} frustumCulled={false}>
      <spriteNodeMaterial
        positionNode={spritePositionNode}
        colorNode={spriteColorNode}
        scaleNode={spriteScaleNode}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </sprite>
  )
}
