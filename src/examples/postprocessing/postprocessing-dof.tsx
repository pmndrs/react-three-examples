/**
 * postprocessing-dof
 * A grid of 1764 pulsing spheres brought in and out of focus by a real
 * depth-of-field pass, driven by per-pixel scene depth rather than a fixed blur.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_dof
 *
 * DEMONSTRATES
 * - `dof()` as the pipeline `outputNode`, fed by the scene pass's color AND its
 *   `getViewZNode()` — a post effect that consumes per-pixel depth, not just color
 * - Driving `dof()`'s own `focusDistanceNode`/`focalLengthNode`/`bokehScaleNode`
 *   fields from leva by assigning `useUniforms` nodes onto them — the pipeline
 *   callback runs ONCE, so a closed-over prop would freeze at its first value
 * - A static `<instancedMesh>` grid, matrices set once in `useLayoutEffect` before
 *   the first render computes the bounding sphere
 * - A TSL `colorNode` mixing a cube texture with `oscSine(positionWorld + time)` — a
 *   brightness wave traveling through world space, built once and attached via JSX
 */
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { cubeTexture, oscSine, positionWorld, time } from 'three/tsl'
import { Matrix4, NoToneMapping } from 'three/webgpu'
import type { InstancedMesh } from 'three/webgpu'
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js'
import { Canvas, useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu'
import { useCubeTexture } from '@react-three/drei/webgpu'
import { useControls } from 'leva'

import { DemoHelpers } from '../../utils/DemoHelpers'

const CUBE_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/cube/SwedishRoyalCastle/'
const CUBE_FILES = ['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg']

const XGRID = 14
const YGRID = 9
const ZGRID = 14
const COUNT = XGRID * YGRID * ZGRID
const SPACING = 200
const SCENE_DISTANCE = 1000 // divisor for the world-space brightness wave

//* Scene =========================================================

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

//* Post-processing ===============================================

function PostFX() {
  const controls = useControls('DoF', {
    focusDistance: { value: 500, min: 10, max: 3000, step: 1 },
    focalLength: { value: 200, min: 50, max: 750, step: 1 },
    bokehScale: { value: 10, min: 1, max: 20, step: 0.1 },
  })
  const uniforms = useUniforms(controls)

  useRenderPipeline(({ renderPipeline, passes }) => {
    const scenePassColor = passes.scenePass.getTextureNode()
    const scenePassViewZ = passes.scenePass.getViewZNode()
    const dofPass = dof(scenePassColor, scenePassViewZ)
    // dof() builds its own focus/focal/bokeh nodes; swap ours in before the shader
    // compiles, same pattern as bloom() (see postprocessing-bloom).
    dofPass.focusDistanceNode = uniforms.focusDistance
    dofPass.focalLengthNode = uniforms.focalLength
    dofPass.bokehScaleNode = uniforms.bokehScale
    renderPipeline.outputNode = dofPass
  })

  return null
}

export default function PostprocessingDof() {
  return (
    <Canvas
      // Original sets no tone mapping (three.js default); fiber would default to ACES.
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [0, 0, 200], fov: 70, near: 1, far: 3500 }}
    >
      <Suspense fallback={null}>
        <SphereField />
      </Suspense>
      <PostFX />
      <DemoHelpers grid={false} />
    </Canvas>
  )
}
