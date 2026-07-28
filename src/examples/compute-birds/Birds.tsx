// The boids flock for compute-birds: position/velocity/phase storage buffers, the
// O(N²) separation/alignment/cohesion velocity kernel + the position/phase
// integrator, and the three-triangle bird geometry whose vertex stage does all
// placement (wing flap + heading rotation). Uses fiber hooks
// (`useUniforms`/`useBuffers`/`useNodes`/`useFrame`/`useThree`), so it lives inside
// <Canvas>, not in the page shell.
import { useMemo, useRef, useState } from 'react'
import {
  useBuffers,
  useFrame,
  useNodes,
  useThree,
  useUniforms,
  type ThreeEvent,
} from '@react-three/fiber/webgpu'
import {
  cameraProjectionMatrix,
  cameraViewMatrix,
  Continue,
  cos,
  dot,
  float,
  Fn,
  If,
  instancedArray,
  instanceIndex,
  length,
  Loop,
  mat3,
  max,
  modelWorldMatrix,
  negate,
  normalize,
  positionLocal,
  select,
  sin,
  sqrt,
  uint,
  uniform,
  vec4,
  vertexIndex,
} from 'three/tsl'
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Raycaster,
  Vector2,
  Vector3,
  type Node,
  type WebGPURenderer,
} from 'three/webgpu'

const BIRDS = 8192
const SPEED_LIMIT = 9.0
const BOUNDS = 800
const BOUNDS_HALF = BOUNDS / 2

// The original's BirdGeometry: three triangles (body + two wings), 9 vertices, no
// normals. Vertices 4 and 7 are the wing tips the vertex stage flaps.
function createBirdGeometry(): BufferGeometry {
  const wingsSpan = 20
  // prettier-ignore
  const vertices = new Float32Array([
    // Body
    0, 0, -20,   0, -8, 10,   0, 0, 30,
    // Left wing (vertex 4 = tip)
    0, 0, -15,   -wingsSpan, 0, 5,   0, 0, 15,
    // Right wing (vertex 7 = tip)
    0, 0, 15,   wingsSpan, 0, 5,   0, 0, -15,
  ])
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(vertices, 3))
  geometry.scale(0.2, 0.2, 0.2)
  return geometry
}

export interface BirdsProps {
  separation: number
  alignment: number
  cohesion: number
}

