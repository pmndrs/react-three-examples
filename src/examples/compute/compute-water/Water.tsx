// The water heightfield simulation: ping-pong height storage + wave-equation compute
// kernels, the water surface whose vertex stage reads those buffers, the duck struct
// buffer + bobbing kernel, and the pointer-driven disturbance rig. Uses fiber hooks
// (`useUniforms`/`useBuffers`/`useNodes`/`useLoader`/`useFrame`/`useThree`), so it
// lives inside <Canvas>, not in the page shell.
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import {
  useBuffers,
  useFrame,
  useLoader,
  useNodes,
  useThree,
  useUniforms,
  type ThreeEvent,
} from '@react-three/fiber/webgpu'
import type CameraControlsImpl from 'camera-controls'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js'
import {
  clamp,
  cos,
  float,
  Fn,
  If,
  instancedArray,
  instanceIndex,
  globalId,
  floor,
  positionLocal,
  select,
  struct,
  transformNormalToView,
  uint,
  uniform,
  vec2,
  vec3,
  vertexIndex,
} from 'three/tsl'
import {
  DoubleSide,
  EquirectangularReflectionMapping,
  TorusGeometry,
  Vector2,
  type MeshStandardMaterial,
  type MeshStandardNodeMaterial,
  type Node,
  type StorageBufferNode,
  type WebGPURenderer,
} from 'three/webgpu'
import { Ducks, NUM_DUCKS } from './Ducks'

// Dimensions of the simulation grid / water size in world units (original values).
const WIDTH = 128
export const BOUNDS = 6
const LIMIT = BOUNDS / 2 - 0.2
const WATER_MAX_HEIGHT = 0.1

const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/blouberg_sunrise_2_1k.hdr'

export interface WaterProps {
  mouseSize: number
  mouseDeep: number
  viscosity: number
  /** Simulation speed 1..6 — the sim dispatches every `7 - speed` frames (original cadence). */
  speed: number
  ducksEnabled: boolean
  wireframe: boolean
  /** Live camera-controls instance — orbiting is suspended while disturbing the water. */
  controlsRef: RefObject<CameraControlsImpl | null>
}

