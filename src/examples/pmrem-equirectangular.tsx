/**
 * pmrem-equirectangular
 * R3F port of three.js `webgpu_pmrem_equirectangular`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_pmrem_equirectangular (~90 lines of JS)
 *
 * DEMONSTRATES
 * - TSL `pmremTexture(map, normalWorldGeometry, levelNode)` as `scene.backgroundNode`:
 *   the background is a direct lookup into the PMREM (prefiltered mipmapped radiance
 *   environment map) of an equirect texture, sampled by world normal at an arbitrary
 *   roughness level — a prefiltered-blur skybox with zero extra passes
 * - The PMREM level as a live three/tsl `uniform()` node: mutate `.value` and the
 *   background blur tracks it per frame, no graph rebuild (build-time vs run-time rule)
 * - A 6×5 roughness × metalness sweep of `<meshPhysicalNodeMaterial>` spheres sharing
 *   one per-material `envMap` — the node pipeline PMREMs the raw equirect texture
 *   internally per material (`NodeMaterial.setupEnvironment` → `materialReference`)
 * - `useLoader(UltraHDRLoader, …)` for a gainmap-JPEG environment (`*.hdr.jpg`) —
 *   the loader drei's `Environment` can't reach (UPSTREAM B13), used directly since
 *   this example needs the raw texture for both backgroundNode and envMap anyway
 *
 * DIVERGENCE from original
 * - The original's hard-coded background PMREM level (`uniform(0.5)`) is a leva slider
 *   (0–1) driving the live uniform node — the original ships no GUI at all
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
import { Suspense, useEffect, useLayoutEffect, useMemo } from 'react'
import { Canvas, useLoader, useThree } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { ACESFilmicToneMapping, EquirectangularReflectionMapping, SphereGeometry } from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { normalWorldGeometry, pmremTexture, uniform } from 'three/tsl'
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js'
import { DemoHelpers } from '../utils/DemoHelpers'

const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/royal_esplanade_2k.hdr.jpg'

// Shared static geometry — a constant, not mutable state, so module scope is the
// idiomatic call (clearcoat/lights-phong precedent); also matches the original's
// single geometry shared by all 30 spheres.
const sphereGeometry = new SphereGeometry(0.4, 64, 64)

// 6 roughness columns × 5 metalness rows, same sweep and layout as the original.
const SPHERES = Array.from({ length: 6 }, (_, i) =>
  Array.from({ length: 5 }, (_, j) => ({
    key: `${i}-${j}`,
    position: [i - 2.5, j - 2, 0] as [number, number, number],
    roughness: i / 5,
    metalness: j / 4,
  })),
).flat()

// Loads the UltraHDR equirect, wires it as a PMREM-sampled `scene.backgroundNode`,
// and lays out the roughness/metalness sphere grid — see header DEMONSTRATES.
function PmremScene({ backgroundRoughness }: { backgroundRoughness: number }) {
  const scene = useThree((s) => s.scene)
  const map = useLoader(UltraHDRLoader, HDR_URL)

  // Live level node for the background PMREM lookup — mutated below, never rebuilt.
  const uBackgroundRoughness = useMemo(() => uniform(0.5), [])

  // Layout effect: `.mapping` is read at shader-graph build time (first RAF render)
  // by both the backgroundNode and every sphere's envMap — it must land before that
  // (AGENTS.md imperative-setup rule). Cast: `@types/three`'s `Scene` doesn't declare
  // `backgroundNode` even though the WebGPU renderer reads it off the live scene
  // (duck-typed *Node gap, UPSTREAM B11 — same cast as `reflection`/`sprites`).
  useLayoutEffect(() => {
    map.mapping = EquirectangularReflectionMapping
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null }
    withBackgroundNode.backgroundNode = pmremTexture(map, normalWorldGeometry, uBackgroundRoughness)
    return () => {
      withBackgroundNode.backgroundNode = null
    }
  }, [scene, map, uBackgroundRoughness])

  useEffect(() => {
    uBackgroundRoughness.value = backgroundRoughness
  }, [uBackgroundRoughness, backgroundRoughness])

  return (
    <>
      {SPHERES.map(({ key, position, roughness, metalness }) => (
        <mesh key={key} geometry={sphereGeometry} position={position}>
          <meshPhysicalNodeMaterial roughness={roughness} metalness={metalness} envMap={map} />
        </mesh>
      ))}
    </>
  )
}

export default function PmremEquirectangular() {
  const { backgroundRoughness } = useControls('pmrem-equirectangular', {
    backgroundRoughness: { value: 0.5, min: 0, max: 1, step: 0.01 },
  })

  return (
    <Canvas
      // Original sets ACESFilmic explicitly — mirrored deliberately (parity rule).
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [0, 0, 8], fov: 45, near: 0.25, far: 20 }}
    >
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <PmremScene backgroundRoughness={backgroundRoughness} />
      </Suspense>
      <DemoHelpers grid={false} minDistance={2} maxDistance={10} />
    </Canvas>
  )
}
