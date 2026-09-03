/**
 * loader-ldraw
 * A LEGO set built from an LDraw model file. Pick one of seventeen official sets, scrub
 * the model's own building-step count to watch it assemble, or flip it to flat "instruction
 * booklet" colors and a single merged mesh.
 * Original: https://threejs.org/examples/#webgl_loader_ldraw
 *
 * DEMONSTRATES
 * - `LDrawLoader` parsing a self-contained "_Packed" MPD file — every referenced brick is
 *   inlined, so loading needs no part-by-part fetch from the official parts library
 * - `computeBuildingSteps()` stamps `userData.buildingStep` on every group as it parses;
 *   the building-step slider is pure visibility toggling afterward, no re-parse
 * - `LDrawConditionalLineNodeMaterial`, the loader's own WebGPU-renderer counterpart to
 *   the original's WebGL-only `LDrawConditionalLineMaterial` (the loader's own doc comment
 *   names both and which renderer each is for)
 * - Flat-color and merged-geometry views built with `useMemo` over a CLONE of the loaded
 *   group, instead of the original's full network re-fetch for every toggle — `smoothNormals`
 *   is the one control that genuinely changes what the loader parses, so only it re-suspends
 * - `CameraControls.fitToBox()` reframing the view on every model swap, replacing the
 *   original's manual bounding-box-to-camera-offset math
 *
 * DIVERGENCE from original
 * - `Group.userData` types as `Record<string, unknown>`; `numBuildingSteps` and each
 *   child's `buildingStep` are read with one local cast, matching the original's own
 *   untyped access
 * - The building-step slider starts high enough to show every set fully assembled (the
 *   original's `guiData.buildingStep = numBuildingSteps - 1` reset after each load), rather
 *   than writing the value back into leva on every model swap
 */
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import { ACESFilmicToneMapping, Group, LineSegments, Mesh, MeshBasicMaterial, PMREMGenerator } from 'three/webgpu';
import type { Material } from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js';
import { LDrawConditionalLineMaterial as LDrawConditionalLineNodeMaterial } from 'three/addons/materials/LDrawConditionalLineNodeMaterial.js';
import { LDrawUtils } from 'three/addons/utils/LDrawUtils.js';
import { Canvas, useLoader, useThree } from '@react-three/fiber/webgpu';
import type CameraControlsImpl from 'camera-controls';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const LDRAW_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/ldraw/officialLibrary/';

const MODELS = {
  Car: 'models/car.ldr_Packed.mpd',
  'Lunar Vehicle': 'models/1621-1-LunarMPVVehicle.mpd_Packed.mpd',
  'Radar Truck': 'models/889-1-RadarTruck.mpd_Packed.mpd',
  Trailer: 'models/4838-1-MiniVehicles.mpd_Packed.mpd',
  Bulldozer: 'models/4915-1-MiniConstruction.mpd_Packed.mpd',
  Helicopter: 'models/4918-1-MiniFlyers.mpd_Packed.mpd',
  Plane: 'models/5935-1-IslandHopper.mpd_Packed.mpd',
  Lighthouse: 'models/30023-1-Lighthouse.ldr_Packed.mpd',
  'X-Wing mini': 'models/30051-1-X-wingFighter-Mini.mpd_Packed.mpd',
  'AT-ST mini': 'models/30054-1-AT-ST-Mini.mpd_Packed.mpd',
  'AT-AT mini': 'models/4489-1-AT-AT-Mini.mpd_Packed.mpd',
  Shuttle: 'models/4494-1-Imperial Shuttle-Mini.mpd_Packed.mpd',
  'TIE Interceptor': 'models/6965-1-TIEIntercep_4h4MXk5.mpd_Packed.mpd',
  'Star fighter': 'models/6966-1-JediStarfighter-Mini.mpd_Packed.mpd',
  'X-Wing': 'models/7140-1-X-wingFighter.mpd_Packed.mpd',
  'AT-ST': 'models/10174-1-ImperialAT-ST-UCS.mpd_Packed.mpd',
  Window: 'models/6156-1-WindowBrick.mpd_Packed.mpd',
};

// Comfortably above every set's real step count, so a fresh model starts fully built
// without writing a value back into leva (see DIVERGENCE).
const MAX_BUILDING_STEP = 200;

function toFlatMaterial(material: Material) {
  const flat = new MeshBasicMaterial();
  flat.color.copy((material as MeshBasicMaterial).color);
  flat.polygonOffset = material.polygonOffset;
  flat.polygonOffsetUnits = material.polygonOffsetUnits;
  flat.polygonOffsetFactor = material.polygonOffsetFactor;
  flat.opacity = material.opacity;
  flat.transparent = material.transparent;
  flat.depthWrite = material.depthWrite;
  flat.toneMapped = false;
  return flat;
}

