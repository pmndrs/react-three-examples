/**
 * visualizer
 * A frequency bar graph painted straight onto the background — no geometry, no
 * camera trick, just an `AudioAnalyser` feeding a 1D texture that a TSL background
 * node samples per pixel.
 * Original: https://threejs.org/examples/#webaudio_visualizer
 *
 * DEMONSTRATES
 * - `scene.backgroundNode`: a fullscreen TSL shader with nothing else in the scene —
 *   the idiomatic WebGPU replacement for the original's bare `THREE.Camera()` +
 *   unit-quad trick, which existed only to fake a fullscreen pass on WebGL
 * - `AudioAnalyser.data` is the SAME `Uint8Array` the `DataTexture` wraps, so
 *   `getFrequencyData()` in `useFrame` followed by `needsUpdate = true` is the entire
 *   per-frame update — no copy step
 * - `<StartOverlay>`: `AudioContext` needs a real user gesture, so playback (like
 *   every original in this wave) starts behind a click
 *
 * DIVERGENCE from original
 * - No camera controls: the original has none either (a fullscreen effect has
 *   nothing to orbit), so `<DemoHelpers grid={false} controls={false}>` only
 *   supplies the readiness signal
 * - The original's iOS branch (decode via `AudioLoader` instead of streaming a
 *   `<audio>` element, because iOS historically blocked `MediaElementSource`) is
 *   dropped — this corpus targets desktop Chromium, and streaming is the same
 *   technique either way
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { color, mix, screenUV, step, texture, vec2 } from 'three/tsl';
import { Audio, AudioAnalyser, AudioListener, DataTexture, RedFormat } from 'three/webgpu';
import { Canvas, useFrame, useNodes, useThree } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';
import { resumeAudioContext } from '../../utils/resumeAudioContext';
import { StartOverlay } from '../../utils/StartOverlay';

const MUSIC_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/sounds/376737_Skullbeatz___Bad_Cat_Maste.mp3';
const FFT_SIZE = 128;

function VisualizerBackground({ audioRef }: { audioRef: React.RefObject<HTMLAudioElement | null> }) {
  const scene = useThree((state) => state.scene);

  // Plain CPU-side Web Audio + typed-array objects, none of it GPU-bound — lazy
  // useState keeps each identity-stable across a StrictMode re-render.
  const [listener] = useState(() => new AudioListener());
  const [audio] = useState(() => new Audio(listener));
  const [analyser] = useState(() => new AudioAnalyser(audio, FFT_SIZE));
  // Wraps `analyser.data` directly — getFrequencyData() below writes into this same
  // buffer, so there's no separate copy step, exactly like the original.
  const [dataTexture] = useState(() => new DataTexture(analyser.data, FFT_SIZE / 2, 1, RedFormat));

  useLayoutEffect(() => {
    const music = audioRef.current;
    // A browser will only ever create ONE MediaElementSourceNode per <audio> element
    // — a second call throws "already connected to a different MediaElementSourceNode".
    // `setMediaElementSource` flips `hasPlaybackControl` to false, and both `audio`
    // and the DOM element stay the same instances across StrictMode's
    // mount→cleanup→remount, so checking it here is enough of a guard.
    if (!music || !audio.hasPlaybackControl) return;
    audio.setMediaElementSource(music);
  }, [audio, audioRef]);

  const { backgroundNode } = useNodes(() => {
    const f = texture(dataTexture, vec2(screenUV.x, 0)).r;
    // One pixel-row-thin bar per column, at height `f` — a step-in-step-out band.
    const bar = step(screenUV.y, f).mul(step(f.sub(0.0125), screenUV.y));
    return { backgroundNode: mix(color('#202020'), color('#ffff00'), bar) };
  }, 'visualizer');

  // `@types/three` declares `backgroundNode` on `Scene` directly (0.185.1), so no
  // cast is needed.
  useLayoutEffect(() => {
    const withNode = scene;
    withNode.backgroundNode = backgroundNode;
    return () => void (withNode.backgroundNode = null);
  }, [scene, backgroundNode]);

  useFrame(() => {
    analyser.getFrequencyData();
    dataTexture.needsUpdate = true;
  });

  return null;
}

export default function Visualizer() {
  const audioRef = useRef<HTMLAudioElement>(null);

  return (
    <>
      {/* Lives outside <Canvas> — a bare <audio> tag inside it would resolve against
          the THREE namespace instead of the DOM (see `orientation`). */}
      {/* crossOrigin is required for MediaElementAudioSource to output real (rather
          than zeroed) samples into the analyser — the browser only honours the CDN's
          CORS headers when the element itself requested in CORS mode. */}
      <audio ref={audioRef} crossOrigin="anonymous" preload="auto" style={{ display: 'none' }}>
        <source src={MUSIC_URL} type="audio/mpeg" />
      </audio>
      <Canvas renderer background="#202020">
        <VisualizerBackground audioRef={audioRef} />
        <DemoHelpers grid={false} controls={false} />
      </Canvas>
      <StartOverlay
        label="Play"
        hint="music by skullbeatz"
        onStart={() => {
          resumeAudioContext();
          audioRef.current?.play();
        }}
      />
    </>
  );
}
