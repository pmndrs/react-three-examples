/**
 * sandbox
 * Three glowing spheres each broadcast their own positional track — two streamed
 * loops and one live oscillator — while a fourth, non-positional track plays as
 * ambient background. Walk between them with WASD + mouse to hear the mix change.
 * Original: https://threejs.org/examples/#webaudio_sandbox
 *
 * DEMONSTRATES
 * - One shared `AudioListener` feeding three `PositionalAudio`s (two streamed via
 *   `setMediaElementSource`, one a raw `OscillatorNode` via `setNodeSource`) plus a
 *   non-positional ambient `Audio` — all wired up imperatively, since the Web Audio
 *   API these calls belong to has no JSX surface to begin with
 * - `AudioAnalyser.getAverageFrequency()` per sphere driving `material.emissive.b`
 *   live in `useFrame` — the loudness-reactive material the original's `animate()` does
 * - leva controls mapped onto imperative audio nodes (`listener.setMasterVolume`,
 *   `oscillator.frequency.setValueAtTime`, …) rather than a TSL uniform — the
 *   original's own GUI, kept because it had one (house style rule 4)
 * - drei's `<FirstPersonControls>` in place of `<DemoHelpers>`'s orbit rig — the demo
 *   is specifically about walking a 500-unit soundscape, which an orbit rig can't do;
 *   `<DemoHelpers controls={false} grid={false}>` still supplies the readiness signal
 *
 * DIVERGENCE from original
 * - The ground `GridHelper` is rebuilt at the original's own 1000-unit size (drei's
 *   default `<Grid>` fades out well before these distances)
 */
import { useRef, useState } from 'react';
import { NoToneMapping } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import { FirstPersonControls } from '@react-three/drei/webgpu';
import { DemoHelpers } from '../../../utils/DemoHelpers';
import { resumeAudioContext } from '../../../utils/resumeAudioContext';
import { StartOverlay } from '../../../utils/StartOverlay';
import { SoundSpheres, type AudioElementRefs } from './SoundSpheres';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples';
const SONG_OGG = `${ASSETS}/sounds/358232_j_s_song.ogg`;
const SONG_MP3 = `${ASSETS}/sounds/358232_j_s_song.mp3`;
const SKULLBEATZ_OGG = `${ASSETS}/sounds/376737_Skullbeatz___Bad_Cat_Maste.ogg`;
const SKULLBEATZ_MP3 = `${ASSETS}/sounds/376737_Skullbeatz___Bad_Cat_Maste.mp3`;
const UTOPIA_OGG = `${ASSETS}/sounds/Project_Utopia.ogg`;
const UTOPIA_MP3 = `${ASSETS}/sounds/Project_Utopia.mp3`;

export default function Sandbox() {
  const songRef = useRef<HTMLAudioElement>(null);
  const skullbeatzRef = useRef<HTMLAudioElement>(null);
  const utopiaRef = useRef<HTMLAudioElement>(null);
  const [started, setStarted] = useState(false);

  const elements: AudioElementRefs = { song: songRef, skullbeatz: skullbeatzRef, utopia: utopiaRef };

  return (
    <>
      {/* Live outside <Canvas> — a bare <audio> tag inside it would resolve against
          the THREE namespace instead of the DOM (see `orientation`). crossOrigin is
          required for MediaElementAudioSource to output real (rather than silently
          zeroed) samples once routed through the Web Audio graph. */}
      <audio ref={songRef} crossOrigin="anonymous" preload="auto" style={{ display: 'none' }}>
        <source src={SONG_OGG} type="audio/ogg" />
        <source src={SONG_MP3} type="audio/mpeg" />
      </audio>
      <audio ref={skullbeatzRef} crossOrigin="anonymous" preload="auto" style={{ display: 'none' }}>
        <source src={SKULLBEATZ_OGG} type="audio/ogg" />
        <source src={SKULLBEATZ_MP3} type="audio/mpeg" />
      </audio>
      <audio ref={utopiaRef} crossOrigin="anonymous" loop preload="auto" style={{ display: 'none' }}>
        <source src={UTOPIA_OGG} type="audio/ogg" />
        <source src={UTOPIA_MP3} type="audio/mpeg" />
      </audio>
      <Canvas
        renderer={{ toneMapping: NoToneMapping }}
        background="#000000"
        // rotation: [0,0,0] suppresses fiber's default `camera.lookAt(0,0,0)` — with a
        // camera sat 25 units directly above the origin, that quirk points it almost
        // straight down instead of level. Worse here than most: `<FirstPersonControls>`
        // reads the camera's rotation AT CONSTRUCTION to seed its own look direction
        // (`_setOrientation()`), so the poisoned rotation wasn't just the first frame —
        // it became permanent (found via a solid-black screenshot with no console error).
        camera={{ position: [0, 25, 0], rotation: [0, 0, 0], fov: 50, near: 1, far: 10000 }}>
        <fogExp2 attach="fog" args={['#000000', 0.0025]} />
        <SoundSpheres started={started} elements={elements} />
        <FirstPersonControls movementSpeed={70} lookSpeed={0.05} lookVertical={false} />
        <DemoHelpers grid={false} controls={false} />
      </Canvas>
      <StartOverlay
        label="Play"
        hint="navigate with WASD / arrows / mouse"
        onStart={() => {
          resumeAudioContext();
          songRef.current?.play();
          skullbeatzRef.current?.play();
          utopiaRef.current?.play();
          setStarted(true);
        }}
      />
    </>
  );
}
