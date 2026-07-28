/**
 * postprocessing-bloom-selective
 * R3F port of three.js `webgpu_postprocessing_bloom_selective`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_bloom_selective (~130 lines of JS)
 *
 * DEMONSTRATES
 * - Per-OBJECT MRT selectivity: each sphere's OWN `<meshBasicNodeMaterial mrtNode={…}>`
 *   overrides the scene pass's default `bloomIntensity` output — a material-level knob,
 *   not a channel baked into the shading (contrast `postprocessing-bloom-emissive`'s
 *   MRT-from-material-property approach). `mrtNode` is typed on `NodeMaterial` in
 *   `@types/three` (no cast needed) and is read at shader-build time, so it's set as a
 *   plain JSX prop rather than mutated in an effect
 * - Click-to-toggle bloom membership PER SPHERE: each sphere owns a live `uniform()`
 *   feeding its `mrtNode`'s `bloomIntensity` channel, flipped directly in the mesh's
 *   own `onClick` handler — fiber's declarative pointer events replace the original's
 *   manual `Raycaster`/`pointerdown` listener entirely, no imperative picking code
 * - `renderPipeline.outputColorTransform = false` + `.renderOutput()` on the final
 *   node: the pipeline's automatic tone-map/color-space pass is disabled so the
 *   bloom-composited result can apply it manually as the LAST step (matches the
 *   original's explicit `renderOutput()` call)
 *
 * DIVERGENCE from original
 * - The original raycasts on `pointerdown` against all 50 spheres and flips ONE
 *   material's `mrtNode.get('bloomIntensity')` uniform; the port gives each sphere
 *   its own JSX `onClick` handler with the same toggle logic — same behavior,
 *   idiomatic R3F picking instead of a manual raycaster
 * - `renderer.inspector.createParameters` dat.gui panel replaced by leva controls
 *   (bloom threshold/strength/radius, tone-mapping exposure)
 * - `scenePass.getTextureNode(...).toInspector(...)` tags dropped — no Inspector slot
 *   wired yet
 * - DemoHelpers baseline (grid + camera-controls) added; original had a fixed
 *   `OrbitControls`. Grid disabled — the sphere cloud floats in black space
 * - Static-by-design (`"static": true` in the manifest), matching the original:
 *   sphere positions/colors are fixed at mount, nothing is time-driven, motion only
 *   comes from user orbit input
 */
import { useEffect, useMemo } from 'react'
import { Canvas, useRenderPipeline, useThree } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { float, mrt, output, uniform } from 'three/tsl'
import { Color, NeutralToneMapping } from 'three/webgpu'
import type { UniformNode } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

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
        const position = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5] as [
          number,
          number,
          number,
        ]
        const len = Math.hypot(...position) || 1
        const dist = Math.random() * 4.0 + 2.0
        return {
          key: i,
          color,
          position: [
            (position[0] / len) * dist,
            (position[1] / len) * dist,
            (position[2] / len) * dist,
          ] as [number, number, number],
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
          }}
        >
          <icosahedronGeometry args={[1, 15]} />
          {/* mrtNode is typed on NodeMaterial (@types/three) — plain JSX prop, applied
              before the material's first shader build. */}
          <meshBasicNodeMaterial
            color={sphere.color}
            mrtNode={mrt({ bloomIntensity: sphere.uBloomIntensity })}
          />
        </mesh>
      ))}
    </>
  )
}

// renderer.toneMappingExposure imperatively — a WebGPURenderer property, not a TSL
// uniform.
function ToneMappingExposure({ exposure }: { exposure: number }) {
  const renderer = useThree((s) => s.renderer)

  useEffect(() => {
    renderer.toneMappingExposure = exposure
  }, [renderer, exposure])

  return null
}

interface PostFXProps {
  threshold: number
  strength: number
  radius: number
}

// The default scene-pass `bloomIntensity` output starts at 0 (nothing blooms) — each
// sphere's own `mrtNode` (set above) overrides it per object. Multiplying scene color
// by that mask before feeding `bloom()` isolates exactly the tagged spheres.
function PostFX({ threshold, strength, radius }: PostFXProps) {
  const { passes } = useRenderPipeline(
    ({ renderPipeline, passes }) => {
      if (!renderPipeline) return

      const outputPass = passes.scenePass.getTextureNode()
      const bloomIntensityPass = passes.scenePass.getTextureNode('bloomIntensity')
      const bloomPass = bloom(outputPass.mul(bloomIntensityPass))

      // The original disables the pipeline's automatic output color transform so it
      // can apply `renderOutput()` itself as the final step of the composited node.
      renderPipeline.outputColorTransform = false
      renderPipeline.outputNode = outputPass.add(bloomPass).renderOutput()

      return { bloomPass }
    },
    ({ passes }) => {
      passes.scenePass.setMRT(mrt({ output, bloomIntensity: float(0) }))
    },
  )

  useEffect(() => {
    const bloomPass = passes.bloomPass as ReturnType<typeof bloom> | undefined
    if (!bloomPass) return
    bloomPass.threshold.value = threshold
    bloomPass.strength.value = strength
    bloomPass.radius.value = radius
  }, [passes, threshold, strength, radius])

  return null
}

export default function PostprocessingBloomSelective() {
  const spheres = useSpheres()

  const { threshold, strength, radius, exposure } = useControls('postprocessing-bloom-selective', {
    threshold: { value: 0, min: 0, max: 1, step: 0.01 },
    strength: { value: 1, min: 0, max: 3, step: 0.01 },
    radius: { value: 0, min: 0, max: 1, step: 0.01 },
    exposure: { value: 1, min: 0.1, max: 3, step: 0.01 },
  })

  return (
    <Canvas
      // Original sets NeutralToneMapping explicitly (not fiber's ACESFilmic default).
      renderer={{ toneMapping: NeutralToneMapping }}
      camera={{ position: [0, 0, 20], fov: 40, near: 1, far: 200 }}
    >
      <SphereCloud spheres={spheres} />
      <PostFX threshold={threshold} strength={strength} radius={radius} />
      <ToneMappingExposure exposure={exposure} />
      <DemoHelpers grid={false} minDistance={1} maxDistance={100} maxPolarAngle={Math.PI * 0.5} />
    </Canvas>
  )
}
