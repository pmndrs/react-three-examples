/**
 * compute-geometry
 * R3F port of three.js `webgpu_compute_geometry`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_compute_geometry (~200 lines of JS)
 *
 * DEMONSTRATES
 * - `NodeMaterial.geometryNode`: a dedicated hook (`NodeMaterial.js` —
 *   `builder.stack.outputNode.bypass(this.geometryNode)`) for compute that must run
 *   BEFORE the vertex/fragment stages build. Assigning a `ComputeNode` to it makes the
 *   renderer auto-dispatch that compute before every draw of the object
 *   (`ComputeNode.updateBefore` -> `renderer.compute(this)`) — zero `useFrame`,
 *   zero manual `renderer.compute()` call in the render loop (sibling technique to
 *   `skinning-points`' compute-as-`positionNode`, one level earlier in the pipeline)
 * - `storage(bufferAttribute, type, count)` wrapping a MESH's own existing `position`
 *   BufferAttribute (not a fresh `instancedArray`) as the read-only "rest shape",
 *   alongside two `StorageBufferAttribute`s (current position, velocity) — a per-vertex
 *   verlet/spring simulation living entirely in geometry-attribute-shaped storage
 * - `objectWorldMatrix(mesh)`: reading a live mesh's world matrix inside a compute
 *   kernel, to turn a world-space pointer hit into the mesh's local/geometry space
 * - `attribute('storagePosition')`: the vertex stage reading a geometry attribute BY
 *   NAME that the compute kernel writes every frame — no JS-side attribute sync at all
 *
 * UPSTREAM FINDING / GOTCHA (candidate for AGENTS.md — needs a second pair of eyes)
 * - Seeding `storagePosition` from the rest shape has a real timing hazard: if the
 *   jelly spring kernel ever runs once against unseeded (zero-valued)
 *   `storagePosition`, the huge initial basePosition-vs-currentPosition distance
 *   blows the spring past floating-point range within a couple of frames — NaN
 *   positions, permanently degenerate/invisible geometry, the simulation never
 *   recovers (confirmed by screenshot + isolating every other variable: geometry/
 *   camera/scale/material were all independently verified fine in isolation). FOUR
 *   seeding strategies were tried, empirically, in this exact scene: (1) the
 *   original's `computeUpdate.onInit(() => renderer.compute(computeInit))` — a
 *   reentrant `renderer.compute()` call from inside another `renderer.compute()`
 *   call's `onInitFunction` — completes with no console error, mesh still blank; (2)
 *   a plain `useEffect` dispatch (this corpus's usual compute-init cadence, e.g.
 *   `compute-particles`) — also blank; (3) `useLayoutEffect` — ALSO still blank,
 *   which was surprising (it should run before the first paint/RAF); (4) dispatching
 *   `renderer.compute(computeInit)` SYNCHRONOUSLY inline, at the end of the same
 *   `useMemo` that builds the graph and sets `geometryNode` — this is the only
 *   approach that worked, reproducibly. Root cause NOT fully diagnosed — (1)'s
 *   failure is plausibly command-encoder reentrancy, but (2) and (3) both failing
 *   while (4) succeeds doesn't fit a simple "must precede first paint" story either;
 *   flagged for someone with WebGPU backend-source access to confirm the actual
 *   mechanism before promoting this into a general AGENTS.md rule
 *

 * DIVERGENCE from original
 * - The original defines its compute graph as a standalone `jelly = Fn(({ renderer,
 *   geometry, object }) => ...)`, called as `jelly()` with NO arguments — TSL defers
 *   the call and, at build time, hands the (proxied) `NodeBuilder` itself as the sole
 *   arg, which happens to carry `.renderer`/`.geometry`/`.object` fields for whatever
 *   is currently building (verified in `TSLCore.js`'s `ShaderCallNodeInternal`). That
 *   indirection exists because the original defines `jelly` at module scope BEFORE the
 *   GLTF loads. Here the compute graph is built inside a `useMemo` that ALREADY closes
 *   over `mesh` and `renderer` (both are simply in scope) — the builder-context trick
 *   is unnecessary and dropped for plain closures, a simplification enabled by R3F's
 *   hook/effect ordering rather than a limitation of anything upstream
 * - Pointer raycasting: the original's global `pointermove` listener + manual
 *   `Raycaster.intersectObject(scene)` becomes `onPointerMove`/`onPointerLeave`
 *   directly on the mesh (R3F already did the raycast; `event.point` is the world-space
 *   hit). Unlike `compute-particles`' pointer handler, there is NO `event.buttons`
 *   drag guard here — the original paints on every raycast hit regardless of mouse
 *   button state, so dragging to orbit the camera also deforms the jelly, which is
 *   part of the original's interactive feel and is kept verbatim
 * - `renderer.inspector.createParameters` panel becomes leva (elasticity/damping/
 *   brush size/brush strength, same ranges and defaults)
 * - `scene.backgroundNode` cast: `@types/three`'s `Scene` doesn't declare it even
 *   though the renderer reads it directly off the live instance (B11 family, same
 *   pattern as `backdrop-area`'s `SceneBackground`) — the purple radial-vignette
 *   gradient is ported verbatim
 * - `useUniforms` is called BEFORE the suspending `useGLTF` (ordering rule, AGENTS.md
 *   B18 — `compute-cloth` precedent); the compute/material graph itself is built in a
 *   plain `useMemo`, not `useNodes` — it closes over the SUSPENDED mesh/geometry, and
 *   nothing in it needs the fiber store (same rationale as `skinning-points`)
 * - `renderer={{ toneMapping: NoToneMapping }}` explicit — the original renders with
 *   the WebGPURenderer default; fiber's ACESFilmic default would mute the flat-shaded
 *   normal-material head against the saturated gradient background
 * - Manifest `"static": true`: the jelly kernel settles to a true equilibrium
 *   (distance -> 0 -> force -> 0 -> speed decays to 0) within a couple of frames once
 *   `computeInit` seeds it and no pointer is painting — an automated headless cursor
 *   never hovers the mesh, so `pnpm test:animates`' pixel-diff correctly sees zero
 *   change at rest. The compute-in-`geometryNode` dispatch is still live every frame
 *   (verified: `__frameCount` advances, no dual-root warnings) — it is idle, not frozen
 */
