/**
 * skinning-points
 * R3F port of three.js `webgpu_skinning_points`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_skinning_points (~130 lines of JS)
 *
 * DEMONSTRATES
 * - Compute-in-material: a ComputeNode assigned as `positionNode` auto-dispatches
 *   before every draw of the object (ComputeNode.updateBeforeType === 'object') and
 *   its kernel's RETURN value feeds the vertex stage — a per-frame GPU pipeline with
 *   zero JS dispatch code (no useFrame, no renderer.compute() in the loop)
 * - `computeSkinning(mesh)` TSL: evaluating skeletal skinning inside a compute kernel
 *   for a mesh that is never rasterized itself (the SkinnedMesh stays in the scene,
 *   hidden, purely as the bone-matrix source the mixer animates)
 * - Velocity from double-buffering-in-place: the kernel diffs the new skinned world
 *   position against last frame's storage value, so per-point speed drives colorNode
 *   (blue -> orange) and sizeNode (exp ramp) — mixer `timeScale` visibly re-tunes both
 * - `ComputeNode.onInit(({ renderer }) => ...)`: seeding the position/speed storage
 *   buffers with one extra dispatch before the first frame
 * - One `<sprite count={n}>` + PointsNodeMaterial drawing n instanced point quads,
 *   `shapeCircle()` opacity + alphaTest for round points
 * - Playing GLTF clips BY NAME (`SambaDance`) — Michelle.glb also ships a `TPose`
 *   utility clip that must not enter the blend
 *
 * DIVERGENCE from original
 * - Model stands upright under orbit CameraControls; the original lies the model flat
 *   (rotation.x = -PI/2) under a fixed straight-down camera to fake an upright view
 * - leva controls added: mixer timeScale/paused (speed-driven color/size respond
 *   live) and a showSource toggle revealing the hidden skinned mesh driving the
 *   points (the original's AmbientLight only ever lights this reveal — kept for it)
 * - DemoHelpers baseline added with grid off (the model is 170 world-units tall at
 *   the original's x100 scale — the 0.5-unit demo grid is sub-pixel noise there)
 * - `renderer={{ toneMapping: NoToneMapping }}` set explicitly: the original renders
 *   with the WebGPURenderer default, and fiber's ACESFilmic default would mute the
 *   unlit blue/orange point palette
 */
