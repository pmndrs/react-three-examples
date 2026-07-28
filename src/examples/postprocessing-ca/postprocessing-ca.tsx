/**
 * postprocessing-ca
 * R3F port of three.js `webgpu_postprocessing_ca`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_ca (~340 lines of JS)
 *
 * DEMONSTRATES
 * - `chromaticAberration()`'s uniform contract, DIFFERENT from `dotScreen()`/
 *   `rgbShift()` in `postprocessing`: the addon wraps plain numbers in constant
 *   nodes rather than exposing its own `uniform()`-backed fields, so — pattern (c) —
 *   the caller creates three/tsl `uniform()` nodes and passes THEM in
 *   (`CAPipeline.tsx`), exactly what the original does with its `staticStrength` /
 *   `staticCenter` / `staticScale` uniforms
 * - The same `outputColorTransform = false` + manual `renderOutput()` shape as
 *   `postprocessing-fxaa` (chromatic aberration also wants sRGB, tone-mapped input)
 * - RoomEnvironment PMREM lighting on standard materials, `CameraControls`
 *   `autoRotate` driving a slow orbit (same imperative-escape-hatch / OrbitControls-
 *   parity patterns as `postprocessing-ao` and the `loader-gltf-*` cluster)
 * - A procedural JSX gallery scene (`Shapes.tsx`): a shared pool of 8 geometries/
 *   materials reused across a central torus + 6 inner + 12 outer shapes + a 200-point
 *   shell, animated by walking `<group>` refs' children in `useFrame` — same
 *   escape-hatch shape as `postprocessing`'s `SphereField`
 *
 * DIVERGENCE from original
 * - The original's animation loop has a latent bug: its
 *   `if (child.children.length > 0) { … } else if (child.type === 'Group') { … }`
 *   branch pair never reaches the second branch (every top-level child already has
 *   `children.length > 0`), so the "outer group" bobbing/tumbling code is dead code.
 *   This port keeps the actual EFFECTIVE behavior (every group's Y rotates at the
 *   same rate, every mesh child spins on X/Z) instead of reproducing unreachable code
 * - The original's `createShapes()` imperative loops become `useMemo`-built position/
 *   geometry-index arrays rendered as JSX — same declarative-first split used
 *   throughout this corpus
 * - `renderer.inspector.createParameters` panel replaced by leva controls (enabled,
 *   animated, strength, center X/Y, scale, autoRotate) — same knobs, same ranges
 * - OrbitControls replaced by the DemoHelpers camera-controls baseline (same target,
 *   damping, and `autoRotateSpeed = -0.1`)
 */
import { useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { NoToneMapping, PMREMGenerator } from 'three/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { CAPipeline } from './CAPipeline'
import { Shapes } from './Shapes'

// RoomEnvironment PMREM lighting — same imperative escape-hatch pattern as
// postprocessing-ao's RoomEnv and postprocessing-sobel's RoomEnv.
function RoomEnv() {
  const rawRenderer = useThree((s) => s.renderer)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const renderer = rawRenderer as WebGPURenderer // UPSTREAM B9
    const environment = new RoomEnvironment()
    const pmremGenerator = new PMREMGenerator(renderer)
    const envRT = pmremGenerator.fromScene(environment, 0.04)
    scene.environment = envRT.texture
    environment.dispose()
    pmremGenerator.dispose()
    return () => {
      scene.environment = null
      envRT.dispose()
    }
  }, [rawRenderer, scene])

  return null
}

export default function PostprocessingCa() {
  const { enabled, animated, strength, centerX, centerY, scale, autoRotate } = useControls(
    'postprocessing-ca',
    {
      enabled: true,
      animated: true,
      strength: { value: 1.5, min: 0, max: 3, step: 0.01 },
      centerX: { value: 0.5, min: -1, max: 1, step: 0.01 },
      centerY: { value: 0.5, min: -1, max: 1, step: 0.01 },
      scale: { value: 1.2, min: 0.5, max: 2, step: 0.01 },
      autoRotate: true,
    },
  )

  return (
    <Canvas
      // Original never sets a tone mapping (WebGPURenderer default) — fiber's Canvas
      // would otherwise default to ACESFilmic.
      renderer={{ antialias: true, toneMapping: NoToneMapping }}
      background="#0a0a0a"
      camera={{ position: [0, 15, 40], fov: 45, near: 0.1, far: 200 }}
    >
      <CAPipeline
        enabled={enabled}
        strength={strength}
        centerX={centerX}
        centerY={centerY}
        scale={scale}
      />
      <RoomEnv />
      <Shapes animated={animated} />
      <gridHelper args={[40, 20, '#444444', '#222222']} position={[0, -10, 0]} />
      <DemoHelpers
        grid={false}
        target={[0, 0.5, 0]}
        maxDistance={150}
        autoRotate={autoRotate}
        autoRotateSpeed={-0.1}
      />
    </Canvas>
  )
}
