/**
 * postprocessing-transition
 * Two entirely separate scenes — a blizzard of blue boxes and one of red icosahedra —
 * cross-faded into each other by a threshold over a greyscale wipe texture. Six wipe
 * patterns cycle as the transition ping-pongs back and forth.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_transition
 *
 * DEMONSTRATES
 * - Two scenes in one Canvas, both still authored as ordinary JSX: `createPortal`
 *   fills two plain `THREE.Scene`s (held in lazy `useState`, because the pipeline
 *   callback closes over them once), and each gets its own `pass()`
 * - `transition(passA, passB, wipeTexture, ratio, threshold, useTexture)` — the wipe
 *   texture's red channel thresholded against the mix ratio, which is why the shapes
 *   dissolve in a pattern instead of simply fading
 * - Live knobs through a factory that takes everything as ARGUMENTS: safe here because
 *   `transition()` runs each one through `convertToTexture`/`nodeObject`, both of which
 *   return an existing node untouched — so `useUniforms` nodes and one create-once
 *   `texture()` node (whose `.value` is swapped on selection) all survive by identity
 * - A leva control the ANIMATION writes back into (`useControls(name, () => …)` and
 *   its `set`), so the cycling wipe pattern shows up in the panel — the original's
 *   tween does the same to its GUI
 * - Repeated instances take DATA, not controls: `<FxScene>` is rendered twice from a
 *   two-entry array, with one shared `animateScene` toggle passed down as a prop
 *
 * DIVERGENCE from original
 * - The transition slider is a manual scrub only: when "animate transition" is on the
 *   ping-pong drives the uniform directly rather than writing leva state 60x a second
 *   (the original's tween pushes every frame into its GUI slider, which in React would
 *   mean a re-render per frame).
 * - The original bypasses the pipeline entirely at ratio 0 and 1, calling
 *   `renderer.render()` on the single visible scene to avoid rendering both. Skipping
 *   it costs one extra pass at the two endpoints and saves a render takeover fighting
 *   `useRenderPipeline` for control of the frame.
 */
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { pass, texture } from 'three/tsl';
import { Color, NoToneMapping, Object3D, Scene, SRGBColorSpace } from 'three/webgpu';
import type { InstancedMesh } from 'three/webgpu';
import { transition } from 'three/addons/tsl/display/TransitionNode.js';
import {
  Canvas,
  createPortal,
  useFrame,
  useNodes,
  useRenderPipeline,
  useThree,
  useUniforms,
} from '@react-three/fiber/webgpu';
import { useTexture } from '@react-three/drei/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../utils/DemoHelpers';

const WIPE_URLS = [1, 2, 3, 4, 5, 6].map(
  (i) => `https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/transition/transition${i}.png`,
);
const WIPE_NAMES = { Perlin: 0, Squares: 1, Cells: 2, Distort: 3, Gradient: 4, Radial: 5 };

const COUNT = 500;

// The ping-pong the original runs as a yoyoing TWEEN: hold, sweep, hold, sweep back.
const HOLD_MS = 2000;
const SWEEP_MS = 1500;
const PERIOD_MS = 2 * (HOLD_MS + SWEEP_MS);

// The two scenes, as data — everything that differs between them.
const FX_SCENES = [
  { background: '#ffffff', color: '#0000ff', boxes: true, spin: [0, -0.4, 0] },
  { background: '#000000', color: '#ff0000', boxes: false, spin: [0, 0.2, 0.1] },
] as const;

type FxSceneProps = (typeof FX_SCENES)[number] & { animate: boolean };

//* Scene =========================================================

// One of the two scenes: 500 randomly transformed instances, each tinted a random grey
// on top of the material colour, under an ambient + directional pair.
function FxScene({ background, color, boxes, spin, animate }: FxSceneProps) {
  const meshRef = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new Object3D();
    const tint = new Color();
    for (let i = 0; i < COUNT; i++) {
      dummy.position.set(Math.random() * 100 - 50, Math.random() * 60 - 30, Math.random() * 80 - 40);
      dummy.rotation.set(Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI);
      // Boxes get three independent scales; the icosahedra stay round.
      const scale = Math.random() * 2 + 1;
      dummy.scale.set(scale, boxes ? Math.random() * 2 + 1 : scale, boxes ? Math.random() * 2 + 1 : scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, tint.setScalar(0.1 + 0.9 * Math.random()));
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [boxes]);

  useFrame(({ delta }) => {
    const mesh = meshRef.current;
    if (!mesh || !animate) return;
    mesh.rotation.x += spin[0] * delta;
    mesh.rotation.y += spin[1] * delta;
    mesh.rotation.z += spin[2] * delta;
  });

  return (
    <>
      <color attach="background" args={[background]} />
      <ambientLight color="#aaaaaa" intensity={3} />
      <directionalLight color="#ffffff" intensity={3} position={[0, 1, 4]} />
      <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
        {boxes ? <boxGeometry args={[2, 2, 2]} /> : <icosahedronGeometry args={[1, 1]} />}
        <meshPhongNodeMaterial color={color} flatShading />
      </instancedMesh>
    </>
  );
}

