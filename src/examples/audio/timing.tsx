/**
 * timing
 * Five balls bounce on a shared sine curve; each plays a "ping pong" hit sound the
 * instant it changes direction from falling to rising — sample-accurate timing driven
 * straight off the same `elapsed` clock that animates the bounce.
 * Original: https://threejs.org/examples/#webaudio_timing
 *
 * DEMONSTRATES
 * - One decoded `AudioBuffer` (`useLoader(AudioLoader, url)`, Suspense-friendly) shared
 *   across five `PositionalAudio`s via `setBuffer` — decode once, play from five
 *   different points in space
 * - Direction-change detection in `useFrame` (`ball.position.y` rising vs falling)
 *   triggering `audio.play()` exactly on impact — the original's own timing trick,
 *   ported almost line-for-line since it's driven by the same `state.elapsed` clock
 *   `useFrame` already gives you
 * - `<StartOverlay>`: `AudioContext` needs a real user gesture, so playback (like
 *   every original in this wave) starts behind a click
 */
import { Suspense, useLayoutEffect, useRef, useState } from 'react';
import { AudioListener, AudioLoader, NoToneMapping } from 'three/webgpu';
import type { Mesh, PositionalAudio as PositionalAudioImpl } from 'three/webgpu';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';
import { resumeAudioContext } from '../../utils/resumeAudioContext';
import { StartOverlay } from '../../utils/StartOverlay';

const PING_PONG_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/sounds/ping_pong.mp3';

const COUNT = 5;
const RADIUS = 3;
const SPEED = 2.5;
const HEIGHT = 3;
const OFFSET = 0.5;

function Balls({ listener }: { listener: AudioListener }) {
  const buffer = useLoader(AudioLoader, PING_PONG_URL);
  const ballRefs = useRef<(Mesh | null)[]>([]);
  const audioRefs = useRef<(PositionalAudioImpl | null)[]>([]);
  const wasFalling = useRef<boolean[]>(Array(COUNT).fill(false));

  useLayoutEffect(() => {
    for (const audio of audioRefs.current) audio?.setBuffer(buffer);
  }, [buffer]);

  useFrame(({ elapsed }) => {
    for (let i = 0; i < COUNT; i++) {
      const ball = ballRefs.current[i];
      if (!ball) continue;

      const previousHeight = ball.position.y;
      ball.position.y = Math.abs(Math.sin(i * OFFSET + elapsed * SPEED)) * HEIGHT + 0.3;

      if (ball.position.y < previousHeight) {
        wasFalling.current[i] = true;
      } else if (wasFalling.current[i]) {
        // Direction just flipped from falling to rising: the ball hit the floor.
        audioRefs.current[i]?.play();
        wasFalling.current[i] = false;
      }
    }
  });

  return (
    <>
      {Array.from({ length: COUNT }, (_, i) => {
        const angle = (i / COUNT) * Math.PI * 2;
        return (
          <mesh
            key={i}
            ref={(el) => void (ballRefs.current[i] = el)}
            position={[RADIUS * Math.cos(angle), 0.3, RADIUS * Math.sin(angle)]}
            castShadow>
            <sphereGeometry args={[0.3, 32, 16]} />
            <meshLambertNodeMaterial color="#cccccc" />
            <positionalAudio ref={(el) => void (audioRefs.current[i] = el)} args={[listener]} />
          </mesh>
        );
      })}
    </>
  );
}

function Scene() {
  const camera = useThree((state) => state.camera);
  const [listener] = useState(() => new AudioListener());

  useLayoutEffect(() => {
    camera.add(listener);
    return () => void camera.remove(listener);
  }, [camera, listener]);

  return (
    <>
      <ambientLight color="#cccccc" />
      <directionalLight
        args={['#ffffff', 2.5]}
        position={[0, 5, 5]}
        castShadow
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-camera-near={1}
        shadow-camera-far={20}
        shadow-mapSize={[1024, 1024]}
      />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshLambertNodeMaterial color="#4676b6" />
      </mesh>
      <Suspense fallback={null}>
        <Balls listener={listener} />
      </Suspense>
    </>
  );
}

export default function Timing() {
  return (
    <>
      <Canvas
        renderer={{ toneMapping: NoToneMapping }}
        background="#000000"
        shadows="percentage"
        camera={{ position: [7, 3, 7], fov: 45, near: 0.1, far: 100 }}>
        <Scene />
        <DemoHelpers grid={false} minDistance={1} maxDistance={25} />
      </Canvas>
      <StartOverlay label="Play" hint="sound effect by michorvath" onStart={() => resumeAudioContext()} />
    </>
  );
}
