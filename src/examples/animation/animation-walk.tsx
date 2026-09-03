/**
 * animation-walk
 * A third-person character you steer with WASD / the arrow keys (Shift to run). The
 * soldier turns toward the camera-relative direction you press, crossfades between
 * Idle / Walk / Run, and the camera, its key light and the checkerboard floor all
 * follow along.
 * Original: https://threejs.org/examples/#webgl_animation_walk
 *
 * DEMONSTRATES
 * - drei `<KeyboardControls>` + `useKeyboardControls().get()` read inside `useFrame` —
 *   the original's two `switch(event.code)` listeners become one key map
 * - Camera-relative movement off camera-controls' `azimuthAngle`, and a follow camera
 *   that is one `setTarget()` per frame — the target carries the camera with it
 * - `useAnimations` actions crossfaded by name; the original's "fixed transition"
 *   (weight-continuous fade + clip-phase sync) kept as the leva toggle it was
 * - A directional light whose shadow frustum travels with the character: light and
 *   target in one `<group>` that copies the character's position
 * - The infinite-floor trick: a tiled plane that jumps by whole tile multiples so the
 *   seam is never visible
 *
 * DIVERGENCE from original
 * - `useGLTF` caches the Soldier scene across examples, so the material tweaks are
 *   applied to CLONED materials and reverted on unmount (the blending example shares
 *   this GLB)
 */
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import {
  ACESFilmicToneMapping,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PMREMGenerator,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type AnimationAction,
} from 'three/webgpu';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Canvas, useFrame, useLoader, useTexture, useThree } from '@react-three/fiber/webgpu';
import { KeyboardControls, useAnimations, useGLTF, useKeyboardControls } from '@react-three/drei/webgpu';
import type CameraControlsImpl from 'camera-controls';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/';
const SOLDIER_URL = `${ASSETS}models/gltf/Soldier.glb`;
const HDR_URL = `${ASSETS}textures/equirectangular/lobe.hdr`;
const FLOOR_DIFFUSE_URL = `${ASSETS}textures/floors/FloorsCheckerboard_S_Diffuse.jpg`;
const FLOOR_NORMAL_URL = `${ASSETS}textures/floors/FloorsCheckerboard_S_Normal.jpg`;

const KEYS = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW', 'KeyZ'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'left', keys: ['ArrowLeft', 'KeyA', 'KeyQ'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
];
type Key = (typeof KEYS)[number]['name'];

const FLOOR_SIZE = 50;
const FLOOR_REPEAT = 16;
// The floor jumps by four tiles at a time, so the checkerboard never visibly shifts.
const FLOOR_STEP = (FLOOR_SIZE / FLOOR_REPEAT) * 4;

const FADE_DURATION = 0.5;
const RUN_VELOCITY = 5;
const WALK_VELOCITY = 1.8;
const ROTATE_SPEED = 0.05;
const UP = new Vector3(0, 1, 0);

// Private three API the original reaches into: a fade that starts from the action's
// CURRENT effective weight instead of 0/1, so reversing mid-transition never jumps.
type FadingAction = AnimationAction & {
  _scheduleFading(duration: number, weightNow: number, weightThen: number): AnimationAction;
};

const unwrapRad = (r: number) => Math.atan2(Math.sin(r), Math.cos(r));

//* Environment ===================================================

// REVIEW(environment-ibl): drei's `<Environment files={HDR_URL}>` sets scene.environment
// correctly here (probed: equirect, 1024x512, intensity 1.5) yet NEITHER the floor nor the
// soldier ever received IBL — an IBL-only render was pure black, 6/6 captures. Each mesh
// alone with `<Environment>` was lit; the two together were not. Pre-filtering the HDR
// ourselves (`fromEquirectangular`, the `RoomEnv` pattern) lights both, so the lazy
// PMREMNode path is what fails. Worth an UPSTREAM brief once the trigger is pinned down.
function LobeEnvironment() {
  const hdr = useLoader(HDRLoader, HDR_URL);
  const renderer = useThree((s) => s.renderer);
  const scene = useThree((s) => s.scene);

  useLayoutEffect(() => {
    const pmremGenerator = new PMREMGenerator(renderer);
    const envRT = pmremGenerator.fromEquirectangular(hdr);
    pmremGenerator.dispose();
    scene.environment = envRT.texture;
    scene.environmentIntensity = 1.5;
    return () => {
      scene.environment = null;
      scene.environmentIntensity = 1;
      envRT.dispose();
    };
  }, [hdr, renderer, scene]);

  return null;
}

