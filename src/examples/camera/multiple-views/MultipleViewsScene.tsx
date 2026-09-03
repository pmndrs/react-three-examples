// The shared scene all three viewports render: three vertex-coloured icosahedra (each
// hand-tinted by a different height-based rule) with a black wireframe overlay, and a
// soft radial-gradient shadow blob under each — rendered from a runtime `CanvasTexture`,
// the one piece genuinely easier to build imperatively than to express as JSX.
import { useMemo } from 'react';
import {
  BufferAttribute,
  CanvasTexture,
  Color,
  IcosahedronGeometry,
  MeshBasicNodeMaterial,
  MeshPhongNodeMaterial,
  SRGBColorSpace,
} from 'three/webgpu';
import type { BufferGeometry } from 'three/webgpu';

const RADIUS = 200;
const ICOSAHEDRA = [
  { x: -400, rotationX: -1.87, colorAt: (t: number, color: Color) => color.setHSL(t, 1, 0.5, SRGBColorSpace) },
  { x: 400, rotationX: 0, colorAt: (t: number, color: Color) => color.setHSL(0, t, 0.5, SRGBColorSpace) },
  { x: 0, rotationX: 0, colorAt: (t: number, color: Color) => color.setRGB(1, 0.8 - t, 0, SRGBColorSpace) },
] as const;

// One base geometry, cloned per icosahedron so each gets its OWN `color` attribute —
// the vertex positions are identical, only the per-vertex tint differs, matching the
// original's `geometry1.clone()`. The phong material below reads whichever geometry
// it's attached to via `vertexColors`, so ALL THREE share one material instance.
function withVertexColors(base: IcosahedronGeometry, colorAt: (t: number, color: Color) => void): BufferGeometry {
  const geometry = base.clone();
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new Color();
  for (let i = 0; i < position.count; i++) {
    colorAt(position.getY(i) / RADIUS + 0.5, color);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

// A soft radial-gradient blob, drawn once into an offscreen 2D canvas — this is the
// original's shadow "trick" (no real shadow map), so it stays imperative like the
// original rather than faking a JSX equivalent.
function makeShadowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0.1, 'rgba(0,0,0,0.15)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new CanvasTexture(canvas);
}

export function SceneContent() {
  const geometries = useMemo(
    () => ICOSAHEDRA.map(({ colorAt }) => withVertexColors(new IcosahedronGeometry(RADIUS, 1), colorAt)),
    [],
  );

  // REVIEW(shared-instance): three materials, each shared across 3 (or 9, with the
  // wireframe) meshes — matching the original's ONE `material`/`wireframeMaterial`/
  // `shadowMaterial` instance reused across every icosahedron/shadow blob. A JSX child
  // per mesh would create 3x as many; real sharing, per rule 3.
  const material = useMemo(
    () => new MeshPhongNodeMaterial({ color: '#ffffff', flatShading: true, vertexColors: true, shininess: 0 }),
    [],
  );
  const wireframeMaterial = useMemo(
    () => new MeshBasicNodeMaterial({ color: '#000000', wireframe: true, transparent: true }),
    [],
  );
  const shadowMaterial = useMemo(() => new MeshBasicNodeMaterial({ map: makeShadowTexture(), transparent: true }), []);

  return (
    <>
      <directionalLight intensity={3} position={[0, 0, 1]} />

      {[-400, 0, 400].map((x) => (
        <mesh key={x} position={[x, -250, 0]} rotation-x={-Math.PI / 2} material={shadowMaterial}>
          <planeGeometry args={[300, 300]} />
        </mesh>
      ))}

      {ICOSAHEDRA.map(({ x, rotationX }, i) => (
        <mesh key={x} geometry={geometries[i]} position-x={x} rotation-x={rotationX} material={material}>
          <mesh geometry={geometries[i]} material={wireframeMaterial} />
        </mesh>
      ))}
    </>
  );
}
