/**
 * texture-lottie
 * A rounded box wearing a live Lottie vector animation as its texture map, with a
 * scrubber to pause and step through the animation frame by frame.
 * Original: https://threejs.org/examples/#webgl_loader_texture_lottie
 *
 * DEMONSTRATES
 * - `lottie-web` rendering an animation to an off-DOM `<canvas>`, wrapped in a plain
 *   `CanvasTexture` and re-uploaded to the GPU on the animation's `enterFrame` event —
 *   the same "one imperative `needsUpdate = true` line" idiom as `materials-texture-canvas`
 * - Why this stays imperative: lottie-web measures its container's `offsetWidth`/
 *   `offsetHeight` to size the canvas, which only exist once the container is attached
 *   to the DOM — there is no declarative way to hand it a detached element
 * - A DOM range input as a real playback scrubber (not a leva debug slider — it's the
 *   demo's own control, kept as a plain overlay per the `materials-texture-canvas` pattern)
 * - RoomEnvironment -> `PMREMGenerator.fromScene` IBL as the scene's only light, same
 *   shape as `materials-alphahash`
 *
 * DIVERGENCE from original
 * - The original loads `lottie-web` from a CDN import map; here it's an installed
 *   dependency (AGENTS.md § Repo format: an ordinary library gets installed, the CDN
 *   form is reserved for unshipped-browser-API polyfills)
 */
import { useEffect, useRef, useState } from 'react';
import { CanvasTexture, NearestFilter, PMREMGenerator, SRGBColorSpace } from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Canvas, useThree } from '@react-three/fiber/webgpu';
import type { AnimationItem } from 'lottie-web';
import lottie from 'lottie-web';

import '../../assets/RoundedBoxGeometry';
import { DemoHelpers } from '../../utils/DemoHelpers';

const LOTTIE_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/lottie/24017-lottie-logo-animation.json';

//* Lottie asset ===================================================

interface LottieAsset {
  texture: CanvasTexture;
  animation: AnimationItem;
}

// Fetches the Lottie JSON, plays it into a hidden off-DOM <canvas> via lottie-web, and
// wraps that canvas in a CanvasTexture kept fresh on every animation frame. Mirrors the
// original almost line for line — the container-measurement requirement (see header)
// keeps this in an effect rather than a fiber loader hook.
function useLottieAsset(url: string): LottieAsset | null {
  const [asset, setAsset] = useState<LottieAsset | null>(null);

  useEffect(() => {
    let cancelled = false;
    let container: HTMLDivElement | null = null;
    let animation: AnimationItem | null = null;

    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;

        // lottie-web reads container.offsetWidth/offsetHeight to size its canvas.
        const dpr = window.devicePixelRatio;
        container = document.createElement('div');
        container.style.width = `${data.w * dpr}px`;
        container.style.height = `${data.h * dpr}px`;
        document.body.appendChild(container);

        animation = lottie.loadAnimation<'canvas'>({
          container,
          renderer: 'canvas',
          loop: true,
          autoplay: true,
          animationData: data,
          rendererSettings: { dpr },
        });

        // lottie-web's `.d.ts` declares AnimationItem without the `container` field it
        // sets at runtime (verified against the published `player/js/main.js`) — same
        // family as AGENTS.md's `@types/three` gaps, cast rather than reached around.
        const canvas = (animation as AnimationItem & { container: HTMLCanvasElement }).container;
        const texture = new CanvasTexture(canvas);
        texture.minFilter = NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = SRGBColorSpace;

        animation.addEventListener('enterFrame', () => {
          texture.needsUpdate = true;
        });

        // Must happen after loadAnimation() — before that the container has 0 size.
        container.style.display = 'none';

        setAsset({ texture, animation });
      });

    return () => {
      cancelled = true;
      animation?.destroy();
      container?.remove();
      setAsset((current) => {
        current?.texture.dispose();
        return null;
      });
    };
  }, [url]);

  return asset;
}

//* Scene ==========================================================

// RoomEnvironment -> PMREM -> scene.environment: the scene's only light source
// (matches the original — no analytical lights).
function RoomEnv() {
  const renderer = useThree((state) => state.renderer);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const environment = new RoomEnvironment();
    const pmremGenerator = new PMREMGenerator(renderer);
    const envRT = pmremGenerator.fromScene(environment, 0.04);
    scene.environment = envRT.texture;
    environment.dispose();
    pmremGenerator.dispose();
    return () => {
      scene.environment = null;
      envRT.dispose();
    };
  }, [renderer, scene]);

  return null;
}

//* Scrubber (DOM) =================================================

interface ScrubberProps {
  animation: AnimationItem;
}

// A real playback control, not a debug slider — kept as a plain DOM overlay per the
// `materials-texture-canvas` precedent. The input's value is written directly via ref on
// every `enterFrame` rather than through React state, so scrubbing doesn't re-render.
function Scrubber({ animation }: ScrubberProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.max = String(animation.totalFrames);

    const unsubscribe = animation.addEventListener('enterFrame', () => {
      input.value = String(animation.currentFrame);
    });
    return unsubscribe;
  }, [animation]);

  return (
    <input
      ref={inputRef}
      type="range"
      defaultValue={0}
      style={{ position: 'absolute', bottom: 16, left: 16, width: 300, zIndex: 10 }}
      onPointerDown={() => animation.pause()}
      onPointerUp={() => animation.play()}
      onInput={(event) => animation.goToAndStop(parseFloat(event.currentTarget.value), true)}
    />
  );
}

//* Root ===========================================================

export default function TextureLottie() {
  const asset = useLottieAsset(LOTTIE_URL);

  return (
    <>
      <Canvas
        // The original explicitly sets ACESFilmic, which already matches fiber's Canvas
        // default — nothing to override.
        background="#111111"
        camera={{ position: [0, 0, 2.5], fov: 50, near: 0.1, far: 10 }}>
        <RoomEnv />
        {asset && (
          <mesh>
            <roundedBoxGeometry args={[1, 1, 1, 7, 0.1]} />
            <meshStandardNodeMaterial roughness={0} map={asset.texture} />
          </mesh>
        )}
        <DemoHelpers grid={false} autoRotate autoRotateSpeed={2} />
      </Canvas>
      {asset && <Scrubber animation={asset.animation} />}
    </>
  );
}
