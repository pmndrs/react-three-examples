/**
 * backdrop-water
 * R3F port of three.js `webgpu_backdrop_water`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_backdrop_water (~250 lines of JS)
 *
 * DEMONSTRATES
 * - `MeshBasicNodeMaterial.backdropNode`/`backdropAlphaNode` composing a screen-space
 *   refraction: `viewportSharedTexture()` sampled through a depth-tested UV offset
 *   (falls back to plain `screenUV` where the offset would sample geometry in front of
 *   the water) — the same backdrop escape hatch as `refraction.tsx`'s single window and
 *   `backdrop`'s portal gallery, here driven by animated voronoi noise instead of a
 *   static normal map (WaterScene.tsx)
 * - `linearDepth()` (current fragment) vs. `linearDepth(viewportDepthTexture(uv))`
 *   (already-rendered scene at a UV) compared to drive both the refraction fallback and
 *   a soft depth-based edge blend (WaterScene.tsx)
 * - `scene.backgroundNode` — a `normalWorld.y`-driven sky gradient (cast pattern, same
 *   gap as `backdrop`/`reflection`'s `SceneBackground`) (SceneSetup.tsx)
 * - `triplanarTexture()` sharing ONE TSL node instance across two materials (100
 *   icosahedrons + the caustic-lit floor) — TSL nodes are ordinary shared subgraphs, no
 *   per-material duplication required (WaterScene.tsx)
 * - `useRenderPipeline`'s `gaussianBlur` with a per-pixel `directionNode` selected by a
 *   `waterMask` test (`objectPosition(camera).y` vs. a `screenUV`-derived horizon) —
 *   blurs by scene depth above the waterline, blurs+tints+vignettes below it
 *   (RenderPipelineFX.tsx)
 * - Declarative `<fog attach="fog" args={…} />` auto-wrapped into a fog node by the
 *   webgpu renderer (Layer 1 fog rule) — no custom TSL fog graph needed here
 *
 * DIVERGENCE from original
 * - `voronoi2d`/`voronoi3d` (`three/addons/tsl/math/voronoiNoise.js`) are NOT shipped in
 *   the pinned npm `three@0.185.1` package's `examples/jsm` (verified: only
 *   `Bayer.js`/`curlNoise.js` exist under `tsl/math/`, though the repo's newer
 *   `reference/three.js` clone has the file). Reproduced verbatim as plain TSL in
 *   `voronoiNoise.ts` instead of reaching into the gitignored reference clone at
 *   runtime — a version-skew gap in the pinned dependency, not a design choice
 * - The floor-position GUI slider (`renderer.inspector.createParameters`) becomes a
 *   `floorY` leva control (`-1..1`, default `0.2`, matches the original's range/default);
 *   drives both the floor mesh's Y offset and Michelle's Y position, same as the
 *   original's per-frame `floorPosition.y` reads
 * - Per-object animation phase uses the icosahedron field's array index instead of the
 *   original's `object.id` (three.js's internal auto-increment counter, an
 *   implementation detail with no semantic meaning) — same visual effect, reproducible
 *   across runs
 * - `renderer.inspector` and every `.toInspector(...)` tap dropped — this repo doesn't
 *   wire the Inspector RootState slot yet (same gap noted in `refraction`/`reflection`/
 *   `postprocessing-bloom-emissive`/`backdrop`)
 * - DemoHelpers' camera-controls orbit swaps in for `OrbitControls`; `target`,
 *   `minDistance`/`maxDistance`, `maxPolarAngle`, and `autoRotate`/`autoRotateSpeed` all
 *   forwarded to match the original's controls setup. `grid={false}`: the original has
 *   no ground plane at all (water plane + ice floor ARE the ground), and DemoHelpers'
 *   world-space grid at y=0.002 would clash with the water plane sitting at y=0
 * - Split into a folder (this file + SceneSetup/Michelle/WaterScene/RenderPipelineFX/
 *   voronoiNoise): the single-file port ran well over the corpus's ~200-line threshold —
 *   split by scene role (background fixture / loaded character / water+ice diorama /
 *   post-processing / inlined addon math), same rationale as `backdrop`'s split
 */
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { SceneBackground } from './SceneSetup'
import { Michelle } from './Michelle'
import { WaterScene } from './WaterScene'
import { RenderPipelineFX } from './RenderPipelineFX'
import { DemoHelpers } from '../../utils/DemoHelpers'

export default function BackdropWater() {
  const { floorY } = useControls('backdrop-water', {
    floorY: { value: 0.2, min: -1, max: 1, step: 0.001, label: 'floor position' },
  })

  return (
    <Canvas
      renderer
      shadows
      camera={{ position: [3, 2, 4], fov: 50, near: 0.25, far: 30 }}
    >
      <fog attach="fog" args={[0x0487e2, 7, 25]} />
      <SceneBackground />

      <directionalLight
        color={0xffe499}
        intensity={5}
        position={[0.5, 3, 0.5]}
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-camera-near={0.5}
        shadow-camera-far={15}
        shadow-camera-left={-1.5}
        shadow-camera-right={1.5}
        shadow-camera-top={1.5}
        shadow-camera-bottom={-1.5}
        shadow-bias={-0.001}
      />
      <hemisphereLight color={0x333366} groundColor={0x74ccf4} intensity={5} />
      <hemisphereLight color={0x74ccf4} groundColor={0x000000} intensity={1} />

      <Suspense fallback={null}>
        <Michelle floorY={floorY} />
        <WaterScene floorY={floorY} />
      </Suspense>

      <RenderPipelineFX />

      <DemoHelpers
        grid={false}
        target={[0, 0.2, 0]}
        minDistance={1}
        maxDistance={10}
        maxPolarAngle={Math.PI * 0.9}
        autoRotate
        autoRotateSpeed={1}
      />
    </Canvas>
  )
}