export function Water({
  mouseSize,
  mouseDeep,
  viscosity,
  speed,
  ducksEnabled,
  wireframe,
  controlsRef,
}: WaterProps) {
  const scene = useThree((state) => state.scene)
  const rawRenderer = useThree((state) => state.renderer)
  // Cast: useThree types renderer as the WebGL/WebGPU union even on the `/webgpu`
  // entry (fiber typing gap, UPSTREAM.md B9) — `.compute()` exists only on WebGPURenderer.
  const renderer = rawRenderer as WebGPURenderer

  // Leva knobs → live kernel uniforms. Called BEFORE the suspending useLoader below —
  // creator-mode hooks deferred past a suspension write to the store after siblings
  // have subscribed (AGENTS.md B18 ordering rule). WGSL-identifier rule: camelCase scope.
  const { uMouseSize, uMouseDeep, uViscosity } = useUniforms(
    { uMouseSize: mouseSize, uMouseDeep: mouseDeep, uViscosity: viscosity },
    'computeWater',
  )
  // Casts: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`
  // (documented fiber typing gap — see compute-particles et al.).
  const uMouseSizeNode = uMouseSize as unknown as Node<'float'>
  const uMouseDeepNode = uMouseDeep as unknown as Node<'float'>
  const uViscosityNode = uViscosity as unknown as Node<'float'>

  // Simulation state, GPU-only after this upload. UNSCOPED on purpose: scoped
  // useBuffers names each buffer `${scope}.${name}` and the dot lands in the WGSL
  // struct name — runtime shader compile error (fiber bug, UPSTREAM.md B16).
  // Prefixed root-level keys instead; the original's `.setName('HeightA')` labels
  // are dropped — fiber re-labels stored nodes by key.
  const { waterHeightA, waterHeightB, waterPrevHeight, waterDuckData } = useBuffers(() => {
    // CPU-side seed: 15-octave simplex heightfield, exactly the original's noise().
    const simplex = new SimplexNoise()
    const noise = (x: number, y: number) => {
      let multR = WATER_MAX_HEIGHT
      let mult = 0.025
      let r = 0
      for (let i = 0; i < 15; i++) {
        r += multR * simplex.noise(x * mult, y * mult)
        multR *= 0.53 + 0.025 * i
        mult *= 1.25
      }
      return r
    }

    const heightArray = new Float32Array(WIDTH * WIDTH)
    let p = 0
    for (let j = 0; j < WIDTH; j++) {
      for (let i = 0; i < WIDTH; i++) {
        heightArray[p++] = noise((i * 128) / WIDTH, (j * 128) / WIDTH)
      }
    }

    // Duck instance data: position<vec3> + velocity<vec2>, padded to 8 floats
    // (struct arrays round up to multiples of 4). Random scatter inside the pool.
    const duckStride = 8
    const duckArray = new Float32Array(NUM_DUCKS * duckStride)
    for (let i = 0; i < NUM_DUCKS; i++) {
      duckArray[i * duckStride + 0] = (Math.random() - 0.5) * BOUNDS * 0.7
      duckArray[i * duckStride + 2] = (Math.random() - 0.5) * BOUNDS * 0.7
    }
    const DuckStruct = struct({ position: 'vec3', velocity: 'vec2' })

    // Cast: instancedArray's typed overloads stop at vec4 — struct layouts exist at
    // runtime (Arrays.js hands the layout straight to StorageBufferNode; `storage()`'s
    // own typing names this case StorageBufferNode<'struct'>) but the instancedArray
    // overload is missing (typed-TSL inference family, AGENTS.md B10).
    const instancedStructArray = instancedArray as unknown as (
      values: Float32Array,
      structType: ReturnType<typeof struct>,
    ) => StorageBufferNode<'struct'>

    return {
      waterHeightA: instancedArray(heightArray),
      waterHeightB: instancedArray(new Float32Array(heightArray)),
      waterPrevHeight: instancedArray(new Float32Array(heightArray)),
      waterDuckData: instancedStructArray(duckArray, DuckStruct),
    }
  })

  // All node graphs built exactly once, closing over the TYPED hook returns above
  // (creator-state reads widen to fiber's BufferLike — AGENTS.md). Also UNSCOPED
  // (UPSTREAM.md B16): kernels and material nodes all reach WGSL codegen.
  const {
    computeHeightAtoB,
    computeHeightBtoA,
    computeDucks,
    uMousePos,
    uMouseSpeed,
    uReadFromA,
    waterPositionNode,
    waterNormalNode,
    duckPositionNode,
  } = useNodes(() => {
    // Pointer-driven uniforms + the ping-pong selector: plain TSL `uniform()`, NOT
    // useUniforms — mutated imperatively from useFrame/pointer handlers; a React
    // re-render must never write them back (compute-particles' uClickPos rationale).
    const uMousePos = uniform(new Vector2())
    const uMouseSpeed = uniform(new Vector2())
    const uReadFromA = uniform(1)

    // Neighbour indices in the simulation grid, with Clamp-to-Edge semantics at the
    // borders (the original's getNeighborIndicesTSL). The original runs this in
    // int (casting from uint so the -1 at the left edge can't wrap), but typed
    // TSL's min/max/mod overloads don't cover integer nodes (B10 family) — so the
    // math runs in float instead, exact for these indices (< 2^24), and converts
    // back to uint at the end.
    const getNeighborIndices = (index: Node<'uint'>) => {
      const width = float(WIDTH)
      const x = float(index).mod(width)
      const y = float(index).div(width).floor()

      const leftX = x.sub(1).max(0)
      const rightX = x.add(1).min(width.sub(1))
      const bottomY = y.sub(1).max(0)
      const topY = y.add(1).min(width.sub(1))

      return {
        northIndex: uint(topY.mul(width).add(x)),
        southIndex: uint(bottomY.mul(width).add(x)),
        eastIndex: uint(y.mul(width).add(rightX)),
        westIndex: uint(y.mul(width).add(leftX)),
      }
    }

    const getNeighborValues = (index: Node<'uint'>, store: StorageBufferNode<'float'>) => {
      const { northIndex, southIndex, eastIndex, westIndex } = getNeighborIndices(index)
      return {
        north: store.element(northIndex),
        south: store.element(southIndex),
        east: store.element(eastIndex),
        west: store.element(westIndex),
      }
    }

    // One wave-equation step with explicit read/write buffers — built twice below
    // for the A→B and B→A ping-pong directions.
    const createComputeHeight = (
      readBuffer: StorageBufferNode<'float'>,
      writeBuffer: StorageBufferNode<'float'>,
    ) =>
      Fn(() => {
        const height = readBuffer.element(instanceIndex).toVar()
        const prevHeight = waterPrevHeight.element(instanceIndex).toVar()

        const { north, south, east, west } = getNeighborValues(instanceIndex, readBuffer)
        const neighborHeight = north.add(south).add(east).add(west).mul(0.5).sub(prevHeight)
        const newHeight = neighborHeight.mul(uViscosityNode).toVar()

        // Grid coordinate of this texel in [0, 1] (the kernel dispatches 2-D).
        const x = float(globalId.x).mul(1 / WIDTH)
        const y = float(globalId.y).mul(1 / WIDTH)

        // Mouse influence: distance from the pointer in world XZ, phased over PI —
        // "indent" the water by the scaled cosine, weighted by pointer velocity.
        const centerVec = vec2(0.5)
        const mousePhase = clamp(
          vec2(x, y).sub(centerVec).mul(BOUNDS).sub(uMousePos).length().mul(Math.PI).div(uMouseSizeNode),
          0.0,
          Math.PI,
        )
        newHeight.addAssign(cos(mousePhase).add(1.0).mul(uMouseDeepNode).mul(uMouseSpeed.length()))

        waterPrevHeight.element(instanceIndex).assign(height)
        writeBuffer.element(instanceIndex).assign(newHeight)
      })().compute(WIDTH * WIDTH, [16, 16])

    const computeHeightAtoB = createComputeHeight(waterHeightA, waterHeightB)
    const computeHeightBtoA = createComputeHeight(waterHeightB, waterHeightA)

    // Read helpers over the CURRENT read buffer — `select` on the uReadFromA uniform
    // flips every material/kernel read after each ping-pong dispatch, zero rebuilds.
    // Cast: select()'s typed cond param wants Node<'bool'>, but the runtime converts
    // the numeric uniform (the original passes this exact uniform(1)) — B10 family.
    const getCurrentHeight = (index: Node<'uint'>) =>
      select(
        uReadFromA as unknown as Node<'bool'>,
        waterHeightA.element(index),
        waterHeightB.element(index),
      )

    const getCurrentNormals = (index: Node<'uint'>) => {
      const { northIndex, southIndex, eastIndex, westIndex } = getNeighborIndices(index)
      const north = getCurrentHeight(northIndex)
      const south = getCurrentHeight(southIndex)
      const east = getCurrentHeight(eastIndex)
      const west = getCurrentHeight(westIndex)
      return {
        normalX: west.sub(east).mul(WIDTH / BOUNDS),
        normalY: south.sub(north).mul(WIDTH / BOUNDS),
      }
    }

    // Water surface graphs: the vertex stage reads the height buffers directly —
    // this is what the Canvas-level `maxStorageBuffersInVertexStage` limit is for.
    const waterPositionNode = Fn(() =>
      vec3(positionLocal.x, positionLocal.y, getCurrentHeight(vertexIndex)),
    )()

    const waterNormalNode = Fn(() => {
      // Lighting normals rebuilt from the undulating heightfield, once per vertex.
      const { normalX, normalY } = getCurrentNormals(vertexIndex)
      return transformNormalToView(vec3(normalX, normalY.negate(), 1.0)).toVertexStage()
    })()

    // Duck kernel: wed each duck to the surface (ease toward water height), push it
    // along the surface gradient, damp, and bounce off the pool walls. GPU-side
    // `If()`s — a JS `if` here would run once at graph build (AGENTS.md).
    const computeDucks = Fn(() => {
      const yOffset = float(-0.04)
      const verticalResponseFactor = float(0.98)
      const waterPushFactor = float(0.015)
      const linearDamping = float(0.92)
      const bounceDamping = float(-0.4)

      const duckElement = waterDuckData.element(instanceIndex)
      // Casts: struct member access (`.get`) types as bare `Node` — the fluent
      // vec surface doesn't resolve through it (typed-TSL gap, B10 cast family).
      const instancePosition = (duckElement.get('position') as unknown as Node<'vec3'>).toVar()
      const velocity = (duckElement.get('velocity') as unknown as Node<'vec2'>).toVar()

      // Simulation-grid texel under the duck.
      const gridCoordX = instancePosition.x.div(BOUNDS).add(0.5).mul(WIDTH)
      const gridCoordZ = instancePosition.z.div(BOUNDS).add(0.5).mul(WIDTH)
      const xCoord = uint(clamp(floor(gridCoordX), 0, WIDTH - 1))
      const zCoord = uint(clamp(floor(gridCoordZ), 0, WIDTH - 1))
      const heightInstanceIndex = zCoord.mul(WIDTH).add(xCoord)

      const waterHeight = getCurrentHeight(heightInstanceIndex)
      const { normalX, normalY } = getCurrentNormals(heightInstanceIndex)

      // Ease the duck toward the water height at its position.
      const targetY = waterHeight.add(yOffset)
      const deltaY = targetY.sub(instancePosition.y)
      instancePosition.y.addAssign(deltaY.mul(verticalResponseFactor))

      // The surface gradient pushes the duck horizontally (velocity is XZ).
      velocity.x.mulAssign(linearDamping)
      velocity.y.mulAssign(linearDamping)
      velocity.x.addAssign(normalX.mul(waterPushFactor))
      velocity.y.addAssign(normalY.mul(waterPushFactor))

      instancePosition.x.addAssign(velocity.x)
      instancePosition.z.addAssign(velocity.y)

      // Bounce off the pool walls, damped and inverted.
      If(instancePosition.x.lessThan(-LIMIT), () => {
        instancePosition.x.assign(-LIMIT)
        velocity.x.mulAssign(bounceDamping)
      }).ElseIf(instancePosition.x.greaterThan(LIMIT), () => {
        instancePosition.x.assign(LIMIT)
        velocity.x.mulAssign(bounceDamping)
      })

      If(instancePosition.z.lessThan(-LIMIT), () => {
        instancePosition.z.assign(-LIMIT)
        velocity.y.mulAssign(bounceDamping)
      }).ElseIf(instancePosition.z.greaterThan(LIMIT), () => {
        instancePosition.z.assign(LIMIT)
        velocity.y.mulAssign(bounceDamping)
      })

      ;(duckElement.get('position') as unknown as Node<'vec3'>).assign(instancePosition)
      ;(duckElement.get('velocity') as unknown as Node<'vec2'>).assign(velocity)
    })().compute(NUM_DUCKS)

    // Instance placement for the duck mesh — offset the source geometry by the
    // struct buffer's live position (same B10-family cast as above).
    const duckPositionNode = Fn(() => {
      const instancePosition = waterDuckData.element(instanceIndex).get('position') as unknown as Node<'vec3'>
      return positionLocal.add(instancePosition)
    })()

    return {
      computeHeightAtoB,
      computeHeightBtoA,
      computeDucks,
      uMousePos,
      uMouseSpeed,
      uReadFromA,
      waterPositionNode,
      waterNormalNode,
      duckPositionNode,
    }
  })

  // SUSPENDS — deliberately ordered after every creator hook above (AGENTS.md B18)
  // and before the meshes render: the water/duck materials carry custom position/
  // normal nodes, so their FIRST shader build must already see scene.environment
  // (three 0.185.1 IBL race, AGENTS.md B15). Suspending this component on the HDR
  // itself satisfies both rules at once — a drei <Environment> sibling could not.
  const envMap = useLoader(HDRLoader, HDR_URL)

  // Layout effect so the environment lands before the first RAF render builds the
  // shader graphs (clearcoat's pattern; B15 family).
  useLayoutEffect(() => {
    envMap.mapping = EquirectangularReflectionMapping
    scene.environment = envMap
    scene.background = envMap
    scene.backgroundBlurriness = 0.3
    scene.environmentIntensity = 1.25
    return () => {
      scene.environment = null
      scene.background = null
      scene.backgroundBlurriness = 0
      scene.environmentIntensity = 1
    }
  }, [scene, envMap])

  // Pool border: a 4-segment torus reads as a square rim once spun 45° — geometry
  // rotations baked exactly as the original does.
  const borderGeometry = useMemo(() => {
    const geometry = new TorusGeometry(4.2, 0.1, 12, 4)
    geometry.rotateX(Math.PI * 0.5)
    geometry.rotateY(Math.PI * 0.25)
    return geometry
  }, [])

  // Pointer state, refs only — the mouse uniforms are refreshed per FRAME below
  // (matching the original's per-frame raycast()), not per event, so a held-still
  // pointer decays mouseSpeed to zero exactly like the original.
  const pointerRef = useRef({ active: false, justPressed: false, point: new Vector2() })

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!event.nativeEvent.isPrimary) return
    pointerRef.current.active = true
    pointerRef.current.justPressed = true
    pointerRef.current.point.set(event.point.x, event.point.z)
    // Disturbing the water and orbiting can't share the drag (original:
    // `controls.enabled = false` on the first water hit).
    if (controlsRef.current) controlsRef.current.enabled = false
  }

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!event.nativeEvent.isPrimary || !pointerRef.current.active) return
    pointerRef.current.point.set(event.point.x, event.point.z)
  }

  // End the disturbance on pointerup anywhere — drags routinely release off-canvas
  // (tsl-procedural-terrain's window-listener pattern).
  useEffect(() => {
    const onPointerUp = () => {
      pointerRef.current.active = false
      if (controlsRef.current) controlsRef.current.enabled = true
    }
    window.addEventListener('pointerup', onPointerUp)
    return () => window.removeEventListener('pointerup', onPointerUp)
  }, [controlsRef])

  // EVERY FRAME, before the default render phase draws (NOT phase:'render' — compute
  // is not a render takeover): refresh the mouse uniforms, then step the sim on the
  // original's frame-counter cadence — dispatch every `7 - speed` frames, flipping
  // the ping-pong direction and the material's read buffer together.
  const frameRef = useRef(0)
  const pingPongRef = useRef(0)
  useFrame(
    () => {
      const pointer = pointerRef.current
      if (pointer.active) {
        if (pointer.justPressed) {
          // First hit of a press: move the origin without generating a wave.
          uMousePos.value.copy(pointer.point)
          pointer.justPressed = false
        }
        uMouseSpeed.value.set(pointer.point.x - uMousePos.value.x, pointer.point.y - uMousePos.value.y)
        uMousePos.value.copy(pointer.point)
      } else {
        uMouseSpeed.value.set(0, 0)
      }

      frameRef.current += 1
      if (frameRef.current >= 7 - speed) {
        // Ping-pong: alternate which buffer we read from and write to. The kernel
        // is 2-D ([16,16] workgroups), so the dispatch size is explicit: 8x8x1.
        if (pingPongRef.current === 0) {
          renderer.compute(computeHeightAtoB, [8, 8, 1])
          uReadFromA.value = 0 // material now reads from B (just written)
        } else {
          renderer.compute(computeHeightBtoA, [8, 8, 1])
          uReadFromA.value = 1 // material now reads from A (just written)
        }
        pingPongRef.current = 1 - pingPongRef.current

        if (ducksEnabled) renderer.compute(computeDucks)

        frameRef.current = 0
      }
    },
    { phase: 'update' },
  )

  // wireframe flips the pipeline topology — the property write alone doesn't re-key
  // the WebGPU pipeline (same family as instance-points' alphaToCoverage).
  const waterMaterialRef = useRef<MeshStandardNodeMaterial>(null)
  const borderMaterialRef = useRef<MeshStandardMaterial>(null)
  useEffect(() => {
    if (waterMaterialRef.current) waterMaterialRef.current.needsUpdate = true
    if (borderMaterialRef.current) borderMaterialRef.current.needsUpdate = true
  }, [wireframe])

  return (
    <>
      {/* The water surface: one vertex per simulation texel. */}
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[BOUNDS, BOUNDS, WIDTH - 1, WIDTH - 1]} />
        <meshStandardNodeMaterial
          ref={waterMaterialRef}
          color="#9bd2ec"
          metalness={0.9}
          roughness={0}
          transparent
          opacity={0.8}
          side={DoubleSide}
          positionNode={waterPositionNode}
          normalNode={waterNormalNode}
          wireframe={wireframe}
        />
      </mesh>

      {/* Pool border. */}
      <mesh geometry={borderGeometry}>
        <meshStandardMaterial ref={borderMaterialRef} color="#908877" roughness={0.2} wireframe={wireframe} />
      </mesh>

      {/* Invisible interaction plane: material-invisible (not mesh-invisible) so it
          still raycasts — the original's dedicated meshRay. */}
      <mesh rotation-x={-Math.PI / 2} onPointerDown={onPointerDown} onPointerMove={onPointerMove}>
        <planeGeometry args={[BOUNDS, BOUNDS]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* B17 gate: useGLTF suspends; letting it reach Canvas's boundary re-runs
          createRoot and freezes every time-driven graph (AGENTS.md). Mounted last —
          by the time the duck resolves, the environment above is long set. */}
      <Suspense fallback={null}>
        <Ducks positionNode={duckPositionNode} visible={ducksEnabled} wireframe={wireframe} />
      </Suspense>
    </>
  )
}
