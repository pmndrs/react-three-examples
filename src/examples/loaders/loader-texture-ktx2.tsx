/**
 * loader-texture-ktx2
 * R3F port of three.js `webgpu_loader_texture_ktx2`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_loader_texture_ktx2 (~305 lines of JS)
 *
 * DEMONSTRATES
 * - drei's `useKTX2` loading 16 KTX2 textures spanning all three container flavors —
 *   Uncompressed (`DataTexture`, e.g. rgba16/rgba32/rgb9e5), Compressed (native GPU
 *   formats: ASTC/ETC/BC*, needs device support), Universal (Basis transcoded to
 *   whatever the device supports) — one call per texture, each Suspense-gated and
 *   `detectSupport()`-wired against the live `WebGPURenderer`, same shared-loader
 *   plumbing as `textures-2d-array-compressed`'s `useKTX2`
 * - fiber's `ErrorBoundary` (`@react-three/fiber/webgpu`) giving each texture its OWN
 *   failure domain: a device that can't decode a given compressed format (ETC/ASTC
 *   support varies a lot by GPU) drops just that one tile and logs it, instead of one
 *   failed `loadAsync` taking out the whole gallery — the declarative equivalent of
 *   the original's per-texture `try/catch`
 * - `flipY=false` handling: KTX2 textures upload bottom-to-top, so instead of the
 *   texture's own `flipY` (unsupported on compressed formats), a shared plane
 *   geometry has its V coordinate pre-flipped once and is reused across every tile
 *
 * DIVERGENCE from original
 * - The original lays each texture into its own tiny DOM-measured `<canvas>` viewport
 *   (one `THREE.Scene`/camera per list item, scissored to match a `getBoundingClientRect()`
 *   on scroll) — a page-scroll gallery, not a 3D scene. Ported as ONE 3D grid of
 *   textured planes instead, grouped by section row, navigable with DemoHelpers'
 *   orbit controls — the equivalent gallery, browsable in 3D instead of by scrolling
 *   a page (the same substitution `procedural-texture`/`texturegrad` make for a
 *   locked-viewport original)
 * - Per-item labels keep the filename + resolved `colorSpace` (the load-bearing part
 *   of each DOM list-item's caption) via drei's `Html`; the longer prose paragraph
 *   describing each section is dropped — it explains a concept the 3D grouping and
 *   section heading already convey
 * - The original's `supported === false ? 'fail_load.ktx2' : path` ternary is dead
 *   code — no entry in `sections` ever sets `supported`, so every load always
 *   requests its real path. Not ported
 * - `renderer={{ toneMapping: NoToneMapping }}` explicit: the original renders with
 *   the WebGPURenderer default (none)
 */
import { Suspense, useMemo } from 'react';
import { NoToneMapping, PlaneGeometry } from 'three/webgpu';
import { Canvas, ErrorBoundary } from '@react-three/fiber/webgpu';
import { Html, useKTX2 } from '@react-three/drei/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const KTX2_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/ktx2/';
// Pinned to the r185 CDN release, same convention as loader-gltf-compressed's
// BasisU transcoder path.
const BASIS_TRANSCODER_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/jsm/libs/basis/';

const SECTIONS = [
  {
    title: 'Uncompressed',
    files: [
      '2d_rgba8',
      '2d_rgba8_linear',
      '2d_rgba16_linear',
      '2d_rgba32_linear',
      '2d_rgb9e5_linear',
      '2d_r11g11b10_linear',
    ],
  },
  {
    title: 'Compressed',
    files: ['2d_astc4x4', '2d_etc1', '2d_etc2', '2d_bc1', '2d_bc3', '2d_bc4', '2d_bc5', '2d_bc7'],
  },
  { title: 'Universal', files: ['2d_etc1s', '2d_uastc'] },
] as const;

const COLUMN_SPACING = 1.3;
const ROW_SPACING = 1.6;

interface KtxTileProps {
  path: string;
  position: [number, number, number];
  geometry: PlaneGeometry;
}

// One tile: its own Suspense (per-texture load) and ErrorBoundary (per-texture
// failure) — a device that can't decode this one format just skips this one tile.
function KtxTile({ path, position, geometry }: KtxTileProps) {
  return (
    <Suspense fallback={null}>
      <ErrorBoundary set={(err) => err && console.error(`Failed to load ${path}.ktx2`, err)}>
        <KtxPlane path={path} position={position} geometry={geometry} />
      </ErrorBoundary>
    </Suspense>
  );
}

function KtxPlane({ path, position, geometry }: KtxTileProps) {
  const map = useKTX2(`${KTX2_BASE}${path}.ktx2`, BASIS_TRANSCODER_PATH);

  return (
    <mesh position={position} geometry={geometry}>
      <meshBasicNodeMaterial map={map} />
      <Html
        center
        position={[0, -0.65, 0]}
        style={{ color: '#888', fontSize: 10, fontFamily: 'sans-serif', textAlign: 'center', whiteSpace: 'nowrap' }}>
        {path}.ktx2
        <br />
        {map.colorSpace}
      </Html>
    </mesh>
  );
}

function KtxGallery() {
  // Shared across every tile: KTX2 textures upload bottom-to-top (no `flipY`
  // support on compressed formats), so the ORIGINAL flips the plane's V instead of
  // the texture — ported verbatim as one shared, pre-flipped geometry.
  const geometry = useMemo(() => {
    const geo = new PlaneGeometry(1, 1);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    return geo;
  }, []);

  return (
    <>
      {SECTIONS.map((section, row) => (
        <group key={section.title}>
          {/* Centered ABOVE its row (not beside it): a title beside the grid can
              anchor close enough to the canvas edge to get clipped by Html's
              container div, where every tile position is already proven on-screen. */}
          <Html
            position={[((section.files.length - 1) * COLUMN_SPACING) / 2, -row * ROW_SPACING + 0.75, 0]}
            center
            style={{ color: '#444', fontSize: 13, fontFamily: 'sans-serif', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            {section.title}
          </Html>
          {section.files.map((path, col) => (
            <KtxTile
              key={path}
              path={path}
              geometry={geometry}
              position={[col * COLUMN_SPACING, -row * ROW_SPACING, 0]}
            />
          ))}
        </group>
      ))}
    </>
  );
}

export default function LoaderTextureKtx2() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#ffffff"
      camera={{ position: [4.55, -1.5, 11], fov: 50, near: 0.1, far: 100 }}>
      <KtxGallery />
      <DemoHelpers grid={false} target={[4.55, -1.5, 0]} minDistance={2} maxDistance={20} />
    </Canvas>
  );
}
