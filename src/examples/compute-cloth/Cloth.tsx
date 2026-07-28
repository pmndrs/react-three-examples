// The verlet cloth simulation: seven instancedArray storage buffers uploaded from
// the CPU-side system, two compute kernels (per-spring force + per-vertex
// integration), the cloth surface whose vertex stage centres each render vertex on
// 4 verlet vertices, the animated collision sphere, and the wireframe debug view.
// Uses fiber hooks (`useUniforms`/`useBuffers`/`useNodes`/`useLoader`/`useFrame`/
// `useThree`), so it lives inside <Canvas>, not in the page shell.
import { useLayoutEffect, useRef, useState } from 'react'
import {
  useBuffers,
  useFrame,
  useLoader,
  useNodes,
  useThree,
  useUniforms,
} from '@react-three/fiber/webgpu'
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js'
import {
  attribute,
  cross,
  float,
  Fn,
  If,
  instancedArray,
  instanceIndex,
  Loop,
  Return,
  select,
  time,
  transformNormalToView,
  triNoise3D,
  uniform,
} from 'three/tsl'
import {
  DoubleSide,
  EquirectangularReflectionMapping,
  Vector3,
  type Mesh,
  type Node,
  type WebGPURenderer,
} from 'three/webgpu'
import { buildVerletSystem, SPHERE_RADIUS } from './verletSystem'
import { VerletWireframe } from './VerletWireframe'

const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/royal_esplanade_2k.hdr.jpg'

// Fixed-timestep sub-stepping: the same number of simulation steps per second on
// every system, independent of refresh rate (the original's render() accumulator).
const STEPS_PER_SECOND = 360
const TIME_PER_STEP = 1 / STEPS_PER_SECOND
// Don't advance the accumulator too far when the tab was out of focus.
const MAX_DELTA = 1 / 60

export interface ClothProps {
  stiffness: number
  wind: number
  sphereEnabled: boolean
  wireframe: boolean
  color: string
  roughness: number
  sheen: number
  sheenRoughness: number
  sheenColor: string
}

