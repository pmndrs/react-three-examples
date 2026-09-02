// The compute pipeline + sprite field for tsl-compute-attractors-particles.
// Uses fiber hooks (`useBuffers`/`useNodes`/`useUniforms`/`useFrame`/`useThree`),
// so it lives inside <Canvas>, not in the page shell.
import { useEffect, useState } from 'react'
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
import { AdditiveBlending, Vector3 } from 'three/webgpu'

import { useBuffers, useFrame, useNodes, useThree, useUniforms } from '@react-three/fiber/webgpu'
import { button, useControls } from 'leva'

import { ATTRACTOR_COUNT, ATTRACTOR_DEFAULT_POSITIONS, ATTRACTOR_ROTATION_AXES } from './attractors'

export const PARTICLE_COUNT = 2 ** 18 // 262,144 — same as the original
const GRAVITY_CONSTANT = 6.67e-11

// Build-time random seed for the hash-based per-particle randoms (the original
// inlines `Math.random() * 0xffffff` at graph build the same way).
const seed = () => uint(Math.floor(Math.random() * 0xffffff))

export interface AttractorParticlesProps {
  /** Live attractor positions (leva, shared with AttractorHelpers), synced into the
   * uniformArray each render. */
  attractorPositions: readonly { x: number; y: number; z: number }[]
}

export function AttractorParticles({ attractorPositions }: AttractorParticlesProps) {
  const renderer = useThree((state) => state.renderer)
  const [resetCount, setResetCount] = useState(0)

  //* Controls ====================================================
  const {
    attractorMassExponent,
    particleGlobalMassExponent,
    timeScale,
    maxSpeed,
    velocityDamping,
    spinningStrength,
    scale,
    boundHalfExtent,
    colorA,
    colorB,
  } = useControls('particles', {
    attractorMassExponent: { value: 7, min: 1, max: 10, step: 1 },
    particleGlobalMassExponent: { value: 4, min: 1, max: 10, step: 1 },
    timeScale: { value: 1, min: 0, max: 2, step: 0.01 },
    maxSpeed: { value: 8, min: 0, max: 10, step: 0.01 },
    velocityDamping: { value: 0.1, min: 0, max: 0.1, step: 0.001 },
    spinningStrength: { value: 2.75, min: 0, max: 10, step: 0.01 },
    scale: { value: 0.008, min: 0, max: 0.1, step: 0.001 },
    boundHalfExtent: { value: 8, min: 0, max: 20, step: 0.01 },
    colorA: '#5900ff',
    colorB: '#ffa575',
    // Incremented by the leva Reset button — re-dispatches the init kernel below.
    reset: button(() => setResetCount((count) => count + 1)),
  })

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
      uAttractorMass: 10 ** attractorMassExponent,
      uParticleGlobalMass: 10 ** particleGlobalMassExponent,
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
        const phi = phiRaw
        const theta = thetaRaw
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
      const particleMass = particleMassMultiplier.mul(uParticleGlobalMass).toVar()

      // (2) Update kernel: Newtonian gravity toward each attractor plus a
      // rotational force around its axis, speed clamp (GPU `If()`, not JS `if`),
      // damping, integration, and a wrap-around bounding box.
      const computeUpdate = Fn(() => {
        // Fixed timestep (like the original) for a consistent simulation.
        const delta = float(1 / 60)
          .mul(uTimeScale)
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
          const gravityStrength = particleMass.mul(uAttractorMass).mul(GRAVITY_CONSTANT).div(distance.pow(2)).toVar()
          force.addAssign(direction.mul(gravityStrength))

          // spinning
          const spinningForce = attractorRotationAxis.mul(gravityStrength).mul(uSpinningStrength)
          force.addAssign(spinningForce.cross(toAttractor))
        })

        // velocity
        velocity.addAssign(force.mul(delta))
        const speed = velocity.length()
        If(speed.greaterThan(uMaxSpeed), () => {
          velocity.assign(velocity.normalize().mul(uMaxSpeed))
        })
        velocity.mulAssign(float(uVelocityDamping).oneMinus())

        // position
        position.addAssign(velocity.mul(delta))

        // box loop: wrap positions into the [-half, +half] cube
        const halfHalfExtent = float(uBoundHalfExtent).div(2).toVar()
        position.assign(mod(position.add(halfHalfExtent), uBoundHalfExtent).sub(halfHalfExtent))
      })().compute(PARTICLE_COUNT)

      // Sprite graph: position straight from the storage buffer; color ramps
      // from colorA to colorB with speed; scale follows the particle's mass.
      const speed = attractorParticleVelocities.toAttribute().length()
      const colorMix = speed.div(uMaxSpeed).smoothstep(0, 0.5)

      return {
        computeInit,
        computeUpdate,
        uAttractorPositions,
        spritePositionNode: attractorParticlePositions.toAttribute(),
        spriteColorNode: vec4(mix(uColorA, uColorB, colorMix), 1),
        spriteScaleNode: particleMassMultiplier.mul(uScale),
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