export function Birds({ separation, alignment, cohesion }: BirdsProps) {
  const rawRenderer = useThree((state) => state.renderer)
  // Cast: useThree types renderer as the WebGL/WebGPU union even on the `/webgpu`
  // entry (fiber typing gap, UPSTREAM.md B9) — `.compute()` exists only on WebGPURenderer.
  const renderer = rawRenderer as WebGPURenderer

  // Leva knobs → live kernel uniforms (create-or-update syncs new values every
  // re-render; the kernels below reference the stable node instances).
  // WGSL-identifier rule: camelCase scope, never kebab-case.
  const { uSeparation, uAlignment, uCohesion } = useUniforms(
    { uSeparation: separation, uAlignment: alignment, uCohesion: cohesion },
    'computeBirds',
  )
  // Casts: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`
  // (documented fiber typing gap — see compute-particles et al.).
  const uSeparationNode = uSeparation as unknown as Node<'float'>
  const uAlignmentNode = uAlignment as unknown as Node<'float'>
  const uCohesionNode = uCohesion as unknown as Node<'float'>

  // Flock state, GPU-only after this upload. UNSCOPED on purpose: scoped useBuffers
  // names each buffer `${scope}.${name}` and the dot lands in the WGSL struct name —
  // runtime shader compile error (fiber bug, UPSTREAM.md B16). Prefixed root-level
  // keys instead; the original's `.setName('positionStorage')` labels are dropped —
  // fiber re-labels stored nodes by key.
  const { birdPositions, birdVelocities, birdPhases } = useBuffers(() => {
    const positionArray = new Float32Array(BIRDS * 3)
    const velocityArray = new Float32Array(BIRDS * 3)
    const phaseArray = new Float32Array(BIRDS)

    for (let i = 0; i < BIRDS; i++) {
      positionArray[i * 3 + 0] = Math.random() * BOUNDS - BOUNDS_HALF
      positionArray[i * 3 + 1] = Math.random() * BOUNDS - BOUNDS_HALF
      positionArray[i * 3 + 2] = Math.random() * BOUNDS - BOUNDS_HALF

      velocityArray[i * 3 + 0] = (Math.random() - 0.5) * 10
      velocityArray[i * 3 + 1] = (Math.random() - 0.5) * 10
      velocityArray[i * 3 + 2] = (Math.random() - 0.5) * 10

      phaseArray[i] = 1
    }

    return {
      birdPositions: instancedArray(positionArray, 'vec3'),
      birdVelocities: instancedArray(velocityArray, 'vec3'),
      birdPhases: instancedArray(phaseArray, 'float'),
    }
  })

  // All node graphs built exactly once, closing over the TYPED hook returns above
  // (creator-state reads widen to fiber's BufferLike — AGENTS.md). Also UNSCOPED
  // (UPSTREAM.md B16): kernels and the vertex graph all reach WGSL codegen.
  const { computeVelocity, computePosition, uDeltaTime, uRayOrigin, uRayDirection, birdVertexNode } =
    useNodes(() => {
      // Frame-driven uniforms: plain TSL `uniform()`, NOT useUniforms — mutated
      // imperatively in useFrame every frame; a React re-render must never write
      // them back (compute-particles' uClickPos rationale).
      const uDeltaTime = uniform(0)
      const uRayOrigin = uniform(new Vector3())
      const uRayDirection = uniform(new Vector3())

      // Velocity kernel: pointer avoidance, pull to center, then the O(N²)
      // separation/alignment/cohesion pass over every other bird. All branching is
      // GPU-side If/ElseIf/Else + Loop/Continue — a JS `if` here would run once at
      // graph build (AGENTS.md build-time vs run-time rule).
      const computeVelocity = Fn(() => {
        const PI = float(3.141592653589793)
        const PI_2 = PI.mul(2.0)
        const limit = float(SPEED_LIMIT).toVar('limit')

        const zoneRadius = uSeparationNode.add(uAlignmentNode).add(uCohesionNode).toConst()
        const separationThresh = uSeparationNode.div(zoneRadius).toConst()
        const alignmentThresh = uSeparationNode.add(uAlignmentNode).div(zoneRadius).toConst()
        const zoneRadiusSq = zoneRadius.mul(zoneRadius).toConst()

        // Cache this bird's position and velocity outside the loop.
        const birdIndex = instanceIndex.toConst('birdIndex')
        const position = birdPositions.element(birdIndex).toVar()
        const velocity = birdVelocities.element(birdIndex).toVar()

        // Pointer avoidance: distance from the bird to the camera-ray LINE.
        const directionToRay = uRayOrigin.sub(position).toConst()
        const projectionLength = dot(directionToRay, uRayDirection).toConst()
        const closestPoint = uRayOrigin.sub(uRayDirection.mul(projectionLength)).toConst()
        const directionToClosestPoint = closestPoint.sub(position).toConst()
        const distanceToClosestPoint = length(directionToClosestPoint).toConst()
        const distanceToClosestPointSq = distanceToClosestPoint.mul(distanceToClosestPoint).toConst()

        const rayRadius = float(150.0).toConst()
        const rayRadiusSq = rayRadius.mul(rayRadius).toConst()

        If(distanceToClosestPointSq.lessThan(rayRadiusSq), () => {
          const velocityAdjust = distanceToClosestPointSq
            .div(rayRadiusSq)
            .sub(1.0)
            .mul(uDeltaTime)
            .mul(100.0)
          velocity.addAssign(normalize(directionToClosestPoint).mul(velocityAdjust))
          limit.addAssign(5.0)
        })

        // Attract flocks to the center (y weighted heavier, like the original).
        const dirToCenter = position.toVar()
        dirToCenter.y.mulAssign(2.5)
        velocity.subAssign(normalize(dirToCenter).mul(uDeltaTime).mul(5.0))

        Loop({ start: uint(0), end: uint(BIRDS), type: 'uint', condition: '<' }, ({ i }) => {
          If(i.equal(birdIndex), () => {
            Continue()
          })

          const birdPosition = birdPositions.element(i)
          const dirToBird = birdPosition.sub(position)
          const distToBird = length(dirToBird)

          If(distToBird.lessThan(0.0001), () => {
            Continue()
          })

          const distToBirdSq = distToBird.mul(distToBird)

          // Outside the zone radius: no influence at all.
          If(distToBirdSq.greaterThan(zoneRadiusSq), () => {
            Continue()
          })

          // Which band of the zone is the neighbour in?
          const percent = distToBirdSq.div(zoneRadiusSq)

          If(percent.lessThan(separationThresh), () => {
            // Separation - move apart for comfort
            const velocityAdjust = separationThresh.div(percent).sub(1.0).mul(uDeltaTime)
            velocity.subAssign(normalize(dirToBird).mul(velocityAdjust))
          })
            .ElseIf(percent.lessThan(alignmentThresh), () => {
              // Alignment - fly the same direction
              const threshDelta = alignmentThresh.sub(separationThresh)
              const adjustedPercent = percent.sub(separationThresh).div(threshDelta)
              const birdVelocity = birdVelocities.element(i)

              const cosRange = cos(adjustedPercent.mul(PI_2))
              const cosRangeAdjust = float(0.5).sub(cosRange.mul(0.5)).add(0.5)
              const velocityAdjust = cosRangeAdjust.mul(uDeltaTime)
              velocity.addAssign(normalize(birdVelocity).mul(velocityAdjust))
            })
            .Else(() => {
              // Attraction / cohesion - move closer. Functional select (the
              // original chains `.select` off the bool — same graph).
              const threshDelta = alignmentThresh.oneMinus()
              const adjustedPercent = select(
                threshDelta.equal(0.0),
                1.0,
                percent.sub(alignmentThresh).div(threshDelta),
              )

              const cosRange = cos(adjustedPercent.mul(PI_2))
              const adj1 = cosRange.mul(-0.5)
              const adj2 = adj1.add(0.5)
              const adj3 = float(0.5).sub(adj2)

              const velocityAdjust = adj3.mul(uDeltaTime)
              velocity.addAssign(normalize(dirToBird).mul(velocityAdjust))
            })
        })

        // Speed limit (raised while fleeing the pointer).
        If(length(velocity).greaterThan(limit), () => {
          velocity.assign(normalize(velocity).mul(limit))
        })

        birdVelocities.element(birdIndex).assign(velocity)
      })().compute(BIRDS)

      // Position/phase integrator: advance positions along velocity, advance the
      // wing-flap phase faster the faster (and the more upward) the bird flies.
      const computePosition = Fn(() => {
        birdPositions
          .element(instanceIndex)
          .addAssign(birdVelocities.element(instanceIndex).mul(uDeltaTime).mul(15.0))

        const velocity = birdVelocities.element(instanceIndex)
        const phase = birdPhases.element(instanceIndex)

        const modValue = phase
          .add(uDeltaTime)
          .add(length(velocity.xz).mul(uDeltaTime).mul(3.0))
          .add(max(velocity.y, 0.0).mul(uDeltaTime).mul(6.0))
        birdPhases.element(instanceIndex).assign(modValue.mod(62.83))
      })().compute(BIRDS)

      // Vertex-stage takeover: flap the wing-tip vertices by the phase buffer,
      // orient the bird along its (normalized) velocity with two hand-built mat3
      // rotations, then translate by the position buffer. Reads all three storage
      // buffers in the vertex stage — hence maxStorageBuffersInVertexStage: 3.
      const birdVertexNode = Fn(() => {
        const position = positionLocal.toVar()
        const newPhase = birdPhases.element(instanceIndex).toVar()
        const newVelocity = normalize(birdVelocities.element(instanceIndex)).toVar()

        If(vertexIndex.equal(4).or(vertexIndex.equal(7)), () => {
          // flap wings
          position.y.assign(sin(newPhase).mul(5.0))
        })

        // Explicit vec4/xyz conversions where the original relies on TSL's
        // implicit mat/vec promotion (typed-TSL gap, B10 family) — same math.
        const newPosition = modelWorldMatrix.mul(vec4(position, 1.0))

        newVelocity.z.mulAssign(-1.0)
        const xz = length(newVelocity.xz)
        const xyz = float(1.0)
        const x = sqrt(newVelocity.y.mul(newVelocity.y).oneMinus())

        const cosry = newVelocity.x.div(xz).toVar()
        const sinry = newVelocity.z.div(xz).toVar()

        const cosrz = x.div(xyz)
        const sinrz = newVelocity.y.div(xyz).toVar()

        // Nodes must be negated with negate() — with JS '-' they resolve to NaN
        // (the original carries the same comment).
        // prettier-ignore
        const maty = mat3(
          cosry, 0, negate(sinry),
          0, 1, 0,
          sinry, 0, cosry,
        )

        // prettier-ignore
        const matz = mat3(
          cosrz, sinrz, 0,
          negate(sinrz), cosrz, 0,
          0, 0, 1,
        )

        const finalVert = maty.mul(matz).mul(newPosition.xyz).toVar()
        finalVert.addAssign(birdPositions.element(instanceIndex))

        return cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(finalVert, 1.0))
      })()

      return { computeVelocity, computePosition, uDeltaTime, uRayOrigin, uRayDirection, birdVertexNode }
    })

  const geometry = useMemo(createBirdGeometry, [])

  // Pointer state: the handler only records the latest NDC; the camera ray is
  // rebuilt once per FRAME below (the original's exact flow). Parked at y=10
  // after every step so only a MOVING pointer disturbs the flock.
  const [raycaster] = useState(() => new Raycaster())
  const ndcRef = useRef(new Vector2(0, 10))

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!event.nativeEvent.isPrimary) return
    ndcRef.current.copy(event.pointer)
  }

  // EVERY FRAME, before the default render phase draws (NOT phase:'render' —
  // compute is not a render takeover): refresh deltaTime + the camera-ray
  // uniforms, then step velocity and position.
  useFrame(
    (state) => {
      uDeltaTime.value = Math.min(state.delta, 1) // the original's safety cap

      raycaster.setFromCamera(ndcRef.current, state.camera)
      uRayOrigin.value.copy(raycaster.ray.origin)
      uRayDirection.value.copy(raycaster.ray.direction)

      renderer.compute(computeVelocity)
      renderer.compute(computePosition)

      // Move the pointer away so we only affect birds while the mouse moves.
      ndcRef.current.y = 10
    },
    { phase: 'update' },
  )

  return (
    <>
      {/* One 9-vertex bird drawn 8192 times; placement lives only on the GPU, so
          three's culling sphere knows nothing — frustumCulled must be off
          (AGENTS.md positionNode rule; the original sets it too). Base
          nodeMaterial = unlit black birds, exactly the original's material. */}
      <mesh geometry={geometry} count={BIRDS} rotation-y={Math.PI / 2} frustumCulled={false}>
        <nodeMaterial vertexNode={birdVertexNode} side={DoubleSide} />
      </mesh>
      {/* Invisible pointer surface: a LOW-detail backside sphere (80 tris, vs the
          visible sky dome's 82k) — material-invisible so it still raycasts;
          event.pointer is the NDC the per-frame raycast consumes. */}
      <mesh scale={1200} onPointerMove={onPointerMove}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial visible={false} side={BackSide} />
      </mesh>
    </>
  )
}
