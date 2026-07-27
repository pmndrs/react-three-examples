/**
 * postprocessing
 * R3F port of three.js `webgpu_postprocessing`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing (~95 lines of JS)
 *
 * DEMONSTRATES
 * - Chaining TSL display passes in `useRenderPipeline`: scene pass → `dotScreen()` →
 *   `rgbShift()`, with the last node in the chain assigned to
 *   `renderPipeline.outputNode` — the canonical multi-effect pipeline shape
 * - The pass-owned-uniform dynamism pattern: both addon nodes carry their OWN
 *   `uniform()`-backed knobs (`scale`/`angle` on dotScreen, `amount`/`angle` on
 *   rgbShift) — return them from the mainCB to register on `passes`, then mutate
 *   `.value` in an effect on leva changes; no `rebuild()`, no fiber `useUniforms`
 * - Declarative scene fog (`<fog attach="fog">`) auto-wrapped into a fog node by the
 *   WebGPU renderer, composing with the post-processing chain
 * - Shared geometry/material across 100 JSX meshes via `useMemo` (one draw setup,
 *   many transforms)
 *
 * DIVERGENCE from original
 * - The original hard-codes dotScreen scale 0.3 and rgbShift amount 0.001 with no
 *   GUI — all four pass uniforms (dot scale/angle, shift amount/angle) are exposed
 *   as leva sliders here, defaults matching the original's values
 * - The original has no camera controls; DemoHelpers CameraControls added (dolly
 *   capped at 900, inside the fog/far range). Grid disabled — the sphere field
 *   floats in black fogged space, the original has no ground plane
 * - Object rotation is delta-scaled (0.3 / 0.6 rad/s ≈ the original's 0.005 / 0.01
 *   rad-per-frame at 60 fps) instead of frame-rate-dependent increments
 * - `renderer={{ toneMapping: NoToneMapping }}` set explicitly: the original renders
 *   with the WebGPURenderer default (NoToneMapping); fiber's Canvas would otherwise
 *   default to ACESFilmic and mute the white phong highlights
 * - `.toInspector('Scene Color')` tag and `renderer.inspector` dropped — this repo
 *   doesn't wire the three.js Inspector yet (same as postprocessing-bloom-emissive)
 */
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useRenderPipeline } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { dotScreen } from 'three/addons/tsl/display/DotScreenNode.js'
import { rgbShift } from 'three/addons/tsl/display/RGBShiftNode.js'
import { Group, MeshPhongMaterial, NoToneMapping, SphereGeometry, Vector3 } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

// 100 low-poly spheres scattered on random rays from the origin, slowly tumbling as
// one group — the sole subject the post chain gets to distort.
function SphereField() {
  const groupRef = useRef<Group>(null)

  const geometry = useMemo(() => new SphereGeometry(1, 4, 4), [])
  const material = useMemo(() => new MeshPhongMaterial({ color: 0xffffff, flatShading: true }), [])
  const spheres = useMemo(
    () =>
      Array.from({ length: 100 }, () => ({
        position: new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
          .normalize()
          .multiplyScalar(Math.random() * 400),
        rotation: [Math.random() * 2, Math.random() * 2, Math.random() * 2] as [
          number,
          number,
          number,
        ],
        scale: Math.random() * 50,
      })),
    [],
  )

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return
    group.rotation.x += 0.3 * delta
    group.rotation.y += 0.6 * delta
  })

  return (
    <group ref={groupRef}>
      {spheres.map((sphere, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={material}
          position={sphere.position}
          rotation={sphere.rotation}
          scale={sphere.scale}
        />
      ))}
    </group>
  )
}

interface PostFXProps {
  dotScale: number
  dotAngle: number
  shiftAmount: number
  shiftAngle: number
}

// Scene color → dot-screen halftone → RGB channel shift. Both effect nodes expose
// their knobs as uniform()-backed fields, so leva changes mutate `.value` directly —
// the pipeline is built once and never rebuilt.
function PostFX({ dotScale, dotAngle, shiftAmount, shiftAngle }: PostFXProps) {
  const { passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    if (!renderPipeline) return

    const scenePassColor = passes.scenePass.getTextureNode()
    const dotScreenPass = dotScreen(scenePassColor, dotAngle, dotScale)
    const rgbShiftPass = rgbShift(dotScreenPass, shiftAmount, shiftAngle)
    renderPipeline.outputNode = rgbShiftPass

    // Return to register — makes both passes available on `passes` for the effect
    // below to mutate their uniforms without a pipeline rebuild.
    return { dotScreenPass, rgbShiftPass }
  })

  useEffect(() => {
    const dotScreenPass = passes.dotScreenPass as ReturnType<typeof dotScreen> | undefined
    const rgbShiftPass = passes.rgbShiftPass as ReturnType<typeof rgbShift> | undefined
    if (!dotScreenPass || !rgbShiftPass) return
    dotScreenPass.scale.value = dotScale
    dotScreenPass.angle.value = dotAngle
    rgbShiftPass.amount.value = shiftAmount
    rgbShiftPass.angle.value = shiftAngle
  }, [passes, dotScale, dotAngle, shiftAmount, shiftAngle])

  return null
}

export default function Postprocessing() {
  const { dotScale, dotAngle, shiftAmount, shiftAngle } = useControls('postprocessing', {
    dotScale: { value: 0.3, min: 0.05, max: 1, step: 0.01 },
    dotAngle: { value: 1.57, min: 0, max: Math.PI, step: 0.01 },
    shiftAmount: { value: 0.001, min: 0, max: 0.02, step: 0.0005 },
    shiftAngle: { value: 0, min: 0, max: Math.PI * 2, step: 0.01 },
  })

  return (
    <Canvas
      // Original renders with the WebGPURenderer default tone mapping (none) —
      // match it explicitly; fiber's Canvas default is ACESFilmic.
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 0, 400], fov: 70, near: 1, far: 1000 }}
    >
      <fog attach="fog" args={['#000000', 1, 1000]} />
      <ambientLight color="#cccccc" />
      <directionalLight color="#ffffff" intensity={3} position={[1, 1, 1]} />
      <SphereField />
      <PostFX
        dotScale={dotScale}
        dotAngle={dotAngle}
        shiftAmount={shiftAmount}
        shiftAngle={shiftAngle}
      />
      <DemoHelpers grid={false} maxDistance={900} />
    </Canvas>
  )
}
