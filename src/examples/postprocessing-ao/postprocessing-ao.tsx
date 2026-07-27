/**
 * postprocessing-ao
 * R3F port of three.js `webgpu_postprocessing_ao`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_ao (~370 lines of JS)
 *
 * DEMONSTRATES
 * - GTAO folded into the LIGHTING via `scenePass.contextNode = builtinAOContext(...)`
 *   — occlusion darkens the ambient term where geometry creases, instead of
 *   multiplying the final color like a naive AO composite
 * - A second custom pre-pass built inside `useRenderPipeline`'s mainCB
 *   (`pass(scene, camera)` from the callback's RootState) with MRT — RGB-packed
 *   view-space normals + velocity — plus the UnsignedByteType bandwidth optimization,
 *   registered alongside the AO/TRAA nodes via return-to-register
 * - `traa()` temporal anti-aliasing consuming pre-pass depth + velocity to resolve
 *   GTAO's per-frame sampling noise
 * - Pattern (b) pipeline dynamism: every GTAO knob (`samples`, `radius`, `thickness`,
 *   `scale`, `distanceExponent`, `distanceFallOff`) is a `uniform()`-backed field on
 *   the node — leva changes mutate `.value` in an effect, no rebuild, no fiber cast
 * - Runtime output switching (AO-only debug view): swapping
 *   `renderPipeline.outputNode` between registered nodes with
 *   `renderPipeline.needsUpdate = true`, paired with a `renderer.toneMapping` swap
 * - RoomEnvironment IBL generated imperatively (`PMREMGenerator.fromScene`) in an
 *   owner component — the showcased escape hatch, not hidden in a helper
 * - A fully procedural JSX gallery scene: CanvasTexture checkerboard, ExtrudeGeometry
 *   picture frames, LatheGeometry vase, RoundedBoxGeometry armchair
 * - Draco-compressed GLB via drei `useGLTF` + Box3 auto-fit in `useLayoutEffect`
 *
 * DIVERGENCE from original
 * - Ports the r185 release version (GTAO-only): the current dev original adds a
 *   GTAO/SSAO switcher, but `SSAONode` does not exist in npm three 0.185.1
 * - The original's `renderer.inspector.createParameters` panel is replaced with leva
 *   controls — same knobs, same ranges (AO params, temporal filtering, transparent
 *   test mesh + opacity, AO-only view)
 * - `toInspector(...)` debug tags dropped — this repo doesn't wire the three.js
 *   Inspector
 * - OrbitControls replaced by the DemoHelpers camera-controls baseline (same target
 *   and min/max distance)
 * - DemoHelpers grid disabled: the gallery room has its own checkerboard floor
 * - Draco decoder fetched from drei's default hosted decoder instead of the
 *   examples-local `jsm/libs/draco` directory
 */
import { Suspense, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { NeutralToneMapping, PMREMGenerator } from 'three/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { AOPipeline } from './AOPipeline'
import { Furniture } from './Furniture'
import { Gallery } from './Gallery'
import { TennysonBust } from './TennysonBust'

// RoomEnvironment → PMREM → scene.environment, dimmed to let the spotlights carry
// the scene (matches the original: intensity 0.3 over a #666666 background).
function RoomEnv() {
  const rawRenderer = useThree((s) => s.renderer)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    // PMREMGenerator wants the WebGPU renderer; useThree types the union even on
    // the /webgpu entry (upstream fiber gap, UPSTREAM.md B9).
    const renderer = rawRenderer as WebGPURenderer
    const environment = new RoomEnvironment()
    const pmremGenerator = new PMREMGenerator(renderer)
    const envRT = pmremGenerator.fromScene(environment, 0.04)
    scene.environment = envRT.texture
    scene.environmentIntensity = 0.3
    environment.dispose()
    pmremGenerator.dispose()
    return () => {
      scene.environment = null
      envRT.dispose()
    }
  }, [rawRenderer, scene])

  return null
}

export default function PostprocessingAO() {
  const {
    samples,
    distanceExponent,
    distanceFallOff,
    radius,
    scale,
    thickness,
    temporalFiltering,
    aoOnly,
    showTransparentMesh,
    transparentOpacity,
  } = useControls('postprocessing-ao', {
    samples: { value: 16, min: 4, max: 32, step: 1 },
    distanceExponent: { value: 1, min: 1, max: 2, step: 0.01 },
    distanceFallOff: { value: 1, min: 0.01, max: 1, step: 0.01 },
    radius: { value: 0.25, min: 0.1, max: 1, step: 0.01 },
    scale: { value: 0.5, min: 0.01, max: 1, step: 0.01 },
    thickness: { value: 1, min: 0.01, max: 2, step: 0.01 },
    temporalFiltering: true,
    aoOnly: false,
    showTransparentMesh: false,
    transparentOpacity: { value: 0.3, min: 0, max: 1, step: 0.01 },
  })

  return (
    <Canvas
      renderer={{ toneMapping: NeutralToneMapping }}
      background="#666666"
      camera={{ position: [1, 3, 7], fov: 45, near: 0.1, far: 50 }}
    >
      <RoomEnv />
      <Gallery />
      <Furniture />
      <Suspense fallback={null}>
        <TennysonBust />
      </Suspense>

      {/* Transparent test plane: excluded from the AO pre-pass (prePass.transparent
          is false), so it never occludes — toggle it to verify. */}
      <mesh visible={showTransparentMesh} position={[0, 1.2, 1.5]}>
        <planeGeometry args={[1.8, 2]} />
        <meshStandardNodeMaterial transparent opacity={transparentOpacity} />
      </mesh>

      <AOPipeline
        samples={samples}
        distanceExponent={distanceExponent}
        distanceFallOff={distanceFallOff}
        radius={radius}
        scale={scale}
        thickness={thickness}
        temporalFiltering={temporalFiltering}
        aoOnly={aoOnly}
      />
      <DemoHelpers grid={false} target={[0, 1.2, 0]} minDistance={2} maxDistance={16} />
    </Canvas>
  )
}