import { Suspense, useEffect, useLayoutEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useAnimations, useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { Fn, color, computeSkinning, instanceIndex, instancedArray, mix, objectWorldMatrix, shapeCircle } from 'three/tsl'
import { NoToneMapping } from 'three/webgpu'
import type { Node, Renderer, SkinnedMesh } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const MICHELLE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Michelle.glb'

// The original's x100 blow-up. The speed->color/size constants below are tuned for
// world deltas at this scale — keep them together.
const MODEL_SCALE = 100

// One point cloud per skinned mesh: n instanced quads whose positions live in a GPU
// storage buffer that the material's own positionNode-compute rewrites every frame.
function SkinnedMeshPoints({ mesh }: { mesh: SkinnedMesh }) {
  // Plain useMemo, not useNodes: the graph closes over suspended data (the loaded
  // mesh), and creator-store writes deferred past a suspension are the B18 hazard —
  // nothing here needs the fiber store, three-side nodes work fine.
  const { count, positionNode, colorNode, sizeNode, opacityNode } = useMemo(() => {
    const count = mesh.geometry.getAttribute('position').count

    // Current world position + last-frame delta, one vec3 each per source vertex.
    const pointPositions = instancedArray(count, 'vec3').setPBO(true)
    const pointSpeeds = instancedArray(count, 'vec3').setPBO(true)

    const speedAttribute = pointSpeeds.toAttribute()

    // Cast: @types/three declares computeSkinning as returning void, but at runtime
    // it returns the skinned geometry-space position node (its own jsdoc says
    // {Node<vec3>}) — B10/B11-family typing gap, verified against
    // src/nodes/accessors/Skinning.js.
    const skinnedPosition = computeSkinning(mesh) as unknown as Node<'vec3'>

    // The update: skin -> world space, diff against the stored position for speed,
    // store both. The original wraps this in `Fn(..., 'void')` and calls it as a TSL
    // statement from both kernels; fiber's `three/tsl` Fn module augmentation types
    // neither the string layout nor void returns (B10 family), so we inline at BUILD
    // TIME instead — a plain JS closure emitting the same element/assign statements
    // into whichever kernel calls it (void TSL Fns are build-time inlined anyway;
    // identical node graph, no typing gap).
    const emitPointUpdate = () => {
      const pointPosition = pointPositions.element(instanceIndex)
      const pointSpeed = pointSpeeds.element(instanceIndex)

      const skinnedWorldPosition = objectWorldMatrix(mesh).mul(skinnedPosition)

      pointSpeed.assign(skinnedWorldPosition.sub(pointPosition))
      pointPosition.assign(skinnedWorldPosition)
    }

    return {
      count,
      // The showcased API: the ComputeNode IS the positionNode. The renderer
      // dispatches it before drawing the sprite (updateBeforeType 'object') and the
      // vertex stage reads the Fn's return value; onInit seeds the buffers with one
      // pre-first-frame dispatch (its renderer arg makes useThree unnecessary —
      // param annotated, the chained onInit types it away).
      positionNode: Fn(() => {
        emitPointUpdate()

        return pointPositions.toAttribute()
      })()
        .compute(count)
        .onInit(({ renderer }: { renderer: Renderer }) => {
          renderer.compute(
            Fn(() => {
              emitPointUpdate()
            })().compute(count),
          )
        }),
      // Verbatim original graph: the chained `speed.mul(0.6).mix(blue, orange)` maps
      // to mixElement — the NODE is the mix FACTOR: mix(blue, orange, speed * 0.6)
      // (fast points go orange). Functional form because `.mix` is missing from the
      // typed fluent surface; cast because WGSL mix() takes a componentwise VECTOR
      // factor at runtime but the typed surface only declares `t: float` (B10 family).
      colorNode: mix(color(0x0066ff), color(0xff9000), speedAttribute.mul(0.6) as unknown as Node<'float'>),
      sizeNode: speedAttribute.length().exp().min(5).mul(5).add(1),
      opacityNode: shapeCircle(),
    }
  }, [mesh])

  return (
    // positionNode fully relocates the unit quad into world space — three's CPU-side
    // culling sphere knows nothing about it, so culling must be off (corpus rule).
    <sprite count={count} frustumCulled={false}>
      <pointsNodeMaterial
        positionNode={positionNode}
        colorNode={colorNode}
        sizeNode={sizeNode}
        opacityNode={opacityNode}
        sizeAttenuation={false}
        alphaTest={0.5}
      />
    </sprite>
  )
}

interface MichellePointsProps {
  timeScale: number
  paused: boolean
  showSource: boolean
}

function MichellePoints({ timeScale, paused, showSource }: MichellePointsProps) {
  const { scene, animations } = useGLTF(MICHELLE_URL)
  const { actions, mixer } = useAnimations(animations, scene)

  // BY NAME: Michelle.glb ships SambaDance AND a TPose utility clip (corpus rule —
  // never play Object.values(actions) blindly).
  useEffect(() => {
    actions.SambaDance?.play()
  }, [actions])

  useEffect(() => {
    mixer.timeScale = paused ? 0 : timeScale
  }, [mixer, paused, timeScale])

  const skinnedMeshes = useMemo(() => {
    const meshes: SkinnedMesh[] = []
    scene.traverse((child) => {
      if ((child as SkinnedMesh).isSkinnedMesh) meshes.push(child as SkinnedMesh)
    })
    return meshes
  }, [scene])

  // Hide the source mesh before the first render (layout, not passive — no one-frame
  // flash of the rasterized model). The mixer still animates its skeleton, which is
  // all computeSkinning reads.
  useLayoutEffect(() => {
    for (const mesh of skinnedMeshes) mesh.visible = showSource
  }, [skinnedMeshes, showSource])

  return (
    <>
      <primitive object={scene} scale={MODEL_SCALE} />
      {skinnedMeshes.map((mesh) => (
        <SkinnedMeshPoints key={mesh.uuid} mesh={mesh} />
      ))}
    </>
  )
}

export default function SkinningPoints() {
  const { timeScale, paused, showSource } = useControls('skinning-points', {
    timeScale: { value: 1, min: 0, max: 2 },
    paused: false,
    showSource: false,
  })

  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#111111"
      camera={{ position: [0, 160, 320], fov: 50, near: 1, far: 2000 }}
    >
      <ambientLight intensity={10} />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes every time-driven graph (AGENTS.md; corpus-wide repair). */}
      <Suspense fallback={null}>
        <MichellePoints timeScale={timeScale} paused={paused} showSource={showSource} />
      </Suspense>
      <DemoHelpers grid={false} target={[0, 85, 0]} minDistance={40} maxDistance={900} />
    </Canvas>
  )
}
