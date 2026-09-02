// The shared scene content, mounted identically inside BOTH `<Canvas>`es (see the
// entry file): 15 scale markers from 1 micrometer to 1000 light years, each a label
// + a dot sphere, ported verbatim from the original's `initScene()`/`labeldata`.
import { useMemo } from 'react';
import { Color, MeshPhongNodeMaterial, SphereGeometry } from 'three/webgpu';
import type { BufferGeometry } from 'three/webgpu';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import type { Font } from 'three/addons/loaders/FontLoader.js';
import { useLoader } from '@react-three/fiber/webgpu';

export const FONT_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/fonts/helvetiker_regular.typeface.json';

// Real-world scale references, 1 micrometer to 1000 light years — the whole reason
// NEAR/FAR spans 1e-6..1e27 (see the entry file) and depth precision falls apart
// without a logarithmic depth buffer.
const LABEL_DATA = [
  { size: 0.01, scale: 0.0001, label: 'microscopic (1µm)' },
  { size: 0.01, scale: 0.1, label: 'minuscule (1mm)' },
  { size: 0.01, scale: 1.0, label: 'tiny (1cm)' },
  { size: 1, scale: 1.0, label: 'child-sized (1m)' },
  { size: 10, scale: 1.0, label: 'tree-sized (10m)' },
  { size: 100, scale: 1.0, label: 'building-sized (100m)' },
  { size: 1000, scale: 1.0, label: 'medium (1km)' },
  { size: 10000, scale: 1.0, label: 'city-sized (10km)' },
  { size: 3_400_000, scale: 1.0, label: 'moon-sized (3,400 km)' },
  { size: 12_000_000, scale: 1.0, label: 'planet-sized (12,000 km)' },
  { size: 1_400_000_000, scale: 1.0, label: 'sun-sized (1,400,000 km)' },
  { size: 7.47e12, scale: 1.0, label: 'solar system-sized (50Au)' },
  { size: 9.4605284e15, scale: 1.0, label: 'gargantuan (1 light year)' },
  { size: 3.08567758e16, scale: 1.0, label: 'ludicrous (1 parsec)' },
  { size: 1e19, scale: 1.0, label: 'mind boggling (1000 light years)' },
] as const;

// `labeldata[0]`/`labeldata[last]`, `* 1`/`* 100` — the original's zoom clamp range,
// re-exported so `CameraRig.tsx`'s dolly can't push the camera past either end.
export const MIN_ZOOM = LABEL_DATA[0].size * LABEL_DATA[0].scale;
export const MAX_ZOOM = LABEL_DATA[LABEL_DATA.length - 1].size * LABEL_DATA[LABEL_DATA.length - 1].scale * 100;

interface ScaleMarkerProps {
  font: Font;
  dotGeometry: BufferGeometry;
  size: number;
  scale: number;
  label: string;
}

// One marker: a label + a dot, sharing ONE material (the original reuses a single
// `MeshPhongMaterial` for both meshes) — a genuinely shared instance, not a JSX
// per-mesh material (AGENTS.md's documented shared-instance exception).
function ScaleMarker({ font, dotGeometry, size, scale, label }: ScaleMarkerProps) {
  const labelGeometry = useMemo(() => {
    const geo = new TextGeometry(label, { font, size, depth: size / 2 });
    geo.computeBoundingSphere();
    // Center the text: pull it left by its own bounding-sphere radius.
    geo.translate(-(geo.boundingSphere?.radius ?? 0), 0, 0);
    return geo;
  }, [font, label, size]);

  // Random per label, exactly like the original (`setHSL(Math.random(), 0.5, 0.5)`)
  // — a fresh, one-time palette every mount, not meant to be stable across reloads.
  const material = useMemo(
    () =>
      new MeshPhongNodeMaterial({
        color: new Color().setHSL(Math.random(), 0.5, 0.5),
        specular: 0x050505,
        shininess: 50,
      }),
    [],
  );

  // Ported verbatim: the group sits at `-size*scale`, then the label mesh is offset
  // BY THE SAME AMOUNT AGAIN (relative to the group) while the dot stays at the
  // group's origin — the label reads a bit further out than the dot that marks it.
  return (
    <group position={[0, 0, -size * scale]}>
      <mesh
        geometry={labelGeometry}
        material={material}
        scale={scale}
        position={[0, (size / 4) * scale, -size * scale]}
      />
      <mesh geometry={dotGeometry} material={material} position={[0, (-size / 4) * scale, 0]} scale={size * scale} />
    </group>
  );
}

export function LogDepthScene() {
  const font = useLoader(FontLoader, FONT_URL);
  const dotGeometry = useMemo(() => new SphereGeometry(0.5, 24, 12), []);

  return (
    <>
      <ambientLight color={0x777777} />
      <directionalLight position={[100, 100, 100]} intensity={3} />
      {LABEL_DATA.map((entry) => (
        <ScaleMarker key={entry.label} font={font} dotGeometry={dotGeometry} {...entry} />
      ))}
    </>
  );
}
