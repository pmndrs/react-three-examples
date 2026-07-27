/**
 * postprocessing-motion-blur
 * R3F port of three.js `webgpu_postprocessing_motion_blur`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_motion_blur (~190 lines of JS)
 *
 * DEMONSTRATES
 * - Velocity-based motion blur: the scene pass renders beauty + per-pixel motion
 *   vectors via MRT (`scenePass.setMRT(mrt({ output, velocity }))` in the
 *   `useRenderPipeline` setupCB), and `motionBlur()` (three/addons MotionBlur)
 *   smears the beauty texture along the velocity texture as the pipeline output
 * - The pass-owned-uniform dynamism pattern with a USER-created uniform (pattern c):
 *   blur strength scales the velocity texture node, so a three/tsl `uniform()` is
 *   created inside the mainCB — exactly as the original does — registered via
 *   return-to-register, and mutated (`.value`) from a React effect on leva changes
 * - A TSL screen-space vignette (`screenUV.distance(.5).remap(...)`) composed over
 *   the blurred output
 * - Three motion-vector sources at once: a skinned running Xbot (bone motion), a
 *   fast-spinning and a scale-pulsing torus (object motion), and camera auto-rotate
 *   (whole-frame motion) — velocity handles all of them per pixel
 * - Declarative `<fog>` auto-wrapped into a fog node by the WebGPU renderer
 * - Tone-mapping parity: the original never sets a tone mapping (three.js default
 *   NoToneMapping); fiber's Canvas defaults to ACESFilmic, so the port pins
 *   `renderer={{ toneMapping: NoToneMapping }}`
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` panel is replaced with leva
 *   controls (auto rotate / blur amount / speed) — same parameters, same ranges; the
 *   `.toInspector('Color'/'Velocity')` tags are dropped (this repo doesn't wire the
 *   three.js Inspector)
 * - OrbitControls replaced by the DemoHelpers camera-controls baseline (target,
 *   distance/polar limits and auto-rotate forwarded; damping is baseline behavior)
 * - DemoHelpers grid disabled (`grid={false}`): the scene brings its own
 *   checkerboard floor
 * - `speed` maps onto `mixer.timeScale` (drei's `useAnimations` owns the mixer
 *   update loop) instead of the original's manual `mixer.update(delta * speed)`
 * - The run clip is played BY NAME (`'run'`, = the original's `animations[3]`) per
 *   corpus convention, never by index
 * - The original loads a floor normal map it never assigns to any material — not
 *   loaded here
 */
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { NoToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { CheckerRoom } from './CheckerRoom'
import { MotionBlurPipeline } from './MotionBlurPipeline'
import { SpinningToruses } from './SpinningToruses'
import { XbotRunner } from './XbotRunner'

export default function PostprocessingMotionBlur() {
  const { autoRotate, blurAmount, speed } = useControls('motion-blur', {
    autoRotate: true,
    blurAmount: { value: 1, min: 0, max: 3, step: 0.01 },
    speed: { value: 1, min: 0, max: 2, step: 0.01 },
  })

  return (
    <Canvas
      // Original sets no tone mapping (three.js default NoToneMapping) — see header.
      // shadows="percentage" = PCFShadowMap, the original's shadowMap default.
      renderer={{ toneMapping: NoToneMapping }}
      shadows="percentage"
      camera={{ position: [0, 1.5, 4.5], fov: 50, near: 0.25, far: 30 }}
    >
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
      <MotionBlurPipeline blurAmount={blurAmount} />
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
