/**
 * compute-audio
 * Click to decode an MP3 straight into a GPU buffer, then a compute kernel pitch-
 * shifts and echoes it entirely on the GPU — every click after that re-runs the
 * kernel with whatever the sliders currently say and plays the result. The
 * background is a frequency-bar readout of whatever's currently playing.
 * Original: https://threejs.org/examples/#webgpu_compute_audio
 *
 * DEMONSTRATES
 * - GPU audio processing: `instancedArray(waveBuffer)` holds the decoded PCM data,
 *   a `Fn()` compute kernel reads a read-only copy at a pitch-shifted, delay-tapped
 *   index and writes the result — `renderer.compute()` + `renderer.getArrayBufferAsync()`
 *   is the whole GPU→CPU round trip, then a fresh `AudioBufferSourceNode` plays it
 * - A plain unrolled JS `for` loop inside `Fn()` builds SIX echo taps at graph-BUILD
 *   time (not TSL's `Loop()`) — exactly like the original, since the tap count never
 *   needs to be a runtime variable
 * - `scene.backgroundNode` sampling a `DataTexture` fed every frame from
 *   `AnalyserNode.getByteFrequencyData()` — a live spectrum readout of the GPU-processed
 *   audio currently playing, with no geometry in the scene at all
 * - `<StartOverlay>` doing double duty: `AudioContext` needs a user gesture to decode
 *   AND to start compute, so the first click both unblocks audio and kicks off the
 *   one-time MP3 decode; every click after that (the wrapping `onClick`) re-dispatches
 *   the same kernel with the leva sliders' current values
 *
 * DIVERGENCE from original
 * - The compute buffers can't be sized (`instancedArray(waveBuffer)`) until the MP3 is
 *   decoded, so — unlike this wave's other four ports — the Canvas here renders
 *   nothing until the first click resolves, matching the original's own click-gated
 *   `init()` exactly rather than the "scene visible, audio gated" split used elsewhere
 *   in this wave
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { color, Fn, float, instanceIndex, instancedArray, screenUV, texture, vec2 } from 'three/tsl';
import { DataTexture, NoToneMapping, RedFormat } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { Canvas, useBuffers, useFrame, useNodes, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';
import { StartOverlay } from '../../utils/StartOverlay';

const SOUND_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/sounds/webgpu-audio-processing.mp3';

interface DecodedAudio {
  waveBuffer: Float32Array;
  sampleRate: number;
}

function ComputeAudioScene({ waveBuffer, sampleRate, reprocessTick }: DecodedAudio & { reprocessTick: number }) {
  const renderer = useThree((state) => state.renderer);
  const scene = useThree((state) => state.scene);

  //* Controls =====================================================
  const { pitch, delayVolume, delayOffset } = useControls('compute-audio', {
    pitch: { value: 1.5, min: 0.5, max: 2, step: 0.01 },
    delayVolume: { value: 0.2, min: 0, max: 1, step: 0.01, label: 'delay volume' },
    delayOffset: { value: 0.55, min: 0.1, max: 1, step: 0.01, label: 'delay offset' },
  });
  const { uPitch, uDelayVolume, uDelayOffset } = useUniforms(
    { uPitch: pitch, uDelayVolume: delayVolume, uDelayOffset: delayOffset },
    'computeAudio',
  );

  const [analyserBuffer] = useState(() => new Uint8Array(1024));
  const [analyserTexture] = useState(() => new DataTexture(analyserBuffer, analyserBuffer.length, 1, RedFormat));

  //* Compute + background graph ====================================
  const { originalWave, waveArray } = useBuffers(() => {
    const originalWave = instancedArray(waveBuffer).toReadOnly();
    const waveArray = instancedArray(waveBuffer);
    // Required for renderer.getArrayBufferAsync() readback on the WebGL2 fallback.
    originalWave.setPBO(true);
    waveArray.setPBO(true);
    return { originalWave, waveArray };
  }, 'computeAudio');

  const { computeNode, backgroundNode } = useNodes(() => {
    const computeShader = Fn(() => {
      const index = float(instanceIndex);
      const time = index.mul(uPitch);
      // Widened to the fluent base type: `.element()` returns `StorageArrayElementNode`
      // but `.add()` below returns plain `Node<'float'>` — reassigning across
      // iterations needs the wider declared type (house style rule 5 is about props
      // you RECEIVE; this is a node you PRODUCE and keep chaining on).
      let wave: Node<'float'> = originalWave.element(time);

      // Six echo taps, each quieter and further delayed — a plain JS loop unrolled
      // at graph-BUILD time (not TSL's Loop()), exactly like the original.
      for (let i = 1; i < 7; i++) {
        const waveOffset = originalWave.element(index.sub(uDelayOffset.mul(sampleRate).mul(i)).mul(uPitch));
        wave = wave.add(waveOffset.mul(uDelayVolume.div(i * i)));
      }

      waveArray.element(instanceIndex).assign(wave);
    });

    const spectrum = texture(analyserTexture, vec2(screenUV.x, 0)).x.mul(screenUV.y);

    return {
      computeNode: computeShader().compute(waveBuffer.length),
      backgroundNode: color('#0000ff').mul(spectrum),
    };
  }, 'computeAudio');

  // Cast: `@types/three`'s `Scene` doesn't declare `backgroundNode` even though the
  // WebGPU renderer reads it off the live scene (duck-typed *Node gap, UPSTREAM B11).
  useLayoutEffect(() => {
    const withNode = scene as unknown as { backgroundNode: Node | null };
    withNode.backgroundNode = backgroundNode;
    return () => void (withNode.backgroundNode = null);
  }, [scene, backgroundNode]);

  //* Playback ======================================================
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const currentAnalyserRef = useRef<AnalyserNode | null>(null);
  // "Latest run wins" token, not a busy-flag: StrictMode's mount→cleanup→remount
  // fires this effect twice back to back, and a busy-flag guard (checked, then
  // cleared in the FIRST run's `finally`) let the first run's cleanup cancel itself
  // right as the SECOND run's guard check saw "busy" and bailed out entirely — net
  // result, neither run ever finished and `currentAnalyserRef` stayed null forever
  // (found via a permanently frozen background — no console error, since nothing
  // throws). A token supersedes the outcome instead of blocking re-entry: whichever
  // run's token is still current when its readback resolves is the one that applies.
  const runTokenRef = useRef(0);

  // Runs once at mount (reprocessTick starts at 0 — the original's own initial
  // `playAudioBuffer()` call at the end of init()) and again on every later click.
  useEffect(() => {
    const token = ++runTokenRef.current;

    (async () => {
      currentSourceRef.current?.stop();

      renderer.compute(computeNode);
      const wave = new Float32Array(await renderer.getArrayBufferAsync(waveArray.value));
      if (runTokenRef.current !== token) return; // superseded by a newer run

      const outputContext = new AudioContext({ sampleRate });
      const outputBuffer = outputContext.createBuffer(1, wave.length, sampleRate);
      outputBuffer.copyToChannel(wave, 0);

      const source = outputContext.createBufferSource();
      source.buffer = outputBuffer;
      source.connect(outputContext.destination);
      source.start();
      currentSourceRef.current = source;

      const analyser = outputContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      currentAnalyserRef.current = analyser;
    })();
  }, [renderer, computeNode, waveArray, sampleRate, reprocessTick]);

  useFrame(() => {
    const analyser = currentAnalyserRef.current;
    if (!analyser) return;
    analyser.getByteFrequencyData(analyserBuffer);
    analyserTexture.needsUpdate = true;
  });

  return null;
}

export default function ComputeAudio() {
  const [decoded, setDecoded] = useState<DecodedAudio | null>(null);
  const [reprocessTick, setReprocessTick] = useState(0);

  return (
    <div
      style={{ width: '100%', height: '100%' }}
      onClick={() => {
        // Re-dispatch on every click after the first — the initial click is
        // handled by <StartOverlay>'s onStart below, and `decoded` is still null
        // while that decode is in flight, so this is a no-op until it resolves.
        if (!decoded) return;
        setReprocessTick((tick) => tick + 1);
      }}>
      <Canvas renderer={{ toneMapping: NoToneMapping }} camera={{ fov: 45, near: 0.01, far: 30 }}>
        {decoded && <ComputeAudioScene {...decoded} reprocessTick={reprocessTick} />}
        <DemoHelpers grid={false} controls={false} />
      </Canvas>
      <StartOverlay
        label="Play"
        hint="Click on screen to process the audio using WebGPU."
        onStart={async () => {
          const soundBuffer = await fetch(SOUND_URL).then((res) => res.arrayBuffer());
          const audioContext = new AudioContext();
          const audioBuffer = await audioContext.decodeAudioData(soundBuffer);
          const channel = audioBuffer.getChannelData(0);
          // Extra trailing silence gives the delay/pitch taps room to read past the
          // clip's natural end.
          const waveBuffer = new Float32Array([...channel, ...new Float32Array(200000)]);
          // Matches the original exactly — this sets the OUTPUT AudioContext's sample
          // rate, which is what actually determines playback pitch.
          const sampleRate = audioBuffer.sampleRate / audioBuffer.numberOfChannels;
          setDecoded({ waveBuffer, sampleRate });
        }}
      />
    </div>
  );
}
