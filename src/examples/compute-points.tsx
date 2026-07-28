/**
 * compute-points
 * R3F port of three.js `webgpu_compute_points`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_compute_points (~80 lines of JS)
 *
 * DEMONSTRATES
 * - EVERY-FRAME compute dispatch: `renderer.compute(computeNode)` runs inside a plain
 *   `useFrame({ phase: 'update' })`, once per rendered frame, driving 300k points
 *   entirely on the GPU — position/velocity live only in `instancedArray` storage,
 *   nothing is ever read back to the CPU
 * - `ComputeNode.onInit(({ renderer }) => ...)`: a SECOND kernel (per-particle random
 *   velocity, seeded from `instanceIndex`) that the renderer dispatches automatically
 *   the FIRST time the main kernel's pipeline is built — verified against
 *   `Renderer.js`: both the sync `compute()` and `compileComputeAsync()` call sites
 *   fire `onInitFunction` exactly once, before the first real dispatch. No separate
 *   seeding effect needed — the every-frame `useFrame` call above does double duty
 * - `PointsNodeMaterial` driving BOTH `positionNode` and `colorNode` straight off the
 *   same storage-buffer element, sampled directly in the VERTEX stage (not converted
 *   via `.toAttribute()` first, contrast `compute-particles`) — this needs the
 *   `maxStorageBuffersInVertexStage` device limit the original requests explicitly,
 *   reproduced here via `<Canvas renderer={{ requiredLimits: ... }}>`
 * - GPU-side `.select(a, b)` as a branchless conditional — velocity sign flips and the
 *   pointer-erase both use it instead of a TSL `If()` block
 *
 * DIVERGENCE from original
 * - The original's `OrthographicCamera(-1,1,1,-1,0,1)` never updates its frustum on
 *   resize (`onWindowResize` only calls `updateProjectionMatrix()`), so the -1..1
 *   square visibly stretches on non-square windows. This port uses `<Canvas
 *   orthographic>` plus a small `camera.zoom` effect pinning the frustum to a SQUARE
 *   `2*FRUSTUM_HALF` world units regardless of aspect (pattern:
 *   `materials-displacementmap`'s `OrthographicFraming`) — no stretch, at the cost of
 *   not matching the original's exact (arguably accidental) resize behavior
 * - DemoHelpers `controls={false} grid={false}`: the original has no camera
 *   interaction at all — a fixed 2D view is the point of a shadertoy-style demo
 * - The GUI's `scaleVector.x`/`.y` sliders (0-1) become leva `boundsX`/`boundsY`;
 *   `renderer.inspector` panel dropped (no Inspector wiring in this repo's shell)
 * - Pointer tracking: an invisible full-frustum plane with an `onPointerMove` handler
 *   (`event.point.xy` is already in the same -1..1 space the kernel expects, R3F did
 *   the raycast) instead of the original's `window` `mousemove` listener + manual NDC
 *   math. NOT `state.pointer`: fiber's `RootState.pointer` defaults to `(0,0)` — the
 *   canvas center — before any pointer event ever fires, and reading it unconditionally
 *   every frame (this port's first draft) creates a permanent erase field at the
 *   origin with no real cursor there. Nearby particles get zeroed every frame, land
 *   exactly on the origin, and re-trigger their own erase forever — a capture cascade
 *   that pulled all 300k points into a single dot within a couple of seconds in
 *   headless testing (caught by `pnpm test:animates`: 0px changed, correctly flagged
 *   as "frozen?" even though the frame loop itself was live). The event-driven plane
 *   sidesteps this entirely: `uPointer` only ever moves on a genuine hover
 * - `<points>`'s `count` field (instanced point draw count, read generically by
 *   `RenderObject.js`) isn't declared on `@types/three`'s `Points` class (unlike
 *   `Sprite`, which does declare it) — set imperatively in a `useLayoutEffect` via a
 *   ref instead of a JSX prop (candidate DefinitelyTyped fix, not a fiber/corpus gap)
 */
import { useLayoutEffect, useRef } from 'react'
import { useControls } from 'leva'
import { Canvas, useFrame, useNodes, useThree, useUniforms, type ThreeEvent } from '@react-three/fiber/webgpu'
import { Fn, color, float, instanceIndex, instancedArray, uniform, vec2 } from 'three/tsl'
import { Vector2 } from 'three/webgpu'
import type { Node, OrthographicCamera, Points, Renderer, WebGPURenderer } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const PARTICLE_COUNT = 300_000
// World-space half-size of the fixed frustum square (see header DIVERGENCE).
const FRUSTUM_HALF = 1.1

// Pins the orthographic frustum to a `2*FRUSTUM_HALF` world-unit SQUARE regardless of
// viewport aspect — fiber's default ortho sizing is raw PIXELS (materials-displacementmap
// pattern), which would otherwise show this -1..1 particle field at native-pixel scale.
function OrthographicFraming() {
  // useThree's `camera` types as the base Camera union even on an `orthographic`
  // Canvas — cast is safe here since this component only mounts under one (B9 family).
  const camera = useThree((s) => s.camera) as OrthographicCamera
  const size = useThree((s) => s.size)

  useLayoutEffect(() => {
    camera.zoom = Math.min(size.width, size.height) / (2 * FRUSTUM_HALF)
    camera.updateProjectionMatrix()
  }, [camera, size])

  return null
}

interface PointsFieldProps {
  boundsX: number
  boundsY: number
}

