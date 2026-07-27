/**
 * shadow-contact
 * R3F port of three.js `webgpu_shadow_contact`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_shadow_contact (~264 lines of JS)
 *
 * DEMONSTRATES
 * - A manual contact-shadow catcher (`ContactShadowCatcher.tsx`): a depth-only
 *   `NodeMaterial` override (`opacityNode = float(1).sub(depth).mul(uDarkness)`)
 *   renders the scene from a small orthographic camera into a 512x512 `RenderTarget`,
 *   then `gaussianBlur()` (the same TSL addon used in `skinning-instancing`'s
 *   post-process, here applied to a plain material's `opacityNode` instead of a render
 *   pipeline) softens it into a ground plane
 * - The frame-loop's `{ before: 'render' }` composition rule (documented in
 *   `frame-loop.mdx` but unused elsewhere in this corpus): the offscreen capture pass
 *   runs as a `useFrame` job ordered before the default phase, so it executes every
 *   frame WITHOUT taking over rendering — the default main-camera render still happens
 *   automatically afterward, no `{ phase: 'render' }` takeover needed
 * - `scene.overrideMaterial` and `renderer.setRenderTarget`/`autoClear`/`clearAlpha`
 *   save-mutate-restore around a second manual render — the same imperative dance the
 *   original does, just relocated into a `useFrame` job instead of a bare `animate()`
 * - Leva-driven `useUniforms` feeding TSL uniforms that live entirely inside a material
 *   graph (not a render pipeline), showing the hook works the same either place
 *
 * DIVERGENCE from original
 * - Folder pattern: split by scene role into `Shapes.tsx` (the rotating trio) and
 *   `ContactShadowCatcher.tsx` (the shadow-capture rig) — the flat file exceeded the
 *   ~200-line threshold
 * - The shadow-catcher rig (shared plane geometry with a baked `rotateX`, the shadow
 *   plane's extra scale flip, the fill plane's extra `rotateX(PI)`, the orthographic
 *   capture camera) is built with plain three.js calls in one `useMemo`, not JSX —
 *   composed rotate/scale matrix ops don't map onto declarative rotation/scale props
 *   without risking a transform-order mistake, so this is the intentional imperative
 *   escape hatch Layer 1 calls out, kept visible in the component that owns it
 * - `CameraHelper` must be a direct child of the scene (three.js aliases its `.matrix`
 *   to the target camera's `.matrixWorld`; nesting it under the shadow-offset group
 *   would double-apply that offset) — mounted as a sibling of the shadow group, not
 *   inside it, matching the original's `scene.add(cameraHelper)` placement exactly
 * - The original's `renderer.inspector.createParameters` dat.gui-style panel is
 *   replaced with leva controls (same six parameters/ranges, grouped into "Shadow" and
 *   "Plane" folders)
 * - `scene.background = new THREE.Color(...)` becomes the Canvas `background` prop;
 *   the manual `window.addEventListener('resize', ...)` handler is dropped (fiber
 *   resizes the main camera/canvas automatically — the fixed-size shadow capture
 *   camera was never part of that handler in the original either)
 * - OrbitControls (no min/max distance) becomes DemoHelpers' camera-controls v3
 *   wrapper; DemoHelpers' grid is disabled (`grid={false}`) — the original's white
 *   background plus its own small ground plane is the intended look, and an infinite
 *   world-space grid at a different height would clash with the shadow catcher plane
 *   that IS the subject of this example
 */
import { folder, useControls } from 'leva'
import { Canvas } from '@react-three/fiber/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { ContactShadowCatcher } from './ContactShadowCatcher'
import { Shapes } from './Shapes'

export default function ShadowContact() {
  const { shadowBlur, shadowDarkness, shadowOpacity, planeColor, planeOpacity, showWireframe } = useControls(
    'shadow-contact',
    {
      Shadow: folder({
        shadowBlur: { value: 3.5, min: 0, max: 15, step: 0.1 },
        shadowDarkness: { value: 1, min: 0.1, max: 5, step: 0.1 },
        shadowOpacity: { value: 1, min: 0, max: 1, step: 0.01 },
      }),
      Plane: folder({
        planeColor: '#ffffff',
        planeOpacity: { value: 1, min: 0, max: 1, step: 0.01 },
      }),
      showWireframe: false,
    },
  )

  return (
    <Canvas renderer background="#ffffff" camera={{ position: [0.5, 1, 2], fov: 50, near: 0.1, far: 100 }}>
      <Shapes />
      <ContactShadowCatcher
        blur={shadowBlur}
        darkness={shadowDarkness}
        shadowOpacity={shadowOpacity}
        planeColor={planeColor}
        planeOpacity={planeOpacity}
        showWireframe={showWireframe}
      />
      <DemoHelpers grid={false} />
    </Canvas>
  )
}
