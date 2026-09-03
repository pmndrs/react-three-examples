/**
 * loader-md2-control
 * A field of Quake 2 ogros, one MD2 body shared across thirteen skins, marching in
 * lockstep under WASD / the arrow keys while the camera trails the middle one.
 * Original: https://threejs.org/examples/#webgl_loader_md2_control
 *
 * DEMONSTRATES
 * - `MD2CharacterComplex`: an async multi-resource load (body + weapon + thirteen skin
 *   textures) resolved through one `onLoadComplete` callback, not a promise — genuinely
 *   vanilla setup, kept in a layout effect and explained rather than forced into Suspense
 * - `shareParts()`: twelve clones reuse the base character's loaded geometry/morph targets
 *   and only pick their own skin/weapon — the "load once, skin many" pattern MD2's baked
 *   vertex-morph animation format is built around
 * - Once loaded, each clone's `.root` is a real `Object3D` — `<primitive>` per clone lets
 *   React own mounting instead of manual `scene.add`
 * - drei `<KeyboardControls>` feeding a single shared `controls` object that every clone
 *   reads in its own `update(delta)`, so all thirteen advance identically — the original's
 *   two `switch` key listeners collapse to one key map
 *
 * DIVERGENCE from original
 * - The original parents the camera (via a rotation-cancelling `Gyroscope`) to the middle
 *   character's root so it rides along untouched by that character's own turning.
 *   camera-controls' `setTarget()` gets the same "camera follows the formation" result each
 *   frame without fighting DemoHelpers' shared orbit rig (pattern: `animation-walk`)
 */
import { Suspense, useLayoutEffect, useRef, useState } from 'react';
import { NoToneMapping, RepeatWrapping, SRGBColorSpace } from 'three/webgpu';
import { MD2CharacterComplex } from 'three/addons/misc/MD2CharacterComplex.js';
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu';
import { KeyboardControls, useKeyboardControls, useTexture } from '@react-three/drei/webgpu';
import type CameraControlsImpl from 'camera-controls';
import { DemoHelpers } from '../../utils/DemoHelpers';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/';
const GROUND_URL = `${ASSETS}textures/terrain/grasslight-big.jpg`;

const SKINS = [
  'grok.jpg',
  'ogrobase.png',
  'arboshak.png',
  'ctf_r.png',
  'ctf_b.png',
  'darkam.png',
  'freedom.png',
  'gib.png',
  'gordogh.png',
  'igdosh.png',
  'khorne.png',
  'nabogro.png',
  'sharokh.png',
];

const CONFIG_OGRO = {
  baseUrl: `${ASSETS}models/md2/ogro/`,
  body: 'ogro.md2',
  skins: SKINS,
  weapons: [['weapon.md2', 'weapon.jpg']],
  animations: {
    move: 'run',
    idle: 'stand',
    jump: 'jump',
    attack: 'attack',
    crouchMove: 'cwalk',
    crouchIdle: 'cstand',
    crouchAttach: 'crattack',
  },
  walkSpeed: 350,
  crouchSpeed: 175,
};

const KEYS = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
];
type Key = (typeof KEYS)[number]['name'];

//* Ground =========================================================

function Ground() {
  const maxAnisotropy = useThree((state) => state.renderer.getMaxAnisotropy());
  const map = useTexture(GROUND_URL, (texture) => {
    texture.repeat.set(64, 64);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
  });

  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[16000, 16000]} />
      <meshPhongMaterial color="#ffffff" map={map} />
    </mesh>
  );
}

//* Army ===========================================================

interface OgroArmyProps {
  controlsRef: React.RefObject<CameraControlsImpl | null>;
}

function OgroArmy({ controlsRef }: OgroArmyProps) {
  const [clones, setClones] = useState<MD2CharacterComplex[]>([]);
  const sharedControls = useRef({ moveForward: false, moveBackward: false, moveLeft: false, moveRight: false });
  const [, getKeys] = useKeyboardControls<Key>();

  useLayoutEffect(() => {
    let cancelled = false;
    const army = SKINS.map(() => {
      const character = new MD2CharacterComplex();
      character.scale = 3;
      character.controls = sharedControls.current;
      return character;
    });

    const base = new MD2CharacterComplex();
    base.scale = 3;
    base.onLoadComplete = () => {
      if (cancelled) return;
      army.forEach((clone, i) => {
        clone.shareParts(base);
        clone.enableShadows(true);
        clone.setWeapon(0);
        clone.setSkin(i);
        clone.root.position.x = (i - SKINS.length / 2) * 150;
      });
      setClones(army);
    };
    base.loadParts(CONFIG_OGRO);

    return () => {
      cancelled = true;
    };
  }, []);

  useFrame(({ delta }) => {
    const keys = getKeys();
    Object.assign(sharedControls.current, {
      moveForward: keys.forward,
      moveBackward: keys.backward,
      moveLeft: keys.left,
      moveRight: keys.right,
    });
    for (const character of clones) character.update(delta);

    const leader = clones[Math.floor(SKINS.length / 2)];
    if (leader) controlsRef.current?.setTarget(leader.root.position.x, 50, leader.root.position.z, false);
  });

  return (
    <>
      {clones.map((character, i) => (
        <primitive key={i} object={character.root} />
      ))}
    </>
  );
}

//* Scene ===========================================================

export default function LoaderMd2Control() {
  const controlsRef = useRef<CameraControlsImpl>(null);

  return (
    <KeyboardControls map={KEYS}>
      <Canvas
        renderer={{ toneMapping: NoToneMapping }}
        shadows="percentage"
        background="#ffffff"
        camera={{ position: [0, 150, 1300], fov: 45, near: 1, far: 4000 }}>
        <fog attach="fog" args={['#ffffff', 1000, 4000]} />
        <ambientLight color="#666666" intensity={3} />
        <directionalLight
          color="#ffffff"
          intensity={7}
          position={[200, 450, 500]}
          castShadow
          shadow-mapSize={[1024, 512]}
          shadow-camera-near={100}
          shadow-camera-far={1200}
          shadow-camera-left={-1000}
          shadow-camera-right={1000}
          shadow-camera-top={350}
          shadow-camera-bottom={-350}
        />
        <Ground />
        <Suspense fallback={null}>
          <OgroArmy controlsRef={controlsRef} />
        </Suspense>
        <DemoHelpers grid={false} target={[0, 50, 0]} controlsRef={controlsRef} />
      </Canvas>
    </KeyboardControls>
  );
}