//* Environment ====================================================

// RoomEnvironment -> PMREM -> scene.environment: the scene's only light source, matching
// the original (no analytical lights).
function RoomEnv() {
  const renderer = useThree((state) => state.renderer);
  const scene = useThree((state) => state.scene);

  useLayoutEffect(() => {
    const environment = new RoomEnvironment();
    const pmremGenerator = new PMREMGenerator(renderer);
    const envRT = pmremGenerator.fromScene(environment, 0.04);
    scene.environment = envRT.texture;
    environment.dispose();
    pmremGenerator.dispose();
    return () => {
      scene.environment = null;
      envRT.dispose();
    };
  }, [renderer, scene]);

  return null;
}

//* Model ==========================================================

interface LDrawModelProps {
  controlsRef: React.RefObject<CameraControlsImpl | null>;
}

function LDrawModel({ controlsRef }: LDrawModelProps) {
  const { model, flatColors, mergeModel, smoothNormals, buildingStep, displayLines, conditionalLines } = useControls(
    'LDraw',
    {
      model: { value: MODELS.Car, options: MODELS },
      flatColors: { value: false, label: 'Flat Colors' },
      mergeModel: { value: false, label: 'Merge model' },
      smoothNormals: { value: true, label: 'Smooth Normals' },
      buildingStep: { value: MAX_BUILDING_STEP, min: 0, max: MAX_BUILDING_STEP, step: 1, label: 'Building step' },
      displayLines: { value: true, label: 'Display Lines' },
      conditionalLines: { value: true, label: 'Conditional Lines' },
    },
  );

  // `smoothNormals` is the only control that changes what the loader actually parses —
  // it's folded into the cache key (a URL fragment; never sent over the wire) so toggling
  // it re-suspends instead of silently reusing the previous parse.
  const group = useLoader(LDrawLoader, `${encodeURI(LDRAW_PATH + model)}#smooth=${smoothNormals}`, (loader) => {
    loader.setConditionalLineMaterial(LDrawConditionalLineNodeMaterial);
    loader.smoothNormals = smoothNormals;
  });

  // Flat colors and merging are pure post-processing over a CLONE — the loaded group is
  // Suspense-cached and shared, so it's never mutated directly.
  const displayGroup = useMemo(() => {
    let result = group.clone(true) as Group;
    if (flatColors) {
      result.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        child.material = Array.isArray(child.material)
          ? child.material.map(toFlatMaterial)
          : toFlatMaterial(child.material);
      });
    }
    if (mergeModel) result = LDrawUtils.mergeObject(result);
    return result;
  }, [group, flatColors, mergeModel]);

  useLayoutEffect(() => {
    displayGroup.traverse((child) => {
      if (child instanceof LineSegments) {
        child.visible = 'isConditionalLine' in child ? conditionalLines : displayLines;
      } else if (child instanceof Group && 'buildingStep' in child.userData) {
        // `LDrawUtils.mergeObject` returns a flat Group with no per-step children (no
        // `buildingStep` in its userData) — leave anything without the field visible,
        // rather than hiding it the way an unconditional `undefined <= n` would.
        child.visible = (child.userData as { buildingStep: number }).buildingStep <= buildingStep;
      }
    });
  }, [displayGroup, buildingStep, displayLines, conditionalLines]);

  // Reframe on every model swap (and post-process change, since merging can shrink the
  // bounds) — the original's bounding-box-to-camera-offset math, done by camera-controls.
  useLayoutEffect(() => {
    controlsRef.current?.fitToBox(displayGroup, true, { paddingLeft: 0.5, paddingRight: 0.5 });
  }, [controlsRef, displayGroup]);

  // Convert from LDraw coordinates: rotate 180 degrees around X.
  return <primitive object={displayGroup} rotation={[Math.PI, 0, 0]} />;
}

//* Scene ===========================================================

export default function LoaderLdraw() {
  const controlsRef = useRef<CameraControlsImpl>(null);

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      background="#deebed"
      camera={{ position: [150, 200, 250], fov: 45, near: 1, far: 10000 }}>
      <RoomEnv />
      <Suspense fallback={null}>
        <LDrawModel controlsRef={controlsRef} />
      </Suspense>
      <DemoHelpers grid={false} controlsRef={controlsRef} />
    </Canvas>
  );
}
