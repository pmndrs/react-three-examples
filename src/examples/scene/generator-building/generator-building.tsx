/**
 * generator-building
 * A single procedurally generated Neo-Gothic terracotta skyscraper at sunset, built
 * once from a seed and eight shape parameters.
 * Original: https://threejs.org/examples/#webgpu_generator_building (~145 lines of JS)
 *
 * DEMONSTRATES
 * - three.js's `SkyscraperGenerator` addon driven live from leva: every shape
 *   parameter (`seed`, `height`, `width`, `depth`, `floorHeight`, `bayWidth`,
 *   `chamfer`, `setback`) rebuilds the tower on change (`Tower.tsx`) — a legitimate
 *   `useMemo` + `<primitive>` escape hatch for a generator that returns a whole
 *   subtree (pattern: `custom-fog/TerrainForest.tsx`)
 * - ONE shared `MeshStandardNodeMaterial` (`createSkyscraperMaterial`) across every
 *   rebuild: `baseColor` is a live `uniform(Color)` repicked from the seed via
 *   `pickBuildingColor`, so the masonry tint changes with zero shader recompile
 * - `SkyMesh` reparented by hand between a hidden bake scene and the visible scene —
 *   baked into `scene.environment` for IBL, then shown as the backdrop with its sun
 *   disc restored (`Sky.tsx`)
 * - Physically-motivated shadow-frustum fitting: the directional key light's shadow
 *   camera is resized and recentred on the tower's actual ground shadow every time the
 *   sun or the tower's footprint changes, so a low sun's long shadow is never clipped
 *
 * DIVERGENCE from original
 * - `renderer.inspector.createParameters` dat.gui panel replaced with leva; all nine
 *   controls live in this shared parent because `height`/`width`/`depth` feed BOTH the
 *   tower (`Tower.tsx`) and the shadow-frustum fit (`Sky.tsx`) — a genuine
 *   two-consumer value, not prop-drilling (house rule)
 * - `OrbitControls` (damping, `autoRotate`) replaced by DemoHelpers' CameraControls —
 *   same target, polar-angle clamp, distance limits and auto-rotate speed
 */
import { ACESFilmicToneMapping } from 'three/webgpu';

import { Canvas } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { Sky } from './Sky';
import { Tower } from './Tower';

export default function GeneratorBuilding() {
  const { seed, height, width, depth, floorHeight, bayWidth, chamfer, setback, timeOfDay } = useControls(
    'generator-building',
    {
      seed: { value: 7, min: 0, max: 100, step: 1 },
      height: { value: 100, min: 60, max: 200, step: 1 },
      width: { value: 34, min: 18, max: 60, step: 1 },
      depth: { value: 28, min: 16, max: 50, step: 1 },
      floorHeight: { value: 4, min: 3, max: 6, step: 0.1 },
      bayWidth: { value: 2.6, min: 1.8, max: 4.5, step: 0.1 },
      chamfer: { value: 5, min: 0, max: 10, step: 0.5 },
      setback: { value: 1.5, min: 0, max: 4, step: 0.1 },
      timeOfDay: { value: 17, min: 6, max: 18, step: 0.1, label: 'time of day' },
    },
  );

  return (
    <Canvas
      shadows
      renderer={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 0.25 }}
      camera={{ position: [120, 95, 155], fov: 45, near: 1, far: 20000 }}>
      <Sky timeOfDay={timeOfDay} height={height} width={width} depth={depth} />
      <Tower
        seed={seed}
        height={height}
        width={width}
        depth={depth}
        floorHeight={floorHeight}
        bayWidth={bayWidth}
        chamfer={chamfer}
        setback={setback}
      />
      {/* Invisible ground — only catches the tower's shadow. */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[2000, 2000]} />
        <shadowMaterial color="#000000" opacity={0.35} />
      </mesh>
      <DemoHelpers
        grid={false}
        target={[0, 58, 0]}
        minDistance={30}
        maxDistance={600}
        maxPolarAngle={Math.PI * 0.495}
        autoRotate
        autoRotateSpeed={0.3}
      />
    </Canvas>
  );
}
