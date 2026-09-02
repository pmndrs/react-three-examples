/**
 * postprocessing-bloom-selective
 * 50 dim icosahedra, half of them randomly tagged to glow. Click any sphere to flip
 * its own bloom membership.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_bloom_selective
 *
 * DEMONSTRATES
 * - Per-object MRT selectivity: each sphere's own `<meshBasicNodeMaterial mrtNode={…}>`
 *   overrides the scene pass's `bloomIntensity` output — a material-level knob, not a
 *   channel baked into shading (contrast `postprocessing-bloom-emissive`'s approach)
 * - Click-to-toggle per sphere: each mesh owns a live `uniform()` flipped in its own
 *   `onClick` — declarative pointer events replace the original's manual `Raycaster`
 * - `useUniforms` feeding `bloom()`'s writable fields directly, assigned before the
 *   pipeline compiles — no synchronization effect
 * - `outputColorTransform = false` + `.renderOutput()` on the final node: the
 *   pipeline's automatic tone-map/color-space pass is disabled so the composited
 *   bloom result can apply it manually as the LAST step, matching the original
 */
import { useEffect, useMemo } from 'react'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { float, mrt, output, uniform } from 'three/tsl'
import { Color, NeutralToneMapping } from 'three/webgpu'
import type { UniformNode } from 'three/webgpu'
import { Canvas, useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'

import { DemoHelpers } from '../../utils/DemoHelpers'

//* Scene =========================================================

const SPHERE_COUNT = 50

interface SphereData {
  key: number
  color: Color
  position: [number, number, number]
  scale: number
  uBloomIntensity: UniformNode<'float', number>
}

// 50 icosahedra with random dim HSL colors, half tagged for bloom at mount — mirrors
// the original's `Math.random() > 0.5 ? 1 : 0` coin flip. Each sphere's own uniform
// feeds its own `mrtNode` below, so clicking one never touches the others.
function useSpheres(): SphereData[] {
  return useMemo(
    () =>
      Array.from({ length: SPHERE_COUNT }, (_, i) => {
        const color = new Color().setHSL(Math.random(), 0.7, Math.random() * 0.2 + 0.05)
        const position = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5] as [number, number, number]
        const len = Math.hypot(...position) || 1
        const dist = Math.random() * 4.0 + 2.0
        return {
          key: i,
          color,
          position: [(position[0] / len) * dist, (position[1] / len) * dist, (position[2] / len) * dist] as [
            number,
            number,
            number,
          ],
          scale: Math.random() * Math.random() + 0.5,
          uBloomIntensity: uniform(Math.random() > 0.5 ? 1 : 0),
        }
      }),
    [],
  )
}

function SphereCloud({ spheres }: { spheres: SphereData[] }) {
  return (
    <>
      {spheres.map((sphere) => (
        <mesh
          key={sphere.key}
          position={sphere.position}
          scale={sphere.scale}
          onClick={(e) => {
            e.stopPropagation()
            sphere.uBloomIntensity.value = sphere.uBloomIntensity.value === 0 ? 1 : 0
          }}>
          <icosahedronGeometry args={[1, 15]} />
          {/* mrtNode is typed on NodeMaterial (@types/three) — plain JSX prop, applied
              before the material's first shader build. */}
          <meshBasicNodeMaterial color={sphere.color} mrtNode={mrt({ bloomIntensity: sphere.uBloomIntensity })} />
        </mesh>
      ))}
    </>
  )
}

//* Post-processing ===============================================

// The default scene-pass `bloomIntensity` output starts at 0 (nothing blooms) — each
// sphere's own `mrtNode` (set above) overrides it per object. Multiplying scene color
// by that mask before feeding `bloom()` isolates exactly the tagged spheres.
function PostFX() {
  const { exposure, ...bloomValues } = useControls('Bloom', {
    threshold: { value: 0, min: 0, max: 1, step: 0.01 },
    strength: { value: 1, min: 0, max: 3, step: 0.01 },
    radius: { value: 0, min: 0, max: 1, step: 0.01 },
    exposure: { value: 1, min: 0.1, max: 3, step: 0.01 },
  })
  const uniforms = useUniforms(bloomValues)
  const renderer = useThree((state) => state.renderer)

  useRenderPipeline(
    ({ renderPipeline, passes }) => {
      const outputPass = passes.scenePass.getTextureNode()
      const bloomIntensityPass = passes.scenePass.getTextureNode('bloomIntensity')
      const bloomPass = bloom(outputPass.mul(bloomIntensityPass))
      bloomPass.threshold = uniforms.threshold
      bloomPass.strength = uniforms.strength
      bloomPass.radius = uniforms.radius

      // The original disables the pipeline's automatic output color transform so it
      // can apply `renderOutput()` itself as the final step of the composited node.
      renderPipeline.outputColorTransform = false
      renderPipeline.outputNode = outputPass.add(bloomPass).renderOutput()
    },
    ({ passes }) => {
      passes.scenePass.setMRT(mrt({ output, bloomIntensity: float(0) }))
    },
  )

  // Exposure is a renderer property, not a node — no place in the graph.
  useEffect(() => {
    renderer.toneMappingExposure = exposure
  }, [renderer, exposure])

  return null
}

export default function PostprocessingBloomSelective() {
  const spheres = useSpheres()

  return (
    <Canvas
      // Original sets NeutralToneMapping explicitly (not fiber's ACESFilmic default).
      renderer={{ toneMapping: NeutralToneMapping }}
      camera={{ position: [0, 0, 20], fov: 40, near: 1, far: 200 }}>
      <SphereCloud spheres={spheres} />
      <PostFX />
      <DemoHelpers grid={false} minDistance={1} maxDistance={100} maxPolarAngle={Math.PI * 0.5} />
    </Canvas>
  )
}
