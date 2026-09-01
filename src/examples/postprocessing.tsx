/**
 * postprocessing
 * R3F port of three.js `webgpu_postprocessing`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing (~95 lines of JS)
 *
 * DEMONSTRATES
 * - Chaining TSL display passes in `useRenderPipeline`: scene pass → `dotScreen()` →
 *   `rgbShift()`, with the last node in the chain assigned to
 *   `renderPipeline.outputNode` — the canonical multi-effect pipeline shape
 * - `useUniforms` feeding live Leva values directly into addon pass fields:
 *   `scale`/`angle` on dotScreen and `amount`/`angle` on rgbShift — the graph builds
 *   once with no synchronization effect or pipeline rebuild
 * - Declarative scene fog (`<fog attach="fog">`) auto-wrapped into a fog node by the
 *   WebGPU renderer, composing with the post-processing chain
 * - drei's declarative `Instances`/`Instance`: 100 sphere transforms stay React
 *   objects (each `<Instance>` is a `PositionMesh` proxy) while rendering in ONE
 *   instanced draw call — the whole field still tumbles as a single parent `<group>`,
 *   since drei re-derives each instance matrix from `matrixWorld` relative to the
 *   `InstancedMesh`'s own world matrix
 *
 * DIVERGENCE from original
 * - The original hard-codes dotScreen scale 0.3 and rgbShift amount 0.001 with no
 *   GUI — all four pass uniforms (dot scale/angle, shift amount/angle) are exposed
 *   as leva sliders here, defaults matching the original's values
 * - The original's 100 per-object `Mesh`es (shared geometry + material) are rendered
 *   through drei `Instances`/`Instance` proxies instead — same transforms, one draw
 *   call; the classic `MeshPhongMaterial` becomes `<meshPhongNodeMaterial>`
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
import { useMemo, useRef } from 'react'
import { Canvas, useFrame, useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu'
import { Instance, Instances } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { dotScreen } from 'three/addons/tsl/display/DotScreenNode.js'
import { rgbShift } from 'three/addons/tsl/display/RGBShiftNode.js'
import { Group, NoToneMapping, Vector3 } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

// 100 low-poly spheres scattered on random rays from the origin, slowly tumbling as
// one group — the sole subject the post chain gets to distort. One instanced draw
// call; the transforms are static, only the parent group rotates.

function SphereField({ count = 100 }: { count?: number }) {
  const groupRef = useRef<Group>(null)

  const spheres = useMemo(
    () =>
      Array.from({ length: count }, () => ({
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
    [count],
  )

  useFrame(({ delta}) => {
    const group = groupRef.current
    if (!group) return
    group.rotation.x += 0.3 * delta
    group.rotation.y += 0.6 * delta
  })

  return (
    <group ref={groupRef}>
      <Instances limit={count}>
        <sphereGeometry args={[1, 4, 4]} />
        <meshPhongNodeMaterial color="#ffffff" flatShading />
        {spheres.map((sphere, i) => (
          <Instance
            key={i}
            position={sphere.position}
            rotation={sphere.rotation}
            scale={sphere.scale}
          />
        ))}
      </Instances>
    </group>
  )
}

// Scene color → dot-screen halftone → RGB channel shift. Fiber uniforms replace the
// addon's constructor-created uniforms before the graph builds.
function PostFX() {
  //* Controls =====================================================
  const values = useControls('postprocessing', {
    dotScale: { value: 0.3, min: 0.05, max: 1, step: 0.01 },
    dotAngle: { value: 1.57, min: 0, max: Math.PI, step: 0.01 },
    shiftAmount: { value: 0.001, min: 0, max: 0.02, step: 0.0005 },
    shiftAngle: { value: 0, min: 0, max: Math.PI * 2, step: 0.01 },
  })
  const uniforms = useUniforms(values, 'postprocessing')

  //* Render Pipeline ==============================================
  useRenderPipeline(({ renderPipeline, passes }) => {
    const scenePassColor = passes.scenePass.getTextureNode()
    const dotScreenPass = dotScreen(scenePassColor)
    dotScreenPass.scale = uniforms.dotScale
    dotScreenPass.angle = uniforms.dotAngle

    const rgbShiftPass = rgbShift(dotScreenPass)
    rgbShiftPass.amount = uniforms.shiftAmount
    rgbShiftPass.angle = uniforms.shiftAngle

    renderPipeline.outputNode = rgbShiftPass
  })

  return null
}

export default function Postprocessing() {
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
      <PostFX />
      <DemoHelpers grid={false} maxDistance={900} />
    </Canvas>
  )
}