//* Floor =========================================================

interface FloorProps {
  ref: React.RefObject<Group | null>;
}

// Checkerboard plane plus a warm bulb hovering just above it, grouped so both travel
// together when the character walks off the edge (see `Soldier`'s floor stepping).
function Floor({ ref }: FloorProps) {
  const maxAnisotropy = useThree((s) => s.renderer.getMaxAnisotropy());
  const [map, normalMap] = useTexture([FLOOR_DIFFUSE_URL, FLOOR_NORMAL_URL], (textures) => {
    for (const texture of textures) {
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.repeat.set(FLOOR_REPEAT, FLOOR_REPEAT);
      texture.anisotropy = maxAnisotropy;
    }
    textures[0].colorSpace = SRGBColorSpace;
  });

  return (
    <group ref={ref}>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE, 50, 50]} />
        <meshStandardNodeMaterial
          map={map}
          normalMap={normalMap}
          normalScale={[0.5, 0.5]}
          color="#404040"
          roughness={0.85}
          depthWrite={false}
        />
      </mesh>
      {/* Sits 0.1 above the floor between camera and soldier — it is what lights the
          foreground tiles. */}
      <pointLight color="#ffee88" intensity={2} distance={500} decay={2} position={[1, 0.1, -3]} castShadow>
        <mesh>
          <sphereGeometry args={[0.05, 16, 8]} />
          <meshStandardNodeMaterial emissive="#ffffee" emissiveIntensity={1} color="#000000" />
        </mesh>
      </pointLight>
    </group>
  );
}

//* Character =====================================================

interface SoldierProps {
  controlsRef: React.RefObject<CameraControlsImpl | null>;
  floorRef: React.RefObject<Group | null>;
}

