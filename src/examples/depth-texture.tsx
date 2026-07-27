/**
 * depth-texture
 * R3F port of three.js `webgpu_depth_texture`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_depth_texture (~90 lines of JS)
 *
 * DEMONSTRATES
 * - Rendering the scene's depth into a texture via `useRenderPipeline`'s automatic
 *   scene pass (`passes.scenePass.getTextureNode('depth')`) — the original's manual
 *   `RenderTarget` + `DepthTexture` + `QuadMesh` two-pass render loop is exactly what
 *   the hook's default scene pass already produces, same pattern as the `rtt` port
 * - `scene.overrideMaterial`, a three.js escape hatch that forces every mesh through a
 *   single material for the pass — kept visible/imperative (`useThree` + a
 *   `useLayoutEffect`), not hidden inside a helper
 * - `PassNode.getLinearDepthNode()` as an alternative to the raw (nonlinear) depth
 *   buffer, switched live via a leva toggle using TSL `select()` — a reactive
 *   node-graph branch driven by a uniform, per the build-time-vs-run-time rule (a bare
 *   JS `if (linearDepth)` in the pipeline callback would only run once, when the graph
 *   is built, and never react to the toggle again)
 *
 * DIVERGENCE from original
 * - The manual `renderer.setRenderTarget(renderTarget)` / `QuadMesh.render()` two-pass
 *   loop and the manual `window.resize` listener are gone — `useRenderPipeline`'s scene
 *   pass ties its depth render target to the canvas size automatically
 * - Leva toggle (raw vs. linear depth) added — not in the original, which only ever
 *   shows raw depth. Demonstrates `getLinearDepthNode()` alongside the raw output;
 *   defaults to raw depth, matching the original's look
 * - DemoHelpers camera controls (camera-controls v3, damped) replace the original's
 *   `OrbitControls` + `enableDamping`; grid disabled — the knot field is a floating
 *   cluster with no ground-plane concept, matching precedent from other space-scene
 *   ports (`sky`, `materials-envmaps`)
 * - Per-knot transforms computed once via component-level `useMemo` instead of the
 *   original's module-level `init()` loop; same distribution (50 knots scattered over
 *   a radius-5 sphere shell, random rotations)
 */
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { Canvas, useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { select, vec3, vec4 } from 'three/tsl'
import { MeshBasicNodeMaterial, TorusKnotGeometry, type Node } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const KNOT_COUNT = 50
const FIELD_RADIUS = 5

// Scatters `count` points over a sphere shell of the given radius — same distribution
// as the original's inline loop (uniform z, random azimuth).
function scatterOnSphere(count: number, radius: number) {
  return Array.from({ length: count }, () => {
    const azimuth = Math.random() * 2 * Math.PI
    const z = Math.random() * 2 - 1
    const ringRadius = Math.sqrt(1 - z * z) * radius
    return {
      position: [Math.cos(azimuth) * ringRadius, Math.sin(azimuth) * ringRadius, z * radius] as [
        number,
        number,
        number,
      ],
      rotation: [Math.random(), Math.random(), Math.random()] as [number, number, number],
    }
  })
}

// The knot field. Materials are irrelevant here: `scene.overrideMaterial` (below)
// replaces whatever each mesh is assigned before the scene pass renders, so every knot
// shares one geometry and the JSX omits a material entirely.
function TorusKnotField() {
  const geometry = useMemo(() => new TorusKnotGeometry(1, 0.3, 128, 64), [])
  const knots = useMemo(() => scatterOnSphere(KNOT_COUNT, FIELD_RADIUS), [])

  return (
    <>
      {knots.map((knot, i) => (
        <mesh key={i} geometry={geometry} position={knot.position} rotation={knot.rotation} />
      ))}
    </>
  )
}

// Forces every object in the scene through one material for the depth pass — the
// original's `scene.overrideMaterial = new MeshBasicNodeMaterial()`. Set in
// `useLayoutEffect`: this is scene-graph state the render pipeline reads every frame,
// so it must be attached before the first RAF render, not after a passive effect.
function DepthOverride() {
  const scene = useThree((state) => state.scene)
  const material = useMemo(() => new MeshBasicNodeMaterial(), [])

  useLayoutEffect(() => {
    scene.overrideMaterial = material
    return () => {
      scene.overrideMaterial = null
    }
  }, [scene, material])

  return null
}

interface DepthPipelineProps {
  linearDepth: boolean
}

// Renders the scene pass's depth texture directly to the screen. `select()` picks
// between the raw (nonlinear) depth node and `getLinearDepthNode()`'s camera-space
// version every frame, driven by a uniform.
function DepthPipeline({ linearDepth }: DepthPipelineProps) {
  const { uLinear } = useUniforms(() => ({ uLinear: 0 }))

  useEffect(() => {
    uLinear.value = linearDepth ? 1 : 0
  }, [uLinear, linearDepth])

  useRenderPipeline(({ renderPipeline, passes }) => {
    if (!renderPipeline) return

    const rawDepth = passes.scenePass.getTextureNode('depth')
    const linearOut = vec4(vec3(passes.scenePass.getLinearDepthNode('depth')), 1)
    // fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`, so it never
    // structurally narrows to `Node<'float'>` even though it is one at runtime
    // (documented fiber typing gap, see rtt/skinning-instancing).
    const mode = uLinear as unknown as Node<'float'>

    renderPipeline.outputNode = select(mode.greaterThan(0.5), linearOut, rawDepth)
  })

  return null
}

export default function DepthTexture() {
  const { linearDepth } = useControls('depth-texture', {
    linearDepth: false,
  })

  return (
    <Canvas renderer background="#222222" camera={{ position: [0, 0, 4], fov: 70, near: 1, far: 20 }}>
      <TorusKnotField />
      <DepthOverride />
      <DepthPipeline linearDepth={linearDepth} />
      <DemoHelpers grid={false} minDistance={1} maxDistance={15} />
    </Canvas>
  )
}
