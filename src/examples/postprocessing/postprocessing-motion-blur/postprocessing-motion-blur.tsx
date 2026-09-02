/**
 * postprocessing-motion-blur
 * Three motion-vector sources at once — a skinned runner, a spinning torus, a
 * scale-pulsing torus — all smeared by one velocity-based blur pass.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_motion_blur
 *
 * DEMONSTRATES
 * - MRT velocity: the scene pass renders beauty + per-pixel motion vectors
 *   (`scenePass.setMRT(mrt({ output, velocity }))`), and `motionBlur()` smears the
 *   beauty texture along it as the pipeline output
 * - A live `useUniforms` node multiplied straight into the velocity texture — no
 *   register/effect roundtrip needed since the node is already reactive
 * - A TSL screen-space vignette composed over the blurred output
 * - `useAnimations` playing a skinned run clip by name, alongside object-level and
 *   camera-level motion — velocity picks up all three per pixel
 */
import { Suspense } from 'react'
import { NoToneMapping } from 'three/webgpu'
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'

import { DemoHelpers } from '../../../utils/DemoHelpers'
import { CheckerRoom } from './CheckerRoom'
import { MotionBlurPipeline } from './MotionBlurPipeline'
import { SpinningToruses } from './SpinningToruses'
import { XbotRunner } from './XbotRunner'

export default function PostprocessingMotionBlur() {
  // Shared by the two siblings below — kept at this level rather than split across
  // two useControls calls that would register the same leva key twice.
  const { autoRotate, speed } = useControls('Motion Blur', {
    autoRotate: true,
    speed: { value: 1, min: 0, max: 2, step: 0.01 },
  })

  return (
    <Canvas
      // Original sets no tone mapping (three.js default); fiber would default ACES.
      renderer={{ toneMapping: NoToneMapping }}
      shadows="percentage"
      camera={{ position: [0, 1.5, 4.5], fov: 50, near: 0.25, far: 30 }}>
      <fog attach="fog" args={[0x0487e2, 7, 25]} />
      <directionalLight
        color={0xffe499}
        intensity={5}
        position={[4, 4, 2]}
        castShadow
        shadow-camera-near={0.1}
        shadow-camera-far={10}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={2}
        shadow-camera-bottom={-2}
        shadow-mapSize={[1024, 1024]}
      />
      <hemisphereLight color={0x333366} groundColor={0x74ccf4} intensity={5} />
      <hemisphereLight color={0x74ccf4} groundColor={0x000000} intensity={1} />
      <MotionBlurPipeline />
      <Suspense fallback={null}>
        <CheckerRoom />
        <SpinningToruses speed={speed} />
        <XbotRunner speed={speed} />
      </Suspense>
      <DemoHelpers
        grid={false}
        target={[0, 1, 0]}
        minDistance={1}
        maxDistance={10}
        maxPolarAngle={Math.PI / 2}
        autoRotate={autoRotate}
        autoRotateSpeed={1}
      />
    </Canvas>
  )
}
