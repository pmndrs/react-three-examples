/**
 * instancing-morph
 * R3F port of three.js `webgpu_instancing_morph`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_instancing_morph (~160 lines of JS)
 *
 * DEMONSTRATES
 * - `InstancedMesh.setMorphAt`: 1024 copies of ONE horse geometry, each blended to
 *   a DIFFERENT pose of the SAME morph-target clip every frame — the shared
 *   `AnimationMixer` is scrubbed to a different time per instance
 *   (`mixer.setTime(elapsed + offset)`), then its resulting morph weights are baked
 *   into that instance's slot of the InstancedMesh's per-instance morph texture
 * - `setMatrixAt`/`setColorAt` for the (static) grid layout — three's own manual
 *   instancing API, one-time here rather than per-frame (contrast `instance-mesh`)
 * - A scripted flythrough camera (no user orbit in the original at all — see
 *   DIVERGENCE) driven from plain `Math.sin`/`Math.cos` of elapsed time
 *
 * DIVERGENCE from original
 * - The original has no camera interaction whatsoever (`camera.lookAt` runs every
 *   frame) — DemoHelpers renders with `controls={false} grid={false}` instead of a
 *   fixed baseline; a real 1,000,000-unit ground plane already exists in-scene
 */
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Color, Object3D } from 'three/webgpu';
import type { InstancedMesh, Mesh } from 'three/webgpu';
import { Canvas, useFrame } from '@react-three/fiber/webgpu';
import { useAnimations, useGLTF } from '@react-three/drei/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const HORSE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Horse.glb';

const GRID = 32;
const INSTANCE_COUNT = GRID * GRID;
const OFFSET = 5000;

// Scratch objects reused for the one-time matrix/color bake (no per-frame allocation).
const dummyTransform = new Object3D();
const dummyColor = new Color();

// Scripted flythrough — the original drives the camera from plain elapsed time and
// never wires OrbitControls (see header DIVERGENCE).
function ScriptedCamera() {
  useFrame(({ camera, elapsed }) => {
    const r = 3000;
    camera.position.set(Math.sin(elapsed / 10) * r, 1500 + 1000 * Math.cos(elapsed / 5), Math.cos(elapsed / 10) * r);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

// One InstancedMesh, 1024 copies of the loaded horse geometry — see header
// DEMONSTRATES for the two distinct instancing jobs (static layout vs. per-frame
// morph blend) this component owns.
function Horses() {
  const { scene, animations } = useGLTF(HORSE_URL);
  const { actions, mixer } = useAnimations(animations, scene);
  // The loaded scene is never mounted (mirrors the original: `glb.scene` only ever
  // drives the mixer/morph-target read, `dummy` in the original's own naming).
  const dummy = useMemo(() => scene.children[0] as Mesh, [scene]);

  // Per-instance time offsets so every horse scrubs the SAME clip at a different
  // phase — this spread is what makes 1024 copies read as an unsynchronized herd.
  const timeOffsets = useMemo(() => {
    const duration = animations[0]?.duration ?? 0;
    return Array.from({ length: INSTANCE_COUNT }, (_, i) => (duration * i) / INSTANCE_COUNT);
  }, [animations]);

  const meshRef = useRef<InstancedMesh>(null);

  useEffect(() => {
    // Play BY NAME (corpus rule) — the mixer only advances actions that are playing,
    // even though every frame explicitly scrubs it with `setTime` below.
    const name = animations[0]?.name;
    if (name) actions[name]?.play();
  }, [actions, animations]);

  // One-time instance layout: a jittered 32x32 grid, matching the original — these
  // never move again, only the morph blend below changes per frame.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    let i = 0;
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        dummyTransform.position.set(OFFSET - 300 * x + 200 * Math.random(), 0, OFFSET - 300 * y);
        dummyTransform.updateMatrix();
        mesh.setMatrixAt(i, dummyTransform.matrix);
        mesh.setColorAt(i, dummyColor.setHSL(Math.random(), 0.5, 0.66));
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  // Every frame, BEFORE the render phase — matches the original's synchronous
  // setMorphAt-then-render ordering inside animate(). This IS the demo: 1024
  // instances, each individually posed via its own morph-weight bake.
  useFrame(
    ({ elapsed }) => {
      const mesh = meshRef.current;
      if (!mesh) return;

      for (let i = 0; i < INSTANCE_COUNT; i++) {
        mixer.setTime(elapsed + timeOffsets[i]);
        mesh.setMorphAt(i, dummy);
      }
      if (mesh.morphTexture) mesh.morphTexture.needsUpdate = true;
    },
    { phase: 'update' },
  );

  return (
    <instancedMesh ref={meshRef} args={[dummy.geometry, undefined, INSTANCE_COUNT]} castShadow>
      <meshStandardNodeMaterial flatShading />
    </instancedMesh>
  );
}

export default function InstancingMorph() {
  return (
    <Canvas shadows background="#99ddff" camera={{ position: [0, 2500, 3000], fov: 60, near: 100, far: 10000 }}>
      <fog attach="fog" args={['#99ddff', 5000, 10000]} />
      <directionalLight
        position={[200, 1000, 50]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-5000}
        shadow-camera-right={5000}
        shadow-camera-top={5000}
        shadow-camera-bottom={-5000}
        shadow-camera-far={2000}
      />
      <hemisphereLight args={['#99ddff', '#669933', 1 / 3]} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[1_000_000, 1_000_000]} />
        <meshStandardMaterial color="#669933" />
      </mesh>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <Horses />
      </Suspense>
      <ScriptedCamera />
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  );
}
