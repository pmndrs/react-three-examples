/**
 * morphtargets-face
 * R3F port of three.js `webgpu_morphtargets_face`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_morphtargets_face (~153 lines of JS)
 * Model by Face Cap (https://www.bannaflak.com/face-cap).
 *
 * DEMONSTRATES
 * - A KTX2 + Meshopt compressed GLTF (`useGLTF`'s `{ meshopt, ktx2 }` options) whose
 *   52 ARKit-style facial blend shapes arrive pre-baked on `morphTargetDictionary`/
 *   `morphTargetInfluences` — no `updateMorphTargets()` escape hatch needed here (that
 *   is only for hand-built geometry; see `morphtargets.tsx`)
 * - A leva panel BUILT FROM DATA: one slider per `morphTargetDictionary` entry,
 *   generated with `Object.fromEntries` instead of 52 hand-written control lines —
 *   the same shape as the original's `Object.entries(...).forEach(gui.add(...))` loop
 * - `useAnimations` playing exactly one of the GLTF's four clips BY NAME — the file
 *   also ships separate eye-look and head-bob clips that the original's own
 *   `gltf.animations[0]` selection leaves unplayed; picking the same clip by its
 *   literal name reproduces that (rather than defaulting to `Object.values(...)[0]`,
 *   which would be equally correct here but reads as "the only clip" when it isn't)
 * - RoomEnvironment -> `PMREMGenerator.fromScene` IBL (`skinning-instancing-individual`
 *   pattern) for the material's specular response
 *
 * DIVERGENCE from original
 * - `renderer.inspector.createParameters` dat.gui-style panel replaced with the leva
 *   panel described above
 * - Horizontal-orbit lock (`minAzimuthAngle`/`maxAzimuthAngle`) applied imperatively
 *   via the `controlsRef` escape hatch — DemoHelpers' CameraControls wrapper doesn't
 *   expose azimuth limits as props (only polar/distance/zoom)
 * - DemoHelpers' camera-controls orbit replaces `OrbitControls`; `minDistance`/
 *   `maxDistance`/`maxPolarAngle`/`target` map directly to the original's `controls`
 */
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { ACESFilmicToneMapping, PMREMGenerator } from 'three/webgpu';
import type { Mesh } from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Canvas, useThree } from '@react-three/fiber/webgpu';
import { useAnimations, useGLTF } from '@react-three/drei/webgpu';
import type CameraControlsImpl from 'camera-controls';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const FACECAP_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/facecap.glb';
const BASIS_TRANSCODER_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/jsm/libs/basis/';

const TARGET = [0, 0.15, -0.2] as const;

// RoomEnvironment -> PMREM -> scene.environment (skinning-instancing-individual
// pattern): the scene's only light source, matching the original.
function RoomEnv() {
  const renderer = useThree((s) => s.renderer);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
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

// Finds the one mesh carrying blend shapes (traverse instead of the original's
// hardcoded `getObjectByName('mesh_2')` — an internal GLTFLoader naming convention
// for unnamed meshes, not something a reader should have to know).
function findMorphMesh(root: Mesh): Mesh | undefined {
  let found: Mesh | undefined;
  root.traverse((child) => {
    if (!found && (child as Mesh).morphTargetDictionary) found = child as Mesh;
  });
  return found;
}

function FaceCap() {
  const { scene, animations } = useGLTF(FACECAP_URL, { meshopt: true, ktx2: BASIS_TRANSCODER_PATH });
  const { actions } = useAnimations(animations, scene);

  const headMesh = useMemo(() => findMorphMesh(scene as unknown as Mesh), [scene]);
  const dictionary = useMemo(() => headMesh?.morphTargetDictionary ?? {}, [headMesh]);

  // One slider per blend shape, generated from the dictionary instead of written by
  // hand — see header DEMONSTRATES.
  const schema = useMemo(
    () => Object.fromEntries(Object.keys(dictionary).map((name) => [name, { value: 0, min: 0, max: 1, step: 0.01 }])),
    [dictionary],
  );
  const influenceValues = useControls('Morph Targets', schema);

  useEffect(() => {
    // Play BY NAME (corpus rule) — see header DEMONSTRATES for why not
    // `Object.values(actions)[0]`.
    actions['Key|Take 001|BaseLayer']?.play();
  }, [actions]);

  useEffect(() => {
    if (!headMesh?.morphTargetInfluences) return;
    for (const [name, index] of Object.entries(dictionary)) {
      headMesh.morphTargetInfluences[index] = (influenceValues as Record<string, number>)[name] ?? 0;
    }
  }, [headMesh, dictionary, influenceValues]);

  return <primitive object={scene} />;
}

// Horizontal-orbit lock (see header DIVERGENCE): applied once the live controls
// instance exists, via the `controlsRef` escape hatch.
function AzimuthLock({ controlsRef }: { controlsRef: React.RefObject<CameraControlsImpl | null> }) {
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.minAzimuthAngle = -Math.PI / 2;
    controls.maxAzimuthAngle = Math.PI / 2;
  });
  return null;
}

export default function MorphTargetsFace() {
  const controlsRef = useRef<CameraControlsImpl>(null);

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      background="#666666"
      camera={{ position: [-1.8, 0.8, 3], fov: 45, near: 1, far: 20 }}>
      <RoomEnv />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <FaceCap />
      </Suspense>
      <AzimuthLock controlsRef={controlsRef} />
      <DemoHelpers
        grid={false}
        target={[...TARGET]}
        minDistance={2.5}
        maxDistance={5}
        maxPolarAngle={Math.PI / 1.8}
        controlsRef={controlsRef}
      />
    </Canvas>
  );
}