function Soldier({ controlsRef, floorRef }: SoldierProps) {
  const { scene, animations } = useGLTF(SOLDIER_URL);
  const { actions } = useAnimations(animations, scene);
  const [, getKeys] = useKeyboardControls<Key>();
  const { showSkeleton, fixedTransition } = useControls('Walk', { showSkeleton: false, fixedTransition: true });

  const groupRef = useRef<Group>(null);
  const followRef = useRef<Group>(null);
  const lightTarget = useMemo(() => new Object3D(), []);
  const move = useMemo(() => ({ ease: new Vector3(), rotate: new Quaternion(), current: 'Idle' }), []);

  // Chrome the soldier: the body goes full-metal with its albedo doubling as the
  // metalness map, the visor/straps go glassy. On clones, reverted on unmount.
  useLayoutEffect(() => {
    const originals = new Map<Mesh, MeshStandardMaterial>();
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const original = object.material as MeshStandardMaterial;
      originals.set(object, original);
      const material = original.clone();
      material.color.set(1, 1, 1);
      material.metalness = 1;
      if (object.name === 'vanguard_Mesh') {
        object.castShadow = object.receiveShadow = true;
        material.roughness = 0.2;
        material.metalnessMap = material.map;
      } else {
        material.roughness = 0;
        material.transparent = true;
        material.opacity = 0.8;
      }
      object.material = material;
    });
    return () => {
      for (const [object, material] of originals) object.material = material;
    };
  }, [scene]);

  useLayoutEffect(() => {
    for (const name of ['Idle', 'Walk', 'Run']) {
      const action = actions[name];
      if (!action) continue;
      action.enabled = true;
      action.setEffectiveTimeScale(1);
      action.setEffectiveWeight(name === 'Idle' ? 1 : 0);
    }
    actions.Idle?.play();
  }, [actions]);

  useFrame(({ delta }) => {
    const controls = controlsRef.current;
    const group = groupRef.current;
    const follow = followRef.current;
    const floor = floorRef.current;
    if (!controls || !group || !follow || !floor) return;

    const keys = getKeys();
    const kx = Number(keys.right) - Number(keys.left);
    const kz = Number(keys.backward) - Number(keys.forward);
    const active = kx !== 0 || kz !== 0;
    const play = active ? (keys.run ? 'Run' : 'Walk') : 'Idle';

    if (move.current !== play) {
      const current = actions[play] as FadingAction;
      const old = actions[move.current] as FadingAction;
      move.current = play;

      if (fixedTransition) {
        current.reset();
        current.weight = 1;
        current.stopFading();
        old.stopFading();
        // Keep Walk <-> Run in phase: carry the clip position across, scaled by duration.
        if (play !== 'Idle') current.time = old.time * (current.getClip().duration / old.getClip().duration);
        old._scheduleFading(FADE_DURATION, old.getEffectiveWeight(), 0);
        current._scheduleFading(FADE_DURATION, current.getEffectiveWeight(), 1);
        current.play();
      } else {
        current.enabled = true;
        current.setEffectiveTimeScale(1);
        current.setEffectiveWeight(1);
        old.fadeOut(FADE_DURATION);
        current.reset().fadeIn(FADE_DURATION).play();
      }
    }

    if (move.current !== 'Idle') {
      const { ease, rotate } = move;
      const velocity = move.current === 'Run' ? RUN_VELOCITY : WALK_VELOCITY;
      const azimuth = controls.azimuthAngle;

      // Key direction is camera-relative: face it, then step in it, both rotated by
      // the camera's azimuth.
      ease.set(kx, 0, kz).multiplyScalar(velocity * delta);
      rotate.setFromAxisAngle(UP, unwrapRad(Math.atan2(ease.x, ease.z) + azimuth));
      ease.applyAxisAngle(UP, azimuth);

      group.position.add(ease);
      group.quaternion.rotateTowards(rotate, ROTATE_SPEED);
      follow.position.copy(group.position);
      // camera-controls keeps the camera at a fixed offset from the target, so moving
      // the target is the follow camera.
      controls.setTarget(group.position.x, group.position.y + 1, group.position.z, false);

      const dx = group.position.x - floor.position.x;
      const dz = group.position.z - floor.position.z;
      if (Math.abs(dx) > FLOOR_STEP) floor.position.x += dx;
      if (Math.abs(dz) > FLOOR_STEP) floor.position.z += dz;
    }
  });

  return (
    <>
      <group ref={groupRef} rotation-y={Math.PI}>
        <primitive object={scene} rotation-y={Math.PI} />
      </group>
      {showSkeleton && (
        <skeletonHelper
          args={[scene]}
          ref={(helper) => {
            helper?.setColors(new Color('#e000ff'), new Color('#00e0ff'));
          }}
        />
      )}
      {/* Light AND target ride along, so the 4x4 shadow frustum stays on the character. */}
      <group ref={followRef}>
        <directionalLight
          position={[-2, 5, -3]}
          intensity={5}
          target={lightTarget}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-top={2}
          shadow-camera-right={2}
          shadow-camera-bottom={-2}
          shadow-camera-left={-2}
          shadow-camera-near={3}
          shadow-camera-far={8}
        />
        <primitive object={lightTarget} />
      </group>
    </>
  );
}

//* Scene =========================================================

export default function AnimationWalk() {
  const controlsRef = useRef<CameraControlsImpl>(null);
  const floorRef = useRef<Group>(null);

  return (
    <KeyboardControls map={KEYS}>
      <Canvas
        renderer={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 0.5 }}
        shadows
        background="#5e5d5d"
        camera={{ position: [0, 2, -5], fov: 45, near: 0.1, far: 100 }}>
        <fog attach="fog" args={['#5e5d5d', 2, 20]} />
        {/* One boundary: the soldier's metal only reads right once the HDR is the
            scene environment, so the model waits for it. */}
        <Suspense fallback={null}>
          <LobeEnvironment />
          <Floor ref={floorRef} />
          <Soldier controlsRef={controlsRef} floorRef={floorRef} />
        </Suspense>
        <DemoHelpers
          grid={false}
          target={[0, 1, 0]}
          pan={false}
          maxPolarAngle={Math.PI / 2 - 0.05}
          controlsRef={controlsRef}
        />
      </Canvas>
    </KeyboardControls>
  );
}
