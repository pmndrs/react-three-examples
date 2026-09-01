/**
 * tsl-halftone
 * R3F port of three.js `webgpu_tsl_halftone`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_tsl_halftone (~277 lines of JS)
 *
 * DEMONSTRATES
 * - A reusable TSL graph helper (`halftone`, in halftoneEffect.ts) implementing a
 *   screen-space halftone dot grid gated by how much the surface normal faces a light
 *   `direction`, composed inside one `Fn` over each material's `output` node
 * - `NodeMaterial.outputNode` overriding a standard PBR shading result (`output`)
 *   directly on the material — a full-scene effect with no `useRenderPipeline` pass,
 *   since it only needs the current fragment's own shaded color, not neighboring texels
 * - fiber's `useUniforms` batch hook feeding two independently-configured halftone
 *   layers live from leva, with `useNodes` creating one shared output graph so a leva
 *   tweak only mutates GPU-side uniform values
 * - One layer's dot-grid direction animated every frame directly on the uniform's
 *   `.value` (`state.elapsed`-driven), independent of React re-renders — the
 *   build-time-vs-run-time TSL split in practice
 * - The same halftone output graph shared by three different materials (two primitives
 *   plus every mesh material inside a loaded GLTF), showing that the effect composes
 *   with each material's existing PBR shading instead of replacing it
 *
 * DIVERGENCE from original
 * - dat.gui + `renderer.inspector` replaced with leva; the two dot layers get their own
 *   leva groups (`tsl-halftone-purple` / `tsl-halftone-cyan`) instead of dat.gui
 *   subfolders keyed by array index
 * - The cyan layer's animated x/y direction components aren't exposed as leva sliders
 *   (a per-frame write overwrites them anyway); only its z component and the rest of its
 *   parameters are controllable — same live values as the original's `.listen()` fields,
 *   minus a pointless editable-yet-overwritten control
 * - `outputNode` is assigned declaratively for the two primitives instead of the
 *   original's one-shot imperative assignment at init; the GLTF meshes still get it
 *   imperatively in an effect since that mesh list is only known once the model loads
 * - DemoHelpers baseline (grid + camera-controls orbit, distance-limited to match the
 *   original's OrbitControls `minDistance`/`maxDistance`) added; the original is a fixed
 *   black void with no ground reference
 * - `THREE.Timer` dropped — `useFrame`'s `state.elapsed` (seconds) drives the animated
 *   direction instead
 * - Split into a folder (this file + halftoneEffect.ts + HalftonePrimitives.tsx +
 *   HalftoneMichelle.tsx): the single-file port ran ~260 lines, over the corpus's
 *   ~200-line threshold — split by TSL graph / primitive shapes / loaded model
 */
import { Suspense } from 'react'
import { Vector3 } from 'three/webgpu'
import { Canvas, useFrame, useNodes, useUniforms } from '@react-three/fiber/webgpu'
import { folder, useControls } from 'leva'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { createHalftoneOutput } from './halftoneEffect'
import { HalftoneMichelle } from './HalftoneMichelle'
import { HalftonePrimitives } from './HalftonePrimitives'

function HalftoneContent() {
  //* Controls =====================================================
  const { ambientIntensity, directionalIntensity } = useControls('tsl-halftone', {
    lights: folder({
      ambientIntensity: { value: 3, min: 0, max: 10, step: 0.001 },
      directionalIntensity: { value: 8, min: 0, max: 20, step: 0.001 },
    }),
  })

  const { direction: purpleDirection, ...purpleValues } = useControls('tsl-halftone-purple', {
    count: { value: 140, min: 1, max: 200, step: 1 },
    color: '#fb00ff',
    direction: { value: { x: -0.4, y: -1, z: 0.5 }, step: 0.01 },
    start: { value: 1, min: -1, max: 1, step: 0.01 },
    end: { value: 0, min: -1, max: 1, step: 0.01 },
    mixLow: { value: 0, min: 0, max: 1, step: 0.01 },
    mixHigh: { value: 0.5, min: 0, max: 1, step: 0.01 },
    radius: { value: 0.8, min: 0, max: 1, step: 0.01 },
  })

  const { directionZ, ...cyanValues } = useControls('tsl-halftone-cyan', {
    count: { value: 180, min: 1, max: 200, step: 1 },
    color: '#94ffd1',
    directionZ: { value: -0.2, min: -1, max: 1, step: 0.01, label: 'direction z' },
    start: { value: 0.55, min: -1, max: 1, step: 0.01 },
    end: { value: 0.2, min: -1, max: 1, step: 0.01 },
    mixLow: { value: 0.5, min: 0, max: 1, step: 0.01 },
    mixHigh: { value: 1, min: 0, max: 1, step: 0.01 },
    radius: { value: 0.8, min: 0, max: 1, step: 0.01 },
  })

  //* Uniforms =====================================================
  const purple = useUniforms(
    {
      ...purpleValues,
      direction: new Vector3(purpleDirection.x, purpleDirection.y, purpleDirection.z),
    },
    'halftonePurple',
  )
  const cyan = useUniforms(
    {
      ...cyanValues,
      // x/y are animated every frame; z remains controlled by Leva.
      direction: new Vector3(0.5, 0.5, directionZ),
    },
    'halftoneCyan',
  )

  useFrame(({ elapsed }) => {
    cyan.direction.value.x = Math.cos(elapsed)
    cyan.direction.value.y = Math.sin(elapsed)
  })

  //* TSL Graph ====================================================
  const { halftoneOutput } = useNodes(() => ({
    halftoneOutput: createHalftoneOutput([purple, cyan]),
  }))

  return (
    <>
      <ambientLight intensity={ambientIntensity} />
      <directionalLight intensity={directionalIntensity} position={[4, 3, 1]} />
      <HalftonePrimitives outputNode={halftoneOutput} />
      <Suspense fallback={null}>
        <HalftoneMichelle outputNode={halftoneOutput} />
      </Suspense>
    </>
  )
}

export default function TslHalftone() {
  return (
    <Canvas renderer background="#000000" camera={{ position: [6, 3, 10], fov: 25, near: 0.1, far: 100 }}>
      <HalftoneContent />
      <DemoHelpers minDistance={0.1} maxDistance={50} gridOffset={-2} />
    </Canvas>
  )
}
