/**
 * postprocessing-ca
 * A tumbling shape collage wrapped in chromatic-aberration color fringing — the
 * radial red/blue channel split real camera lenses produce.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_ca
 *
 * DEMONSTRATES
 * - `chromaticAberration()`'s uniform contract, DIFFERENT from `dotScreen()`/
 *   `rgbShift()`: the addon takes uniform() nodes as constructor arguments rather
 *   than exposing its own writable fields, so the caller creates and registers its
 *   own uniforms (`CAPipeline.tsx`) — the pattern (c) case in AGENTS.md
 * - The same `outputColorTransform = false` + manual `renderOutput()` shape as
 *   `postprocessing-fxaa`
 * - RoomEnvironment PMREM lighting with `CameraControls` autoRotate driving a slow
 *   orbit
 * - A shared pool of 8 geometries/materials reused across a central torus, orbiting
 *   shapes, and a point shell, animated by walking group refs' children in useFrame
 *
 * DIVERGENCE from original
 * - The original's animation branch `else if (child.type === 'Group')` is
 *   unreachable dead code (every top-level child already has children.length > 0);
 *   this port keeps the actual effective behavior instead of the dead branch
 */
import { useEffect } from 'react'
import { NoToneMapping, PMREMGenerator } from 'three/webgpu'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'

import { DemoHelpers } from '../../../utils/DemoHelpers'
import { CAPipeline } from './CAPipeline'
import { Shapes } from './Shapes'

//* Scene ==========================================================

// RoomEnvironment PMREM lighting — same imperative escape-hatch pattern as
// postprocessing-ao's RoomEnv and postprocessing-sobel's RoomEnv.
function RoomEnv() {
  const renderer = useThree((s) => s.renderer)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
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
  }, [renderer, scene])

  return null
}

export default function PostprocessingCa() {
  const { autoRotate } = useControls('Camera', { autoRotate: true })

  return (
    <Canvas
      // Original never sets a tone mapping (WebGPURenderer default) — fiber's Canvas
      // would otherwise default to ACESFilmic.
      renderer={{ antialias: true, toneMapping: NoToneMapping }}
      background="#0a0a0a"
      camera={{ position: [0, 15, 40], fov: 45, near: 0.1, far: 200 }}
    >
      <CAPipeline />
      <RoomEnv />
      <Shapes />
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
