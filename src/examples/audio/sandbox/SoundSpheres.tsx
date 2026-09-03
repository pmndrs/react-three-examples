// The scene content: three positional-audio spheres, the shared listener/oscillator/
// ambient track, leva's volume + oscillator GUI, and the loudness-reactive emissive
// material. Split out of sandbox.tsx (AGENTS.md ~200-line guideline) — this is the
// Canvas-child half; sandbox.tsx owns the outer wrapper, the streaming <audio>
// elements and <StartOverlay>.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Audio, AudioAnalyser, AudioListener } from 'three/webgpu';
import type { MeshPhongNodeMaterial, PositionalAudio as PositionalAudioImpl } from 'three/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import { folder, useControls } from 'leva';

export interface AudioElementRefs {
  song: React.RefObject<HTMLAudioElement | null>;
  skullbeatz: React.RefObject<HTMLAudioElement | null>;
  utopia: React.RefObject<HTMLAudioElement | null>;
}

export function SoundSpheres({ started, elements }: { started: boolean; elements: AudioElementRefs }) {
  const camera = useThree((state) => state.camera);

  // Plain CPU-side Web Audio objects — lazy useState keeps each identity-stable
  // across a StrictMode re-render (none of this is GPU-bound).
  const [listener] = useState(() => new AudioListener());
  const [oscillator] = useState(() => {
    const osc = listener.context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(144, listener.context.currentTime);
    return osc;
  });
  const [ambient] = useState(() => new Audio(listener));

  useLayoutEffect(() => {
    camera.add(listener);
    return () => void camera.remove(listener);
  }, [camera, listener]);

  // Oscillators can only ever be started once — gate it behind the click overlay,
  // same as the original's own click-gated `oscillator.start(0)`.
  const oscillatorStarted = useRef(false);
  useEffect(() => {
    if (!started || oscillatorStarted.current) return;
    oscillatorStarted.current = true;
    oscillator.start(0);
  }, [started, oscillator]);

  const material1Ref = useRef<MeshPhongNodeMaterial>(null);
  const material2Ref = useRef<MeshPhongNodeMaterial>(null);
  const material3Ref = useRef<MeshPhongNodeMaterial>(null);
  const sound1Ref = useRef<PositionalAudioImpl>(null);
  const sound2Ref = useRef<PositionalAudioImpl>(null);
  const sound3Ref = useRef<PositionalAudioImpl>(null);
  const analysersRef = useRef<{ a1: AudioAnalyser; a2: AudioAnalyser; a3: AudioAnalyser } | null>(null);

  // One-time wiring: media sources, the oscillator node source, and the analysers
  // driving the emissive reaction. The three spheres always mount (nothing here is
  // behind Suspense), so the refs are populated by the time this runs.
  //
  // Guarded by `hasPlaybackControl` (flips to false once a source is set): a browser
  // will only ever create ONE MediaElementSourceNode per <audio> element — a second
  // call throws "already connected to a different MediaElementSourceNode" — and
  // StrictMode's mount→cleanup→remount would otherwise trigger exactly that on the
  // SAME persisted DOM elements and PositionalAudio instances.
  useLayoutEffect(() => {
    const song = elements.song.current;
    const skullbeatz = elements.skullbeatz.current;
    const sound1 = sound1Ref.current;
    const sound2 = sound2Ref.current;
    const sound3 = sound3Ref.current;
    if (!song || !skullbeatz || !sound1 || !sound2 || !sound3) return;

    if (sound1.hasPlaybackControl) {
      sound1.setMediaElementSource(song);
      sound1.setRefDistance(20);
    }
    if (sound2.hasPlaybackControl) {
      sound2.setMediaElementSource(skullbeatz);
      sound2.setRefDistance(20);
    }
    if (sound3.hasPlaybackControl) {
      sound3.setNodeSource(oscillator);
      sound3.setRefDistance(20);
      sound3.setVolume(0.5);
    }

    analysersRef.current ??= {
      a1: new AudioAnalyser(sound1, 32),
      a2: new AudioAnalyser(sound2, 32),
      a3: new AudioAnalyser(sound3, 32),
    };
  }, [elements, oscillator]);

  useLayoutEffect(() => {
    const utopia = elements.utopia.current;
    if (!utopia || !ambient.hasPlaybackControl) return;
    ambient.setMediaElementSource(utopia);
    ambient.setVolume(0.5);
  }, [ambient, elements]);

  //* Controls =====================================================
  const { master, firstSphere, secondSphere, thirdSphere, ambientVolume, frequency, wavetype } = useControls(
    'sandbox',
    {
      'sound volume': folder({
        master: { value: 1, min: 0, max: 1, step: 0.01 },
        firstSphere: { value: 1, min: 0, max: 1, step: 0.01, label: 'first sphere' },
        secondSphere: { value: 1, min: 0, max: 1, step: 0.01, label: 'second sphere' },
        thirdSphere: { value: 1, min: 0, max: 1, step: 0.01, label: 'third sphere' },
        ambientVolume: { value: 0.5, min: 0, max: 1, step: 0.01, label: 'ambient' },
      }),
      'sound generator': folder({
        frequency: { value: 144, min: 50, max: 5000, step: 1 },
        wavetype: { value: 'sine', options: ['sine', 'square', 'sawtooth', 'triangle'] },
      }),
    },
  );

  useEffect(() => void listener.setMasterVolume(master), [listener, master]);
  useEffect(() => void sound1Ref.current?.setVolume(firstSphere), [firstSphere]);
  useEffect(() => void sound2Ref.current?.setVolume(secondSphere), [secondSphere]);
  useEffect(() => void sound3Ref.current?.setVolume(thirdSphere), [thirdSphere]);
  useEffect(() => void ambient.setVolume(ambientVolume), [ambient, ambientVolume]);
  useEffect(
    () => void oscillator.frequency.setValueAtTime(frequency, oscillator.context.currentTime),
    [oscillator, frequency],
  );
  useEffect(() => {
    oscillator.type = wavetype as OscillatorType;
  }, [oscillator, wavetype]);

  useFrame(() => {
    const analysers = analysersRef.current;
    if (!analysers) return;
    if (material1Ref.current) material1Ref.current.emissive.b = analysers.a1.getAverageFrequency() / 256;
    if (material2Ref.current) material2Ref.current.emissive.b = analysers.a2.getAverageFrequency() / 256;
    if (material3Ref.current) material3Ref.current.emissive.b = analysers.a3.getAverageFrequency() / 256;
  });

  return (
    <>
      <directionalLight args={['#ffffff', 3]} position={[0, 0.5, 1]} />
      <gridHelper args={[1000, 10, '#444444', '#444444']} position-y={0.1} />

      <mesh position={[-250, 30, 0]}>
        <sphereGeometry args={[20, 32, 16]} />
        <meshPhongNodeMaterial ref={material1Ref} color="#ffaa00" flatShading shininess={0} />
        <positionalAudio ref={sound1Ref} args={[listener]} />
      </mesh>
      <mesh position={[250, 30, 0]}>
        <sphereGeometry args={[20, 32, 16]} />
        <meshPhongNodeMaterial ref={material2Ref} color="#ff2200" flatShading shininess={0} />
        <positionalAudio ref={sound2Ref} args={[listener]} />
      </mesh>
      <mesh position={[0, 30, -250]}>
        <sphereGeometry args={[20, 32, 16]} />
        <meshPhongNodeMaterial ref={material3Ref} color="#6622aa" flatShading shininess={0} />
        <positionalAudio ref={sound3Ref} args={[listener]} />
      </mesh>
    </>
  );
}
