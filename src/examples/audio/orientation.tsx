/**
 * orientation
 * A BoomBox model plays a looping track through a `PositionalAudio`, damped as you
 * orbit it behind a translucent red wall — the green/yellow helper cone shows the
 * `setDirectionalCone` volume falloff the wall is demonstrating.
 * Original: https://threejs.org/examples/#webaudio_orientation
 *
 * DEMONSTRATES
 * - `AudioListener` attached to the camera via a plain `useLayoutEffect`
 *   (`camera.add(listener)`) — it has no visible geometry of its own, so there's
 *   nothing for JSX to express beyond the imperative attach/detach
 * - `PositionalAudio` streamed from a hidden HTML `<audio loop>` element via
 *   `setMediaElementSource` (matches the original — a full `AudioLoader` decode isn't
 *   needed for a looping background track) and `PositionalAudioHelper` visualizing the
 *   directional cone, both wired up imperatively for the same reason
 * - `<StartOverlay>`: `AudioContext` needs a real user gesture, so the demo (like
 *   every original in this wave) starts behind a click
 * - `useLayoutEffect` + a `userData` guard on the loaded (Suspense-cached, so
 *   StrictMode-remounted) BoomBox scene, instead of a `useMemo` mutation — the
 *   pattern `shadowmap-progressive` already uses for one-time GLTF setup
 */
import { Suspense, useLayoutEffect, useRef, useState } from 'react';
import { AudioListener, NoToneMapping } from 'three/webgpu';
import type { Mesh, MeshStandardMaterial, PositionalAudio as PositionalAudioImpl } from 'three/webgpu';
import { PositionalAudioHelper } from 'three/addons/helpers/PositionalAudioHelper.js';
import { Canvas, useThree } from '@react-three/fiber/webgpu';
import { useCubeTexture, useGLTF } from '@react-three/drei/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';
import { resumeAudioContext } from '../../utils/resumeAudioContext';
import { StartOverlay } from '../../utils/StartOverlay';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples';
const CUBE_PATH = `${ASSETS}/textures/cube/SwedishRoyalCastle/`;
const CUBE_FILES = ['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'];
const BOOMBOX_URL = `${ASSETS}/models/gltf/BoomBox.glb`;
const MUSIC_OGG = `${ASSETS}/sounds/376737_Skullbeatz___Bad_Cat_Maste.ogg`;
const MUSIC_MP3 = `${ASSETS}/sounds/376737_Skullbeatz___Bad_Cat_Maste.mp3`;

function BoomBox({
  listener,
  musicRef,
}: {
  listener: AudioListener;
  musicRef: React.RefObject<HTMLAudioElement | null>;
}) {
  const reflectionCube = useCubeTexture(CUBE_FILES, { path: CUBE_PATH });
  const { scene } = useGLTF(BOOMBOX_URL);
  const positionalAudioRef = useRef<PositionalAudioImpl>(null);

  // One-time model setup (envMap, geometry orientation, shadow casting). The GLTF
  // scene is Suspense-cached and shared, so mutate it in an effect guarded by a
  // userData flag rather than a useMemo (AGENTS.md; pattern: shadowmap-progressive).
  useLayoutEffect(() => {
    if (scene.userData.orientationSetup) return;
    scene.userData.orientationSetup = true;
    scene.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      (mesh.material as MeshStandardMaterial).envMap = reflectionCube;
      mesh.geometry.rotateY(-Math.PI);
      mesh.castShadow = true;
    });
  }, [scene, reflectionCube]);

  // Wire the positional audio to the streaming <audio> element and add the
  // directional-cone helper — both imperative three.js APIs with no JSX surface.
  useLayoutEffect(() => {
    const music = musicRef.current;
    const audio = positionalAudioRef.current;
    if (!music || !audio) return;
    // A browser will only ever create ONE MediaElementSourceNode per <audio> element
    // — a second call throws "already connected to a different MediaElementSourceNode",
    // and StrictMode's mount→cleanup→remount would otherwise trigger exactly that on
    // the SAME persisted DOM element. `setMediaElementSource` flips `hasPlaybackControl`
    // to false, and `positionalAudioRef.current` stays the same instance across that
    // remount, so checking it here is enough of a guard.
    if (audio.hasPlaybackControl) {
      audio.setMediaElementSource(music);
      audio.setRefDistance(1);
      audio.setDirectionalCone(180, 230, 0.1);
    }
    const helper = new PositionalAudioHelper(audio, 0.1);
    audio.add(helper);
    return () => {
      audio.remove(helper);
      helper.dispose();
    };
  }, [musicRef]);

  return (
    <primitive object={scene} position={[0, 0.2, 0]} scale={20}>
      <positionalAudio ref={positionalAudioRef} args={[listener]} />
    </primitive>
  );
}

function Scene({ musicRef }: { musicRef: React.RefObject<HTMLAudioElement | null> }) {
  const camera = useThree((state) => state.camera);
  // Plain CPU-side object, not GPU-bound — lazy useState keeps it identity-stable.
  const [listener] = useState(() => new AudioListener());

  useLayoutEffect(() => {
    camera.add(listener);
    return () => void camera.remove(listener);
  }, [camera, listener]);

  return (
    <>
      <hemisphereLight args={['#ffffff', '#8d8d8d', 3]} position={[0, 20, 0]} />
      <directionalLight
        args={['#ffffff', 3]}
        position={[5, 5, 0]}
        castShadow
        shadow-camera-top={1}
        shadow-camera-bottom={-1}
        shadow-camera-left={-1}
        shadow-camera-right={1}
        shadow-camera-near={0.1}
        shadow-camera-far={20}
      />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshPhongNodeMaterial color="#cbcbcb" depthWrite={false} />
      </mesh>
      {/* Sound is damped behind this wall — the helper cone shows why. */}
      <mesh position={[0, 0.5, -0.5]}>
        <boxGeometry args={[2, 1, 0.1]} />
        <meshBasicNodeMaterial color="#ff0000" transparent opacity={0.5} />
      </mesh>
      <Suspense fallback={null}>
        <BoomBox listener={listener} musicRef={musicRef} />
      </Suspense>
    </>
  );
}

export default function Orientation() {
  const musicRef = useRef<HTMLAudioElement>(null);

  return (
    <>
      {/* Lives outside <Canvas> — R3F would otherwise resolve a bare <audio> tag
          against the THREE namespace instead of the DOM (AGENTS.md `<threeLine>`-
          style collision), and a real HTMLAudioElement is what setMediaElementSource
          streams from. */}
      <audio ref={musicRef} crossOrigin="anonymous" loop preload="auto" style={{ display: 'none' }}>
        <source src={MUSIC_OGG} type="audio/ogg" />
        <source src={MUSIC_MP3} type="audio/mpeg" />
      </audio>
      <Canvas
        renderer={{ toneMapping: NoToneMapping }}
        background="#a0a0a0"
        shadows="percentage"
        camera={{ position: [3, 2, 3], fov: 45, near: 0.1, far: 100 }}>
        <fog attach="fog" args={['#a0a0a0', 2, 20]} />
        <Scene musicRef={musicRef} />
        <DemoHelpers target={[0, 0.1, 0]} minDistance={0.5} maxDistance={10} maxPolarAngle={0.5 * Math.PI} />
      </Canvas>
      <StartOverlay
        label="Play"
        hint="music by skullbeatz"
        onStart={() => {
          resumeAudioContext();
          musicRef.current?.play();
        }}
      />
    </>
  );
}
