/**
 * postprocessing-dof
 * R3F port of three.js `webgpu_postprocessing_dof`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_dof (~140 lines of JS)
 *
 * DEMONSTRATES
 * - `dof()` (three/addons DepthOfFieldNode) as the pipeline `outputNode`, fed by the
 *   scene pass's color texture AND its `getViewZNode()` — a post effect that consumes
 *   per-pixel view-space depth, not just color
 * - The pass-owned-uniform dynamism pattern with USER-created uniforms: `dof()` wraps
 *   plain numbers in constant nodes (no built-in uniform fields, unlike `bloom()`), so
 *   the three/tsl `uniform()` nodes are created inside the mainCB — exactly as the
 *   original does — registered via return-to-register, and mutated (`.value`) from a
 *   React effect on leva changes; no rebuild, no closed-over props
 * - An `<instancedMesh>` grid (14x9x14 = 1764 spheres) with matrices set imperatively
 *   in `useLayoutEffect` (before the first RAF render / bounding-sphere computation)
 * - A TSL `colorNode` mixing a cube texture with `oscSine(positionWorld + time)` — the
 *   pulsing brightness travels as a wave through world space, built once in a memo and
 *   attached declaratively via JSX
 * - Tone-mapping parity: the original never sets a tone mapping (three.js default
 *   NoToneMapping); fiber's Canvas defaults to ACESFilmic, so the port pins
 *   `renderer={{ toneMapping: NoToneMapping }}`
 *
 * DIVERGENCE from original
 * - DemoHelpers grid disabled (`grid={false}`): an abstract sphere field floating in
 *   black space — the original has no ground plane and the corpus grid is unit-scale,
 *   invisible against a ±1400-unit scene
 * - The original's `renderer.inspector.createParameters` panel is replaced with leva
 *   controls (focus distance / focal length / bokeh scale) — same parameters, same ranges
 * - `scenePass.getTextureNode().toInspector('Color')` tag dropped — this repo doesn't
 *   wire the three.js Inspector
 * - OrbitControls replaced by the DemoHelpers camera-controls baseline (damping is the
 *   baseline behavior there too)
 */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useRenderPipeline } from '@react-three/fiber/webgpu'
import { useCubeTexture } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js'
import { cubeTexture, oscSine, positionWorld, time, uniform } from 'three/tsl'
import { Matrix4, NoToneMapping } from 'three/webgpu'
import type { InstancedMesh, UniformNode } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const CUBE_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/cube/SwedishRoyalCastle/'
const CUBE_FILES = ['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg']

const XGRID = 14
const YGRID = 9
const ZGRID = 14
const COUNT = XGRID * YGRID * ZGRID
const SPACING = 200
const SCENE_DISTANCE = 1000 // divisor for the world-space brightness wave

function SphereField() {
  const textureCube = useCubeTexture(CUBE_FILES, { path: CUBE_PATH })
  const meshRef = useRef<InstancedMesh>(null)

  // Brightness pulses as a wave through world space: oscSine over
  // positionWorld/SCENE_DISTANCE, drifting with the TSL `time` built-in.
  const colorNode = useMemo(
    () => cubeTexture(textureCube).mul(oscSine(positionWorld.div(SCENE_DISTANCE).add(time.mul(0.2)))),
    [textureCube],
  )

  // Static instance grid — imperative setup that must precede the first render
  // (bounding-sphere computation reads the matrices), so useLayoutEffect.
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const matrix = new Matrix4()
    let index = 0
    for (let i = 0; i < XGRID; i++) {
      for (let j = 0; j < YGRID; j++) {
        for (let k = 0; k < ZGRID; k++) {
          const x = SPACING * (i - XGRID / 2)
          const y = SPACING * (j - YGRID / 2)
          const z = SPACING * (k - ZGRID / 2)
          mesh.setMatrixAt(index, matrix.identity().setPosition(x, y, z))
          index++
        }
      }
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
      <sphereGeometry args={[60, 20, 10]} />
      <meshBasicNodeMaterial colorNode={colorNode} />
    </instancedMesh>
  )
}

interface PostFXProps {
  focusDistance: number
  focalLength: number
  bokehScale: number
}

// DoF over the scene pass. `dof()` has no uniform()-backed knob fields of its own
// (numbers become constant nodes), so — like the original — the uniforms are created
// here, fed into the pass, registered by returning them, and mutated in the effect.
function PostFX({ focusDistance, focalLength, bokehScale }: PostFXProps) {
  const { passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    if (!renderPipeline) return

    const scenePassColor = passes.scenePass.getTextureNode()
    const scenePassViewZ = passes.scenePass.getViewZNode()

    // Initial values come from the closure ONCE (pipeline callbacks never re-run on
    // re-render); every later change flows through the registered uniforms below.
    const uFocusDistance = uniform(focusDistance)
    const uFocalLength = uniform(focalLength)
    const uBokehScale = uniform(bokehScale)

    const dofPass = dof(scenePassColor, scenePassViewZ, uFocusDistance, uFocalLength, uBokehScale)
    renderPipeline.outputNode = dofPass

    return { dofPass, uFocusDistance, uFocalLength, uBokehScale }
  })

  useEffect(() => {
    // Only `.value` is touched, so the node-type param can stay unknown.
    const uFocusDistance = passes.uFocusDistance as UniformNode<unknown, number> | undefined
    const uFocalLength = passes.uFocalLength as UniformNode<unknown, number> | undefined
    const uBokehScale = passes.uBokehScale as UniformNode<unknown, number> | undefined
    if (!uFocusDistance || !uFocalLength || !uBokehScale) return
    uFocusDistance.value = focusDistance
    uFocalLength.value = focalLength
    uBokehScale.value = bokehScale
  }, [passes, focusDistance, focalLength, bokehScale])

  return null
}

export default function PostprocessingDof() {
  const { focusDistance, focalLength, bokehScale } = useControls('postprocessing-dof', {
    focusDistance: { value: 500, min: 10, max: 3000, step: 1 },
    focalLength: { value: 200, min: 50, max: 750, step: 1 },
    bokehScale: { value: 10, min: 1, max: 20, step: 0.1 },
  })

  return (
    <Canvas
      // Original sets no tone mapping (three.js default NoToneMapping) — see header.
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [0, 0, 200], fov: 70, near: 1, far: 3500 }}
    >
      <Suspense fallback={null}>
        <SphereField />
      </Suspense>
      <PostFX focusDistance={focusDistance} focalLength={focalLength} bokehScale={bokehScale} />
      <DemoHelpers grid={false} />
    </Canvas>
  )
}
