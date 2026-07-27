/**
 * geometry-loft
 * R3F port of three.js `webgpu_geometry_loft`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_geometry_loft (~1000 lines of JS)
 *
 * DEMONSTRATES
 * - three.js's `LoftGeometry` addon: skinning a surface through an array of cross
 *   sections (the general case of `LatheGeometry`/`TubeGeometry`) — seventeen
 *   exhibits built from it, from simple revolved profiles (`SplineCurve` + a lathe
 *   loop, `geometries.ts`) to hand-parameterized non-circular sections (star, shell,
 *   pumpkin, …)
 * - Every material's `colorNode`/`roughnessNode`/`normalNode` composed purely from
 *   MaterialX noise TSL functions (`mx_noise_float`/`mx_fractal_noise_float`/
 *   `mx_worley_noise_float`) and the loft's own uvs (`uv().x` runs along the loft,
 *   `uv().y` around each section) — zero textures anywhere in the scene
 *   (`materials.ts`)
 * - Rebuilding a debug "skeleton" of ring wireframes directly from
 *   `LoftGeometry.parameters.sections` (three.js's convention for procedural
 *   geometries remembering their own construction parameters) and each mesh's own
 *   `matrixWorld` — no separate bookkeeping (`Exhibits.tsx`)
 * - A TSL `scene.backgroundNode` screen-space vignette (`screenUV.distance(0.5)`)
 *   in place of a flat color/HDR Canvas background — same cast-based pattern as
 *   `reflection.tsx`/`sprites.tsx`
 *
 * DIVERGENCE from original
 * - Folder pattern: `geometries.ts` (pure `LoftGeometry` factories), `materials.ts`
 *   (pure `MeshStandardNodeMaterial` factories) and `Exhibits.tsx` (the scene
 *   assembly + skeleton toggle) split out from this entry file — the flat file was
 *   nowhere close to fitting the ~200-line threshold once all seventeen exhibits'
 *   geometry math and material graphs were included
 * - `PMREMGenerator.fromScene(new RoomEnvironment(), 0.04)` replaced with drei's
 *   `<Environment preset="studio">` at the same `environmentIntensity` (0.4): same
 *   purpose (soft ambient IBL for the marble/metal materials' reflections), avoids
 *   vendoring `PMREMGenerator`/`RoomEnvironment` for a single scene (neither ships
 *   `@types/three` declarations here) — no pixel parity intended, a different HDRI
 * - `renderer.inspector.createParameters(...)`'s dat.gui-style panel (sections
 *   toggle, wireframe toggle) replaced with leva controls; a `rotationSpeed` control
 *   is added (the original hardcodes the exhibit turntable at a fixed `+= 0.001`
 *   rad PER FRAME, i.e. tied to display refresh rate — the port instead scales by
 *   `state.delta` for frame-rate-independent motion, at an equivalent default of
 *   ~0.06 rad/s)
 * - `renderer.inspector = new Inspector()` dropped — this repo doesn't wire the
 *   Inspector RootState slot yet (same gap noted in other TSL ports)
 * - `renderer.shadowMap.type = PCFShadowMap` not reproduced: Canvas `shadows`
 *   (boolean) uses the WebGPURenderer's default shadow algorithm instead of pinning
 *   the legacy WebGL-style PCF variant
 * - OrbitControls → DemoHelpers' camera-controls wrapper (`target`/`minDistance`/
 *   `maxDistance` map directly to the original's controls); grid disabled
 *   (`grid={false}`) — the mottled marble floor already IS the ground plane the
 *   pedestals stand on, and a world-space grid at a different height would clash
 *   with the theater curtain's 58-unit-radius footprint
 */
import { useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { Environment } from '@react-three/drei/webgpu'
import { folder, useControls } from 'leva'
import { color, screenUV } from 'three/tsl'
import { NeutralToneMapping } from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { Exhibits } from './Exhibits'

// A vignette in the background. Cast: `@types/three`'s `Scene` doesn't declare
// `backgroundNode` even though the webgpu renderer reads it directly off the live
// scene instance (same documented duck-typed gap as `reflection.tsx`/`sprites.tsx`).
function SceneBackground() {
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null }
    withBackgroundNode.backgroundNode = screenUV.distance(0.5).mix(color(0x5d5d84), color(0x2e2e44))
    return () => {
      withBackgroundNode.backgroundNode = null
    }
  }, [scene])

  return null
}

export default function GeometryLoft() {
  const { wireframe, showSkeleton, rotationSpeed } = useControls('geometry-loft', {
    display: folder({
      wireframe: false,
      showSkeleton: false,
    }),
    turntable: folder({
      rotationSpeed: { value: 0.06, min: 0, max: 0.3, step: 0.01 },
    }),
  })

  return (
    <Canvas
      renderer={{ toneMapping: NeutralToneMapping }}
      shadows
      camera={{ position: [0, 15, 40], fov: 45, near: 1, far: 1000 }}
    >
      <SceneBackground />
      <Environment preset="studio" environmentIntensity={0.4} />
      <directionalLight
        color="#ffffff"
        intensity={3}
        position={[18, 30, 12]}
        castShadow
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-far={110}
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-bias={-0.0005}
      />
      <Exhibits wireframe={wireframe} showSkeleton={showSkeleton} rotationSpeed={rotationSpeed} />
      <DemoHelpers grid={false} target={[0, -3, 0]} minDistance={15} maxDistance={50} />
    </Canvas>
  )
}