import { Suspense, useMemo } from 'react'
import { useControls } from 'leva'
import { Canvas, useThree, useUniforms, type ThreeEvent } from '@react-three/fiber/webgpu'
import { Fn, If, attribute, color, instanceIndex, objectWorldMatrix, screenUV, storage, uniform } from 'three/tsl'
import {
  MeshNormalNodeMaterial,
  NoToneMapping,
  StorageBufferAttribute,
  Vector4,
  type BufferAttribute,
  type Mesh,
  type Node,
  type WebGPURenderer,
} from 'three/webgpu'
import { useGLTF } from '@react-three/drei/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples'
const MODEL_URL = `${ASSETS}/models/gltf/LeePerrySmith/LeePerrySmith.glb`

// scene.backgroundNode cast — @types/three's Scene doesn't declare it even though the
// webgpu renderer reads it directly off the live scene instance (B11 family, same
// pattern as backdrop-area's SceneBackground). Purple radial-vignette gradient, ported
// verbatim from the original's init().
function SceneBackground() {
  const scene = useThree((s) => s.scene)

  useMemo(() => {
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null }
    const bgColor = screenUV.y.mix(color(0x9f87f7), color(0xf2cdcd))
    const bgVignette = screenUV.distance(0.5).remapClamp(0.3, 0.8).oneMinus()
    const bgIntensity = 4
    withBackgroundNode.backgroundNode = bgColor.mul(bgVignette.mul(color(0xa78ff6).mul(bgIntensity)))
  }, [scene])

  return null
}

interface JellyHeadProps {
  elasticity: number
  damping: number
  brushSize: number
  brushStrength: number
}