function PointsField({ boundsX, boundsY }: PointsFieldProps) {
  const rawRenderer = useThree((s) => s.renderer)
  // Cast: useThree types renderer as the WebGL/WebGPU union even on the `/webgpu`
  // entry (fiber typing gap, UPSTREAM.md B9) — `.compute()` exists only on WebGPURenderer.
  const renderer = rawRenderer as WebGPURenderer
  const pointsRef = useRef<Points>(null)

  const { uBoundsX, uBoundsY } = useUniforms(
    { uBoundsX: boundsX, uBoundsY: boundsY },
    'computePoints', // WGSL-identifier rule: camelCase scope, never kebab-case
  )
  // Casts: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`
  // (documented fiber typing gap — see compute-particles et al.).
  const uBoundsXNode = uBoundsX as unknown as Node<'float'>
  const uBoundsYNode = uBoundsY as unknown as Node<'float'>

  // All node graphs built once. ROOT-LEVEL useNodes on purpose (UPSTREAM.md B16):
  // a scoped call would name entries `${scope}.${name}`, and the sprite-material
  // nodes below reach WGSL codegen.
  const { computeNode, uPointer, positionNode, colorNode } = useNodes(() => {
    const particleArray = instancedArray(PARTICLE_COUNT, 'vec2')
    const velocityArray = instancedArray(PARTICLE_COUNT, 'vec2')

    // Mutated imperatively from the invisible plane's onPointerMove below, not from
    // React state — a plain TSL uniform, not useUniforms (same rationale as
    // compute-particles' `uClickPos`). Off-canvas until the first real hover.
    const uPointer = uniform(new Vector2(-10, -10))

    const computeShaderFn = Fn(() => {
      const particle = particleArray.element(instanceIndex)
      const velocity = velocityArray.element(instanceIndex)

      const limit = vec2(uBoundsXNode, uBoundsYNode)
      const position = particle.add(velocity).toVar()

      velocity.x.assign(position.x.abs().greaterThanEqual(limit.x).select(velocity.x.negate(), velocity.x))
      velocity.y.assign(position.y.abs().greaterThanEqual(limit.y).select(velocity.y.negate(), velocity.y))

      position.assign(position.min(limit).max(limit.negate()))

      const pointerSize = float(0.1)
      const distanceFromPointer = uPointer.sub(position).length()

      particle.assign(distanceFromPointer.lessThanEqual(pointerSize).select(vec2(0, 0), position))
    })

    const computeNode = computeShaderFn()
      .compute(PARTICLE_COUNT)
      .onInit(({ renderer }: { renderer: Renderer }) => {
        // Precompute: give every particle a tiny, angle-randomized drift velocity —
        // fires exactly once, the first time this compute node is dispatched.
        const precomputeShaderNode = Fn(() => {
          const particleIndex = float(instanceIndex)

          const randomAngle = particleIndex.mul(0.005).mul(Math.PI * 2)
          const randomSpeed = particleIndex.mul(0.00000001).add(0.0000001)

          const velX = randomAngle.sin().mul(randomSpeed)
          const velY = randomAngle.cos().mul(randomSpeed)

          velocityArray.element(instanceIndex).assign(vec2(velX, velY))
        })

        renderer.compute(precomputeShaderNode().compute(PARTICLE_COUNT))
      })

    return {
      computeNode,
      uPointer,
      positionNode: particleArray.element(instanceIndex),
      colorNode: particleArray.element(instanceIndex).add(color(0xffffff)),
    }
  })

  // EVERY FRAME: step the simulation. Pointer updates arrive separately, via the
  // invisible plane's onPointerMove below (see header DIVERGENCE for why NOT
  // state.pointer).
  useFrame(
    () => {
      renderer.compute(computeNode)
    },
    { phase: 'update' },
  )

  // R3F already did the raycast; event.point.xy lands directly in the same -1..1
  // space the kernel expects (the plane spans the fixed frustum square).
  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    uPointer.value.set(event.point.x, event.point.y)
  }

  // Imperative escape hatch: `Points.count` (instanced draw count) and a 1-vertex
  // drawRange are read generically off the object by the renderer (RenderObject.js)
  // but aren't declared on `@types/three`'s Points class — see header DIVERGENCE.
  // Must land before the first WebGPU render reads it (Layer 1 useLayoutEffect rule).
  useLayoutEffect(() => {
    const points = pointsRef.current
    if (!points) return
    points.geometry.drawRange.count = 1
    ;(points as unknown as { count: number }).count = PARTICLE_COUNT
  }, [])

  return (
    <>
      {/* positionNode fully relocates every point in the vertex stage; three's
          CPU-side culling sphere (built from the single dummy vertex at the origin)
          knows nothing about it — frustumCulled must be off (corpus rule). */}
      <points ref={pointsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array(3), 3]} />
        </bufferGeometry>
        <pointsNodeMaterial positionNode={positionNode} colorNode={colorNode} />
      </points>
      {/* Invisible hit plane spanning the fixed frustum square — material-invisible
          (not mesh-invisible) so it still raycasts; the only object with a pointer
          handler (same pattern as compute-particles). */}
      <mesh onPointerMove={onPointerMove}>
        <planeGeometry args={[2 * FRUSTUM_HALF, 2 * FRUSTUM_HALF]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </>
  )
}

export default function ComputePoints() {
  const { boundsX, boundsY } = useControls('compute-points', {
    boundsX: { value: 1, min: 0, max: 1, step: 0.01, label: 'bounds x' },
    boundsY: { value: 1, min: 0, max: 1, step: 0.01, label: 'bounds y' },
  })

  return (
    <Canvas
      // Reading a storage buffer directly in the VERTEX stage (positionNode above)
      // needs this device limit — the original requests it explicitly for the same
      // reason (see header DEMONSTRATES).
      renderer={{ requiredLimits: { maxStorageBuffersInVertexStage: 1 } }}
      orthographic
      background="#000000"
      camera={{ position: [0, 0, 1], near: 0, far: 1 }}
    >
      <OrthographicFraming />
      <PointsField boundsX={boundsX} boundsY={boundsY} />
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  )
}
