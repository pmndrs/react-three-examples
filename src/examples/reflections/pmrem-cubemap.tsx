/**
 * pmrem-cubemap
 * R3F port of three.js `webgpu_pmrem_cubemap`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_pmrem_cubemap (~85 lines of JS)
 *
 * DEMONSTRATES
 * - The cube-map twin of `pmrem-equirectangular`: `pmremTexture(map,
 *   normalWorldGeometry, levelNode)` as `scene.backgroundNode`, sourced from a 6-face
 *   HDR cube instead of one equirect texture — same prefiltered-blur skybox lookup,
 *   no `.mapping` assignment needed since `HDRCubeTextureLoader` already returns a
 *   correctly-tagged `CubeTexture`
 * - The PMREM level as a live three/tsl `uniform()` node: mutate `.value` and the
 *   background blur tracks it per frame, no graph rebuild (build-time vs run-time rule)
 * - The same 6x5 roughness x metalness sweep of `<meshPhysicalNodeMaterial>` spheres
 *   sharing one per-material `envMap`, the node pipeline PMREM-ing the raw cube
 *   texture internally per material
 * - `useLoader(HDRCubeTextureLoader, [[...faces]])` for the 6-file `.hdr` cube (same
 *   nested-array shape as `cubemap-dynamic`/`cubemap-mix`, B20 workaround)
 *
 * DIVERGENCE from original
 * - The original hard-codes the background PMREM level (`uniform(0.5)`) with no GUI
 *   at all; a `backgroundRoughness` leva slider (0-1) exposes it live, same treatment
 *   as `pmrem-equirectangular`'s identical hard-coded constant
 * - The imperative double loop building 30 meshes becomes a declarative map over a
 *   precomputed grid; one `SphereGeometry` is shared across all spheres at module
 *   scope (the original also shares one geometry)
 * - Explicit `<Suspense>` gate around the loading scene (B17) replaces the original's
 *   build-scene-in-loader-callback flow
 * - DemoHelpers' camera-controls orbit replaces `OrbitControls`; `minDistance`/
 *   `maxDistance` (2/10) map directly. Grid disabled (`grid={false}`) — a floating
 *   sphere array against a full skybox, no ground plane in the original
 * - Tone mapping is NOT a divergence: the original sets ACESFilmic explicitly; set
 *   deliberately here via `renderer={{ toneMapping }}` (tone-mapping parity rule)
 */
import { Suspense, useLayoutEffect } from 'react';
import { ACESFilmicToneMapping, SphereGeometry } from 'three/webgpu';
import { normalWorldGeometry, pmremTexture } from 'three/tsl';
import { HDRCubeTextureLoader } from 'three/addons/loaders/HDRCubeTextureLoader.js';
import { Canvas, useLoader, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const CUBE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/cube/pisaHDR/';
const PISA_HDR_FILES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map((face) => `${CUBE_BASE}${face}.hdr`);

// Shared static geometry — a constant, not mutable state, so module scope is the
// idiomatic call (clearcoat/lights-phong precedent); also matches the original's
// single geometry shared by all 30 spheres.
const sphereGeometry = new SphereGeometry(0.4, 64, 64);

// 6 roughness columns x 5 metalness rows, same sweep and layout as the original.
const SPHERES = Array.from({ length: 6 }, (_, i) =>
  Array.from({ length: 5 }, (_, j) => ({
    key: `${i}-${j}`,
    position: [i - 2.5, j - 2, 0] as [number, number, number],
    roughness: i / 5,
    metalness: j / 4,
  })),
).flat();

// Loads the HDR cube, wires it as a PMREM-sampled `scene.backgroundNode`, and lays
// out the roughness/metalness sphere grid — see header DEMONSTRATES.
function PmremScene() {
  const { backgroundRoughness } = useControls('pmrem-cubemap', {
    backgroundRoughness: { value: 0.5, min: 0, max: 1, step: 0.01 },
  });
  const scene = useThree((s) => s.scene);

  // Live level node for the background PMREM lookup — the leva value flows straight
  // into the uniform, never rebuilding the graph. B18: this creator-mode hook must run
  // BEFORE the suspending useLoader below, or the deferred re-render becomes a
  // setState-during-render warning (same ordering rule as mirror's Room.tsx).
  const { uBackgroundRoughness } = useUniforms({ uBackgroundRoughness: backgroundRoughness });

  const [map] = useLoader(HDRCubeTextureLoader, [PISA_HDR_FILES]);

  // Layout effect: `scene.backgroundNode` is read at shader-graph build time (first
  // RAF render) — must land before that (AGENTS.md imperative-setup rule).
  // `@types/three` now declares `backgroundNode` on `Scene` directly (0.185.1), so no
  // cast is needed (UPSTREAM B11's Scene half is fixed upstream).
  useLayoutEffect(() => {
    const withBackgroundNode = scene;
    withBackgroundNode.backgroundNode = pmremTexture(map, normalWorldGeometry, uBackgroundRoughness);
    return () => {
      withBackgroundNode.backgroundNode = null;
    };
  }, [scene, map, uBackgroundRoughness]);

  return (
    <>
      {SPHERES.map(({ key, position, roughness, metalness }) => (
        <mesh key={key} geometry={sphereGeometry} position={position}>
          <meshPhysicalNodeMaterial roughness={roughness} metalness={metalness} envMap={map} />
        </mesh>
      ))}
    </>
  );
}

export default function PmremCubemap() {
  return (
    <Canvas
      // Original sets ACESFilmic explicitly — mirrored deliberately (parity rule).
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [0, 0, 8], fov: 45, near: 0.25, far: 20 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <PmremScene />
      </Suspense>
      <DemoHelpers grid={false} minDistance={2} maxDistance={10} />
    </Canvas>
  );
}
