/**
 * materials-texture-html
 * R3F port of three.js `webgpu_materials_texture_html`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materials_texture_html (~184 lines
 * of JS)
 *
 * A box textured with a LIVE, interactive HTML element — formatted text, an inline
 * image, inline SVG, an RTL span, vertical CJK text, and a real `<input>`/`<button>` —
 * via the experimental HTML-in-Canvas browser API and `THREE.HTMLTexture`.
 *
 * DEMONSTRATES
 * - `THREE.HTMLTexture`: a `Texture` whose `image` is a live `HTMLElement`. The
 *   renderer itself (not this code) appends that element as a child of the CANVAS
 *   the first time the texture is bound (`Textures.js`), then repaints it on the
 *   canvas's `paint` events — the mesh literally renders whatever the browser last
 *   rasterized that DOM subtree to
 * - The HTML-in-Canvas API is unshipped in stable browsers today, so — exactly like
 *   the original — this loads `three-html-render`'s polyfill from a CDN, gated
 *   behind the same feature check the original uses
 *   (`'requestPaint' in HTMLCanvasElement.prototype`)
 * - `InteractionManager` (three/addons): keeps a CSS `matrix3d` transform on the HTML
 *   element in sync with the mesh's 3D transform every frame, so the browser's own
 *   pointer-event dispatch (click, focus, text input) lands on the right screen
 *   position — this is what makes the `<button>` genuinely clickable
 *
 * DIVERGENCE from original
 * - The polyfill import is the one place this repo loads executable code from a CDN
 *   rather than a data asset (AGENTS.md § Repo format allows it only to shim an
 *   unshipped browser API, only where the original does it too). We pin the exact
 *   version; the original's import map does not
 * - RoomEnvironment -> PMREM IBL kept as a `useEffect` (skinning-instancing-individual
 *   pattern) instead of the original's synchronous `await renderer.init()` sequencing
 */
import { useEffect, useMemo, useRef } from 'react';
import { HTMLTexture, PMREMGenerator } from 'three/webgpu';
import type { Mesh } from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { InteractionManager } from 'three/addons/interaction/InteractionManager.js';
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu';
import '../../assets/RoundedBoxGeometry';
import { DemoHelpers } from '../../utils/DemoHelpers';

const IMAGE_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/758px-Canestra_di_frutta_(Caravaggio).jpg';

// Pinned CDN import of the HTML-in-Canvas polyfill — see header DEMONSTRATES/DIVERGENCE.
// Feature-detected exactly like the original: only loaded when the browser doesn't
// already implement `requestPaint` natively.
const POLYFILL_URL = 'https://cdn.jsdelivr.net/npm/three-html-render@0.1.2/dist/polyfill.mjs';
if (typeof HTMLCanvasElement !== 'undefined' && !('requestPaint' in HTMLCanvasElement.prototype)) {
  import(/* @vite-ignore */ POLYFILL_URL).then(({ installHtmlInCanvasPolyfill }) => installHtmlInCanvasPolyfill());
}

// The live HTML content, built once — ported verbatim from the original's
// `element.innerHTML`, with the page's external `<style>` rules folded into a scoped
// `<style>` child (the original relied on a page-level stylesheet this repo doesn't
// share) so the element is self-contained.
function createHtmlElement(): HTMLDivElement {
  const element = document.createElement('div');
  element.id = 'draw_element';
  element.innerHTML = `
    <style>
      #draw_element {
        width: 600px;
        background-color: #aaaaaa;
        color: #000000;
        font-family: sans-serif;
        font-size: 30px;
        line-height: 1.5;
        text-align: center;
        padding: 30px;
      }
      #draw_element img { animation: swing 1s ease-in-out infinite alternate; }
      #draw_element input[type="text"] {
        font-size: 24px;
        padding: 8px 12px;
        border: 2px solid #888;
        border-radius: 6px;
        width: 80%;
        margin-top: 10px;
      }
      #draw_element button {
        font-size: 24px;
        padding: 8px 20px;
        margin-top: 10px;
        border: none;
        border-radius: 6px;
        background-color: #4CAF50;
        color: white;
        cursor: pointer;
      }
      #draw_element button:hover { background-color: #2196F3; }
      @keyframes swing {
        from { transform: rotate(-15deg); }
        to { transform: rotate(15deg); }
      }
    </style>
    Hello world!<br>I'm multi-line, <b>formatted</b>,
    rotated text with emoji (&#128512;), RTL text
    <span dir=rtl>من فارسی صحبت میکنم</span>,
    vertical text,
    <p style="writing-mode: vertical-rl;">
    这是垂直文本
    </p>
    an inline image (<img width="150" src="${IMAGE_URL}">), and
    <svg width="50" height="50">
    <circle cx="25" cy="25" r="20" fill="green" />
    <text x="25" y="30" font-size="15" text-anchor="middle" fill="#fff">
      SVG
    </text>
    </svg>!
    <br>
    <input type="text" placeholder="Type here...">
    <button>Click me</button>
  `;
  return element;
}

function HtmlTexturedBox() {
  const renderer = useThree((s) => s.renderer);
  const camera = useThree((s) => s.camera);
  const meshRef = useRef<Mesh>(null);

  const element = useMemo(() => createHtmlElement(), []);
  const texture = useMemo(() => new HTMLTexture(element), [element]);
  const interactions = useMemo(() => new InteractionManager(), []);

  useEffect(() => {
    const button = element.querySelector('button');
    const onClick = () => {
      if (button) button.textContent = 'Clicked!';
    };
    button?.addEventListener('click', onClick);
    return () => button?.removeEventListener('click', onClick);
  }, [element]);

  useEffect(() => {
    interactions.connect(renderer, camera);
    const mesh = meshRef.current;
    if (!mesh) return;
    interactions.add(mesh);
    return () => {
      interactions.remove(mesh);
    };
  }, [interactions, renderer, camera]);

  useFrame(({ elapsed }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const time = elapsed * 1000; // original's `time` argument is milliseconds
    mesh.rotation.x = Math.sin(time * 0.0005) * 0.5;
    mesh.rotation.y = Math.cos(time * 0.0008) * 0.5;
    interactions.update();
  });

  return (
    <mesh ref={meshRef}>
      <roundedBoxGeometry args={[200, 200, 200, 10, 10]} />
      <meshStandardMaterial map={texture} roughness={0} metalness={0.5} />
    </mesh>
  );
}

// RoomEnvironment -> PMREM -> scene.environment (skinning-instancing-individual
// pattern) — the material's only light source, matching the original.
function RoomEnv() {
  const renderer = useThree((s) => s.renderer);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const environment = new RoomEnvironment();
    const pmremGenerator = new PMREMGenerator(renderer);
    const envRT = pmremGenerator.fromScene(environment, 0.02);
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

export default function MaterialsTextureHtml() {
  return (
    <Canvas background="#aaaaaa" camera={{ position: [0, 0, 500], fov: 50, near: 1, far: 2000 }}>
      <RoomEnv />
      <HtmlTexturedBox />
      <DemoHelpers grid={false} minDistance={300} maxDistance={1200} />
    </Canvas>
  );
}
