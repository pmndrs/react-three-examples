/**
 * camera
 * R3F port of three.js `webgpu_camera`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_camera (~130 lines of JS)
 *
 * DEMONSTRATES
 * - Render-phase takeover (`useFrame(cb, { phase: 'render' })`, in `CameraRig.tsx`)
 *   reproducing the original's hand-rolled `render()`: this example IS about the manual
 *   scissor+viewport split, so per Layer 1's render-takeover rule, taking over the
 *   default render job is the intended case here, not a shortcut around it
 * - `renderer.setScissor`/`setViewport`/`setClearColor` called twice per frame to draw
 *   one scene through two different cameras into two halves of a single canvas — the
 *   classic "camera as subject" idiom: a `CameraHelper` visualizes a live
 *   `PerspectiveCamera`/`OrthographicCamera` frustum from a third, fixed viewer camera
 * - fiber's reactive `size` (from `useThree`) driving the split-viewport aspect/frustum
 *   math every time the canvas resizes, replacing the original's manual
 *   `window.addEventListener('resize', ...)` handler
 * - A leva `select` control swapping the tracked camera's projection type live, in place
 *   of the original's raw `keydown` listener for the 'O'/'P' keys
 *
 * DIVERGENCE from original
 * - Keyboard 'O'/'P' toggle replaced by a leva select ("Camera type") — a discoverable,
 *   visible control instead of a hidden keyboard-only shortcut, per this repo's
 *   direct-value-over-hidden-state controls convention
 * - DemoHelpers' grid AND orbit camera-controls are both disabled
 *   (`grid={false} controls={false}`): there is no single user-navigable camera in this
 *   example — the whole point is switching between two programmatically driven
 *   cameras, so CameraControls has nothing to attach to, and an infinite ground grid
 *   would clash with the original's black-void aesthetic. DemoHelpers is still mounted
 *   for the readiness signal
 * - The camera rig, its `CameraHelper`s, and the tracked orbiting sphere are built
 *   imperatively in one `useMemo` (`CameraRig.tsx`) rather than JSX — per-frame aspect/
 *   frustum math off a live position, and the rule that `CameraHelper` must stay a
 *   direct scene child (see `shadow-contact/ContactShadowCatcher.tsx`), rule out a
 *   declarative rig
 * - `Date.now() * 0.0005` becomes `state.elapsed * 0.5` (fiber's frame-synced elapsed
 *   seconds), matching the original's visual speed
 * - The background particle field is ported as declarative JSX (`<points>` +
 *   `<bufferGeometry>`) instead of the original's imperative `BufferGeometry`/
 *   `setAttribute` calls — it never mutates per-frame, so it doesn't need the
 *   imperative escape hatch the rig does
 *
 * BLOCKER CHECK — none. The split-viewport mechanism maps cleanly onto fiber v10:
 * `setScissor`/`setViewport`/`setScissorTest` are unchanged on the common `Renderer`
 * base class WebGPURenderer extends (verified against
 * `reference/three.js/src/renderers/common/Renderer.js`), and the render-phase
 * takeover (`{ phase: 'render' }`) is an already-documented, first-class idiom for
 * exactly this "custom rendering" case (`frame-loop.mdx`). No degraded port needed.
 */
import { useMemo } from 'react'
import { useControls } from 'leva'
import { Canvas } from '@react-three/fiber/webgpu'
import { MathUtils } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { CameraRig } from './CameraRig'

const PARTICLE_COUNT = 10000
const PARTICLE_SPREAD = 2000

type CameraType = 'perspective' | 'orthographic'

// Background star field — a static, non-mutating scene element, so unlike the camera
// rig it's plain declarative JSX (original's imperative `BufferGeometry`/`setAttribute`
// star field).
function Particles() {
  const positions = useMemo(() => {
    const array = new Float32Array(PARTICLE_COUNT * 3)
    for (let i = 0; i < array.length; i++) {
      array[i] = MathUtils.randFloatSpread(PARTICLE_SPREAD)
    }
    return array
  }, [])

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="white" />
    </points>
  )
}

export default function CameraExample() {
  const { activeCamera } = useControls('camera', {
    activeCamera: {
      label: 'Camera type',
      value: 'perspective' as CameraType,
      options: ['perspective', 'orthographic'] as CameraType[],
    },
  })

  return (
    // No `camera` prop: the default fiber camera is unused — `CameraRig` takes over
    // rendering entirely and drives its own three cameras (see CameraRig.tsx).
    <Canvas renderer>
      <Particles />
      <CameraRig activeCamera={activeCamera} />
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  )
}