export function Cloth({
  stiffness,
  wind,
  sphereEnabled,
  wireframe,
  color,
  roughness,
  sheen,
  sheenRoughness,
  sheenColor,
}: ClothProps) {
  const scene = useThree((state) => state.scene)
  const rawRenderer = useThree((state) => state.renderer)
  // Cast: useThree types renderer as the WebGL/WebGPU union even on the `/webgpu`
  // entry (fiber typing gap, UPSTREAM.md B9) — `.compute()` exists only on WebGPURenderer.
  const renderer = rawRenderer as WebGPURenderer

  // Leva knobs → live kernel uniforms. Called BEFORE the suspending useLoader below —
  // creator-mode hooks deferred past a suspension write to the store after siblings
  // have subscribed (AGENTS.md B18 ordering rule). WGSL-identifier rule: camelCase scope.
  const { uStiffness, uWind, uSphere } = useUniforms(
    { uStiffness: stiffness, uWind: wind, uSphere: sphereEnabled ? 1 : 0 },
    'computeCloth',
  )
  // Casts: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`
  // (documented fiber typing gap — see compute-particles et al.).
  const uStiffnessNode = uStiffness as unknown as Node<'float'>
  const uWindNode = uWind as unknown as Node<'float'>
  const uSphereNode = uSphere as unknown as Node<'float'>

  // CPU-side verlet system, built once and captured by the create-once creators
  // below — lazy useState, not useMemo: a StrictMode memo re-run could hand the
  // component a different instance than the one the buffers uploaded (AGENTS.md
  // lazy-useState rule for non-node instances in create-once closures).
  const [system] = useState(buildVerletSystem)

  // Simulation state, GPU-only after this upload. UNSCOPED on purpose: scoped
  // useBuffers names each buffer `${scope}.${name}` and the dot lands in the WGSL
  // struct name — runtime shader compile error (fiber bug, UPSTREAM.md B16).
  // Prefixed root-level keys instead; the original's `.setPBO(true)` calls are
  // dropped (WebGL-fallback-only) and its `.setName()` labels come from the keys.
  const {
    clothVertexPosition,
    clothVertexForce,
    clothVertexParams,
    clothSpringList,
    clothSpringVertexId,
    clothSpringRestLength,
    clothSpringForce,
  } = useBuffers(() => ({
    clothVertexPosition: instancedArray(system.vertexPositionArray, 'vec3'),
    clothVertexForce: instancedArray(system.vertexCount, 'vec3'),
    clothVertexParams: instancedArray(system.vertexParamsArray, 'uvec3'),
    clothSpringList: instancedArray(system.springListArray, 'uint'),
    clothSpringVertexId: instancedArray(system.springVertexIdArray, 'uvec2'),
    clothSpringRestLength: instancedArray(system.springRestLengthArray, 'float'),
    clothSpringForce: instancedArray(system.springCount, 'vec3'),
  }))

  // All node graphs built exactly once, closing over the TYPED hook returns above
  // (creator-state reads widen to fiber's BufferLike — AGENTS.md). Also UNSCOPED
  // (UPSTREAM.md B16): kernels and material nodes all reach WGSL codegen.
  const {
    computeSpringForces,
    computeVertexForces,
    uSpherePosition,
    clothPositionNode,
    clothNormalNode,
    vertexDebugPositionNode,
    springDebugPositionNode,
  } = useNodes(() => {
    // Mutated imperatively per simulation STEP from useFrame — plain TSL `uniform()`,
    // not useUniforms: a React re-render must never write it back.
    const uSpherePosition = uniform(new Vector3(0, 0, 0))
    // Fixed in the original too (a uniform, but never GUI-exposed).
    const uDampening = uniform(0.99)

    // Kernel 1 — one thread per SPRING: Hooke's law over the rest length, halved
    // per endpoint. Written to its own buffer so kernel 2 can accumulate per vertex.
    const computeSpringForces = Fn(() => {
      const vertexIds = clothSpringVertexId.element(instanceIndex)
      const restLength = clothSpringRestLength.element(instanceIndex)

      const vertex0Position = clothVertexPosition.element(vertexIds.x)
      const vertex1Position = clothVertexPosition.element(vertexIds.y)

      const delta = vertex1Position.sub(vertex0Position).toVar()
      const dist = delta.length().max(0.000001).toVar()
      const force = dist.sub(restLength).mul(uStiffnessNode).mul(delta).mul(0.5).div(dist)
      clothSpringForce.element(instanceIndex).assign(force)
    })().compute(system.springCount)

    // Kernel 2 — one thread per VERTEX: early-out for pinned vertices, accumulate
    // the connected springs' forces via the adjacency list (dynamic uint Loop),
    // add gravity, triNoise3D wind and the sphere collision, then integrate.
    const computeVertexForces = Fn(() => {
      const params = clothVertexParams.element(instanceIndex).toVar()
      const isFixed = params.x
      const springCount = params.y
      const springPointer = params.z

      If(isFixed, () => {
        // Pinned vertices never move — skip the whole integration.
        Return()
      })

      const position = clothVertexPosition.element(instanceIndex).toVar('vertexPosition')
      const force = clothVertexForce.element(instanceIndex).toVar('vertexForce')

      force.mulAssign(uDampening)

      const ptrStart = springPointer.toVar('ptrStart')
      const ptrEnd = ptrStart.add(springCount).toVar('ptrEnd')

      Loop({ start: ptrStart, end: ptrEnd, type: 'uint', condition: '<' }, ({ i }) => {
        const springId = clothSpringList.element(i).toVar('springId')
        const springForce = clothSpringForce.element(springId)
        const springVertexIds = clothSpringVertexId.element(springId)
        // The spring force points from vertex0 to vertex1 — flip it for vertex1.
        const factor = select(springVertexIds.x.equal(instanceIndex), 1.0, -1.0)
        force.addAssign(springForce.mul(factor))
      })

      // gravity
      force.y.subAssign(0.00005)

      // wind
      const noise = triNoise3D(position, 1, time).sub(0.2).mul(0.0001)
      const windForce = noise.mul(uWindNode)
      force.z.subAssign(windForce)

      // collision with the sphere: push out along the centre delta when the
      // candidate position lands inside the radius (zeroed by the sphere toggle).
      const deltaSphere = position.add(force).sub(uSpherePosition)
      const dist = deltaSphere.length()
      const sphereForce = float(SPHERE_RADIUS).sub(dist).max(0).mul(deltaSphere).div(dist).mul(uSphereNode)
      force.addAssign(sphereForce)

      clothVertexForce.element(instanceIndex).assign(force)
      clothVertexPosition.element(instanceIndex).addAssign(force)
    })().compute(system.vertexCount)

    // Cloth surface graphs — vertex-stage storage reads (this is what the
    // Canvas-level `maxStorageBuffersInVertexStage` limit is for). Each render
    // vertex is the centroid of the 4 verlet vertices in its `vertexIds` attribute.
    const clothPositionNode = Fn(() => {
      // Explicit type argument: `attribute()` infers bare `string` from a literal
      // (the AGENTS.md typed-TSL-creators-don't-infer family), losing the swizzles.
      const vertexIds = attribute<'uvec4'>('vertexIds', 'uvec4')
      const v0 = clothVertexPosition.element(vertexIds.x).toVar()
      const v1 = clothVertexPosition.element(vertexIds.y).toVar()
      const v2 = clothVertexPosition.element(vertexIds.z).toVar()
      const v3 = clothVertexPosition.element(vertexIds.w).toVar()
      return v0.add(v1).add(v2).add(v3).mul(0.25)
    })()

    // Lighting normals from the same four taps: tangent (right-left) x bitangent
    // (bottom-top), computed once per vertex and interpolated (.toVertexStage()) —
    // the original assigns material.normalNode from INSIDE its positionNode Fn;
    // here it's a standalone graph with identical math (compute-water's pattern).
    const clothNormalNode = Fn(() => {
      const vertexIds = attribute<'uvec4'>('vertexIds', 'uvec4')
      const v0 = clothVertexPosition.element(vertexIds.x).toVar()
      const v1 = clothVertexPosition.element(vertexIds.y).toVar()
      const v2 = clothVertexPosition.element(vertexIds.z).toVar()
      const v3 = clothVertexPosition.element(vertexIds.w).toVar()

      const top = v0.add(v1)
      const right = v1.add(v3)
      const bottom = v2.add(v3)
      const left = v0.add(v2)

      const tangent = right.sub(left).normalize()
      const bitangent = bottom.sub(top).normalize()
      const normal = cross(tangent, bitangent)

      return transformNormalToView(normal).toVertexStage()
    })()

    // Debug graphs: verlet vertex sprite placement + spring line endpoints.
    const vertexDebugPositionNode = clothVertexPosition.element(instanceIndex)

    const springDebugPositionNode = Fn(() => {
      const vertexIds = clothSpringVertexId.element(instanceIndex)
      const vertexId = select(attribute<'uint'>('vertexIndex', 'uint').equal(0), vertexIds.x, vertexIds.y)
      return clothVertexPosition.element(vertexId)
    })()

    return {
      computeSpringForces,
      computeVertexForces,
      uSpherePosition,
      clothPositionNode,
      clothNormalNode,
      vertexDebugPositionNode,
      springDebugPositionNode,
    }
  })

  // SUSPENDS — deliberately ordered after every creator hook above (AGENTS.md B18)
  // and before the meshes render: the cloth/sphere materials carry custom node
  // graphs in an unlit scene, so their FIRST shader build must already see
  // scene.environment (three 0.185.1 IBL race, AGENTS.md B15). Self-suspending on
  // the UltraHDR satisfies both rules at once — a drei <Environment> could not.
  const envMap = useLoader(UltraHDRLoader, HDR_URL)

  // Layout effect so the environment lands before the first RAF render builds the
  // shader graphs (B15 family). The scene has NO analytic lights — IBL only.
  useLayoutEffect(() => {
    envMap.mapping = EquirectangularReflectionMapping
    scene.environment = envMap
    scene.background = envMap
    scene.backgroundBlurriness = 0.5
    return () => {
      scene.environment = null
      scene.background = null
      scene.backgroundBlurriness = 0
    }
  }, [scene, envMap])

  // EVERY FRAME, before the default render phase draws (NOT phase:'render' —
  // compute is not a render takeover): run 0..6 fixed sub-steps, each moving the
  // sphere uniform along its figure-8 sweep and dispatching BOTH kernels (B9 cast).
  const sphereRef = useRef<Mesh>(null)
  const stepState = useRef({ accumulator: 0, timestamp: 0 })
  useFrame(
    (state) => {
      const sim = stepState.current
      sim.accumulator += Math.min(state.delta, MAX_DELTA)

      while (sim.accumulator >= TIME_PER_STEP) {
        sim.timestamp += TIME_PER_STEP
        sim.accumulator -= TIME_PER_STEP
        uSpherePosition.value.set(
          Math.sin(sim.timestamp * 2.1) * 0.1,
          0,
          Math.sin(sim.timestamp * 0.8),
        )
        renderer.compute(computeSpringForces)
        renderer.compute(computeVertexForces)
      }

      // The visible sphere mirrors the collision uniform (last step this frame).
      if (sphereRef.current) sphereRef.current.position.copy(uSpherePosition.value)
    },
    { phase: 'update' },
  )

  return (
    <>
      {/* The cloth: geometry vertices live only in the storage buffers, so three's
          culling sphere is the zeroed position attribute — frustumCulled off. */}
      <mesh geometry={system.clothGeometry} frustumCulled={false} visible={!wireframe}>
        <meshPhysicalNodeMaterial
          color={color}
          side={DoubleSide}
          transparent
          opacity={0.85}
          roughness={roughness}
          sheen={sheen}
          sheenRoughness={sheenRoughness}
          sheenColor={sheenColor}
          positionNode={clothPositionNode}
          normalNode={clothNormalNode}
        />
      </mesh>

      {/* The collision sphere — drawn slightly smaller than the collision radius
          so the cloth never visibly clips into it (original's * 0.95). */}
      <mesh ref={sphereRef} visible={sphereEnabled}>
        <icosahedronGeometry args={[SPHERE_RADIUS * 0.95, 4]} />
        <meshStandardNodeMaterial />
      </mesh>

      <VerletWireframe
        visible={wireframe}
        vertexCount={system.vertexCount}
        springCount={system.springCount}
        vertexPositionNode={vertexDebugPositionNode}
        springPositionNode={springDebugPositionNode}
      />
    </>
  )
}