function JellyHead({ elasticity, damping, brushSize, brushStrength }: JellyHeadProps) {
  const rawRenderer = useThree((s) => s.renderer)
  // Cast: useThree types renderer as the WebGL/WebGPU union even on the `/webgpu`
  // entry (fiber typing gap, UPSTREAM.md B9) — `.compute()` exists only on WebGPURenderer.
  const renderer = rawRenderer as WebGPURenderer

  // Leva-driven uniforms — called BEFORE the suspending useGLTF below (ordering rule,
  // AGENTS.md B18; compute-cloth precedent). WGSL-identifier rule: camelCase scope.
  const { uElasticity, uDamping, uBrushSize, uBrushStrength } = useUniforms(
    { uElasticity: elasticity, uDamping: damping, uBrushSize: brushSize, uBrushStrength: brushStrength },
    'computeGeometry',
  )
  // Casts: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`
  // (documented fiber typing gap — see compute-particles et al.).
  const uElasticityNode = uElasticity as unknown as Node<'float'>
  const uDampingNode = uDamping as unknown as Node<'float'>
  const uBrushSizeNode = uBrushSize as unknown as Node<'float'>
  const uBrushStrengthNode = uBrushStrength as unknown as Node<'float'>

  const { scene } = useGLTF(MODEL_URL)
  const mesh = useMemo(() => scene.children[0] as Mesh, [scene])

  // Plain useMemo, not useNodes: the graph closes over the SUSPENDED mesh/geometry,
  // and nothing here needs the fiber store (same rationale as skinning-points).
  const { material, uPointer } = useMemo(() => {
    const geometry = mesh.geometry
    const count = geometry.attributes.position.count

    const positionBaseAttribute = geometry.attributes.position as BufferAttribute
    const positionStorageBufferAttribute = new StorageBufferAttribute(count, 3)
    const speedBufferAttribute = new StorageBufferAttribute(count, 3)

    // The vertex stage reads this attribute BY NAME every frame (see `attribute()`
    // below) — the compute kernel is the only thing that ever writes it.
    geometry.setAttribute('storagePosition', positionStorageBufferAttribute)

    const positionAttribute = storage(positionBaseAttribute, 'vec3', count)
    const positionStorageAttribute = storage(positionStorageBufferAttribute, 'vec3', count)
    const speedAttribute = storage(speedBufferAttribute, 'vec3', count)

    const basePosition = positionAttribute.element(instanceIndex)
    const currentPosition = positionStorageAttribute.element(instanceIndex)
    const currentSpeed = speedAttribute.element(instanceIndex)

    // Mutated imperatively per pointer event, not from React state — a plain TSL
    // uniform, not useUniforms (same rationale as compute-particles' uClickPos). `.w`
    // is the original's "brush active" flag (1 = painting, 0 = idle).
    const uPointer = uniform(new Vector4(0, 0, 0, 0))

    const computeInit = Fn(() => {
      currentPosition.assign(basePosition)
    })().compute(count)

    const computeUpdate = Fn(() => {
      If(uPointer.w.equal(1), () => {
        const worldPosition = objectWorldMatrix(mesh).mul(currentPosition)
        const dist = worldPosition.distance(uPointer.xyz)
        const direction = uPointer.xyz.sub(worldPosition).normalize()
        const power = uBrushSizeNode.sub(dist).max(0).mul(uBrushStrengthNode)

        currentPosition.addAssign(direction.mul(power))
      })

      // jelly: spring the current position back toward the rest shape
      const distance = basePosition.distance(currentPosition)
      const force = uElasticityNode.mul(distance).mul(basePosition.sub(currentPosition))

      currentSpeed.addAssign(force)
      currentSpeed.mulAssign(uDampingNode)
      currentPosition.addAssign(currentSpeed)
    })().compute(count)

    const material = new MeshNormalNodeMaterial()
    // The zero-arg Fn idiom (see header DEMONSTRATES) — geometryNode auto-dispatches
    // this compute before every draw, no useFrame/renderer.compute() call needed here.
    material.geometryNode = computeUpdate
    material.positionNode = attribute('storagePosition')

    // ONCE, dispatched SYNCHRONOUSLY here — not in an effect. See header UPSTREAM
    // FINDING: geometryNode auto-dispatches computeUpdate on the very FIRST rendered
    // frame, and even useLayoutEffect (fires before paint) loses that race in
    // practice. Seeding inline, before this useMemo returns, is the only timing that
    // reliably lands before the first auto-dispatch.
    renderer.compute(computeInit)

    return { material, uPointer }
  }, [mesh, renderer, uElasticityNode, uDampingNode, uBrushSizeNode, uBrushStrengthNode])

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    uPointer.value.set(event.point.x, event.point.y, event.point.z, 1)
  }
  const onPointerLeave = () => {
    uPointer.value.w = 0
  }

  return (
    <primitive object={mesh} scale={0.1} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <primitive object={material} attach="material" />
    </primitive>
  )
}

export default function ComputeGeometry() {
  const { elasticity, damping, brushSize, brushStrength } = useControls('compute-geometry', {
    elasticity: { value: 0.4, min: 0, max: 0.5, step: 0.01 },
    damping: { value: 0.94, min: 0.9, max: 0.98, step: 0.01 },
    brushSize: { value: 0.25, min: 0.1, max: 0.5, step: 0.01, label: 'brush size' },
    brushStrength: { value: 0.22, min: 0.1, max: 0.3, step: 0.01, label: 'brush strength' },
  })

  return (
    <Canvas
      // Original renders with the WebGPURenderer default (no tone mapping) — explicit
      // here because fiber's Canvas defaults to ACESFilmic (see header DIVERGENCE).
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [0, 0, 1], fov: 50, near: 0.1, far: 10 }}
    >
      <SceneBackground />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes every time-driven graph (AGENTS.md; corpus-wide repair). */}
      <Suspense fallback={null}>
        <JellyHead elasticity={elasticity} damping={damping} brushSize={brushSize} brushStrength={brushStrength} />
      </Suspense>
      <DemoHelpers grid={false} minDistance={0.7} maxDistance={2} />
    </Canvas>
  )
}
