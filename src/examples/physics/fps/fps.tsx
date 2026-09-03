/**
 * fps
 * A first-person walk through a small level with no physics library at all: the level
 * is a static Octree, you are a capsule, and the balls you throw are spheres — every
 * collision is three's own `Octree.capsuleIntersect` / `sphereIntersect`.
 * Click to lock the pointer and look around; WASD to move, Space to jump; hold and
 * release the mouse to throw a ball (longer hold, harder throw).
 * Original: https://threejs.org/examples/#games_fps
 *
 * DEMONSTRATES
 * - drei `<PointerLockControls>` + `<KeyboardControls>` replacing the hand-rolled
 *   mousemove / keydown listeners — key state is read with `get()` inside the loop
 * - A substepped simulation in `useFrame`: five collision steps per frame, all on
 *   mutable objects the loop owns; React state is never touched after mount
 * - The camera as the player: its position is written from the capsule each frame while
 *   the controls own its rotation
 * - One `<instancedMesh>` for the 100 balls where the original makes 100 meshes
 * - `<octreeHelper>` via shared addon registration, toggled by leva like the original's GUI
 */
import { Suspense, useLayoutEffect, useMemo } from 'react';
import { ACESFilmicToneMapping, Mesh, MeshStandardMaterial } from 'three/webgpu';
import { Octree } from 'three/addons/math/Octree.js';
import { Canvas } from '@react-three/fiber/webgpu';
import { KeyboardControls, PointerLockControls, useGLTF } from '@react-three/drei/webgpu';
import { useControls } from 'leva';

import '../../../assets/OctreeHelper';
import { DemoHelpers } from '../../../utils/DemoHelpers';
import { Simulation } from './Simulation';

const WORLD_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/collision-world.glb';

const KEYS = [
  { name: 'forward', keys: ['KeyW'] },
  { name: 'backward', keys: ['KeyS'] },
  { name: 'left', keys: ['KeyA'] },
  { name: 'right', keys: ['KeyD'] },
  { name: 'jump', keys: ['Space'] },
];

function Level() {
  const { scene } = useGLTF(WORLD_URL);
  const { debug } = useControls('Octree', { debug: false });

  // The Octree is CPU-side collision data built once from the level's triangles.
  const world = useMemo(() => new Octree().fromGraphNode(scene), [scene]);

  // The loaded scene is cached across mounts, so the shadow flags go on in an effect
  // and come off again with it.
  useLayoutEffect(() => {
    const meshes: Mesh[] = [];
    scene.traverse((child) => {
      if (child instanceof Mesh) meshes.push(child);
    });
    for (const mesh of meshes) {
      mesh.castShadow = mesh.receiveShadow = true;
      if (mesh.material instanceof MeshStandardMaterial && mesh.material.map) mesh.material.map.anisotropy = 4;
    }
    return () => {
      for (const mesh of meshes) mesh.castShadow = mesh.receiveShadow = false;
    };
  }, [scene]);

  return (
    <>
      <primitive object={scene} />
      <octreeHelper args={[world]} visible={debug} />
      <Simulation world={world} />
    </>
  );
}

export default function Fps() {
  return (
    <KeyboardControls map={KEYS}>
      <Canvas
        renderer={{ toneMapping: ACESFilmicToneMapping }}
        shadows="variance"
        background="#88ccee"
        // Level rotation: the camera starts at the capsule's top, looking straight ahead
        // rather than at the origin below it.
        camera={{ fov: 70, near: 0.1, far: 1000, position: [0, 1, 0], rotation: [0, 0, 0] }}>
        <fog attach="fog" args={['#88ccee', 0, 50]} />
        <hemisphereLight args={['#8dc1de', '#00668d', 1.5]} position={[2, 1, 1]} />
        <directionalLight
          position={[-5, 25, -1]}
          intensity={2.5}
          castShadow
          shadow-camera-near={0.01}
          shadow-camera-far={500}
          shadow-camera-left={-30}
          shadow-camera-right={30}
          shadow-camera-top={30}
          shadow-camera-bottom={-30}
          shadow-mapSize={[1024, 1024]}
          shadow-radius={4}
          shadow-bias={-0.00006}
        />

        <Suspense>
          <Level />
        </Suspense>

        <PointerLockControls />
        {/* The camera is the player: no orbit, and the level is its own ground. */}
        <DemoHelpers grid={false} controls={false} />
      </Canvas>
    </KeyboardControls>
  );
}