//* Post-processing ===============================================

function TransitionCompose() {
  const [{ animateScene, animateTransition, transitionRatio, useWipeTexture, wipe, cycle, threshold }, setControls] =
    useControls('Transition', () => ({
      animateScene: true,
      animateTransition: true,
      transitionRatio: { value: 0, min: 0, max: 1, step: 0.01, label: 'transition' },
      useWipeTexture: { value: true, label: 'use texture' },
      wipe: { value: 5, options: WIPE_NAMES, label: 'texture' },
      cycle: true,
      threshold: { value: 0.1, min: 0, max: 1, step: 0.01 },
    }));

  const camera = useThree((state) => state.camera);
  const [scenes] = useState(() => [new Scene(), new Scene()] as const);

  const wipeTextures = useTexture(WIPE_URLS, (maps) => {
    for (const map of maps) map.colorSpace = SRGBColorSpace;
  });

  // The scalar knobs are ours, so they are plain useUniforms nodes handed straight to
  // the factory — `nodeObject()` returns them untouched, so later writes still land.
  // `useWipeTexture` is a float 1/0 because that is what TransitionNode compares.
  const uniforms = useUniforms({
    transitionRatio,
    threshold,
    useWipeTexture: useWipeTexture ? 1 : 0,
  });

  // The wipe pattern is a texture, not a scalar — one create-once node whose `.value`
  // is swapped as the selection changes (`convertToTexture` passes it through as-is).
  const { wipeTextureNode } = useNodes(() => ({ wipeTextureNode: texture(wipeTextures[wipe]) }));

  useEffect(() => {
    wipeTextureNode.value = wipeTextures[wipe];
  }, [wipeTextureNode, wipeTextures, wipe]);

  useRenderPipeline(({ renderPipeline }) => {
    renderPipeline.outputNode = transition(
      pass(scenes[0], camera),
      pass(scenes[1], camera),
      wipeTextureNode,
      uniforms.transitionRatio,
      uniforms.threshold,
      uniforms.useWipeTexture,
    );
  });

  // The ping-pong, plus the pattern cycle at each end of a sweep. `sweepsRef` counts
  // completed half-cycles, so the leva selection only gets written when one lands.
  const clockRef = useRef(0);
  const sweepsRef = useRef(0);

  useFrame(({ delta }) => {
    if (!animateTransition) return;
    clockRef.current += delta * 1000;

    const phase = clockRef.current % PERIOD_MS;
    const rising = phase < HOLD_MS + SWEEP_MS;
    const local = (phase % (HOLD_MS + SWEEP_MS)) - HOLD_MS;
    const eased = Math.min(Math.max(local / SWEEP_MS, 0), 1);
    uniforms.transitionRatio.value = rising ? eased : 1 - eased;

    const sweeps = Math.floor(clockRef.current / (HOLD_MS + SWEEP_MS));
    if (cycle && sweeps !== sweepsRef.current) setControls({ wipe: (wipe + 1) % WIPE_URLS.length });
    sweepsRef.current = sweeps;
  });

  return (
    <>
      {createPortal(<FxScene {...FX_SCENES[0]} animate={animateScene} />, scenes[0])}
      {createPortal(<FxScene {...FX_SCENES[1]} animate={animateScene} />, scenes[1])}
    </>
  );
}

export default function PostprocessingTransition() {
  return (
    <Canvas
      // Original never sets a tone mapping (WebGPURenderer default) — fiber's Canvas
      // would otherwise default to ACESFilmic and mute the flat primary colours.
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [0, 0, 20], fov: 50, near: 0.1, far: 100 }}>
      <Suspense fallback={null}>
        <TransitionCompose />
      </Suspense>
      <DemoHelpers grid={false} maxDistance={60} />
    </Canvas>
  );
}
