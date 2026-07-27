/**
 * tsl-wood
 * R3F port of three.js `webgpu_tsl_wood`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_tsl_wood (~280 lines of JS)
 *
 * DEMONSTRATES
 * - The `WoodNodeMaterial` addon (procedural TSL wood by Logan Seeley): a 10x4
 *   swatch grid of every genus/finish preset (`WoodNodeMaterial.fromPreset`)
 *   plus a fully custom instance driven live from leva — every grain/ring/warp
 *   parameter is an `onObjectUpdate`-backed uniform that re-reads the material
 *   instance per frame, so leva -> `<primitive attach="material">` prop diffs
 *   need zero uniform plumbing and zero shader rebuilds
 * - `material.transformationMatrix` seeding each block with a different slice of
 *   the same procedural log (a matrix uniform feeding `positionLocal` into the
 *   wood graph)
 * - `TextGeometry` + `FontLoader` labels via fiber's `useLoader` (suspending
 *   inside the example's one Suspense gate), bbox-centered like the original
 * - A procedural dotted-grid ground plane authored as a plain TSL `colorNode`
 *   on `<meshBasicNodeMaterial>` (screen-space `fwidth` antialiasing, radial
 *   fade — GridPlane.tsx)
 * - IBL-only lighting: drei `Environment` (`/webgpu`) with `environmentIntensity`,
 *   no analytic lights — clearcoat finishes read entirely from the HDR
 *
 * DIVERGENCE from original
 * - `renderer.inspector` GUI (Inspector addon) replaced with leva (same 20
 *   parameters, same ranges/defaults); Inspector overlay dropped repo-wide
 * - The custom material's `clearcoat` slider actually works here: the r185
 *   `WoodNodeMaterial` constructor bakes `clearcoatNode` to a CONSTANT, which
 *   overrides the `clearcoat` property the original's GUI mutates (inert
 *   upstream). We null `clearcoatNode` before first build so the slider drives
 *   the live reference-backed `material.clearcoat` instead
 * - The original awaits a `setTimeout(0)` between each of the 40 preset blocks
 *   (compile stagger); React mounts them in one commit — WebGPU pipeline
 *   compilation is async and the swatches share one node graph, so the stagger
 *   buys nothing here
 * - Grid-Fn parameters (`gridSize`/`dotWidth`/`lineWidth`, `radius`/`falloff`)
 *   folded into build-time JS constants — the original passes them as TSL Fn
 *   defaults but never varies them
 * - OrbitControls -> DemoHelpers' camera-controls baseline (same top-down
 *   camera + target; DemoHelpers grid off — the example draws its own)
 * - `dpr={1}` mirrors the original's `setPixelRatio(1.0)` ("important for
 *   performance": 41 clearcoat physical materials)
 */
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { Environment } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { NeutralToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { GridPlane } from './GridPlane'
import { WoodShowcase } from './WoodShowcase'

const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/san_giuseppe_bridge_2k.hdr'

export default function TslWood() {
  // Same 20 knobs, ranges, and defaults as the original's Inspector GUI (the
  // "custom" block in the corner of the swatch grid).
  const custom = useControls('custom wood', {
    centerSize: { value: 1.11, min: 0, max: 2, step: 0.01 },
    largeWarpScale: { value: 0.32, min: 0, max: 1, step: 0.001 },
    largeGrainStretch: { value: 0.24, min: 0, max: 1, step: 0.001 },
    smallWarpStrength: { value: 0.059, min: 0, max: 0.2, step: 0.001 },
    smallWarpScale: { value: 2, min: 0, max: 5, step: 0.01 },
    fineWarpStrength: { value: 0.006, min: 0, max: 0.05, step: 0.001 },
    fineWarpScale: { value: 32.8, min: 0, max: 50, step: 0.1 },
    ringThickness: { value: 1 / 34, min: 0, max: 0.1, step: 0.001 },
    ringBias: { value: 0.03, min: -0.2, max: 0.2, step: 0.001 },
    ringSizeVariance: { value: 0.03, min: 0, max: 0.2, step: 0.001 },
    ringVarianceScale: { value: 4.4, min: 0, max: 10, step: 0.1 },
    barkThickness: { value: 0.3, min: 0, max: 1, step: 0.01 },
    splotchScale: { value: 0.2, min: 0, max: 1, step: 0.01 },
    splotchIntensity: { value: 0.541, min: 0, max: 1, step: 0.01 },
    cellScale: { value: 910, min: 100, max: 2000, step: 1 },
    cellSize: { value: 0.1, min: 0.01, max: 0.5, step: 0.001 },
    darkGrainColor: '#0c0504',
    lightGrainColor: '#926c50',
    clearcoat: { value: 1, min: 0, max: 1, step: 0.01 },
    clearcoatRoughness: { value: 0.2, min: 0, max: 1, step: 0.01 },
  })

  return (
    <Canvas
      // Original: NeutralToneMapping, exposure 1, white background,
      // setPixelRatio(1.0) for performance across 41 clearcoat materials.
      renderer={{ toneMapping: NeutralToneMapping }}
      dpr={1}
      background="#ffffff"
      camera={{ position: [-0.1, 5, 0.548], fov: 75, near: 0.1, far: 1000 }}
    >
      {/* One Suspense over environment + scene (B15/B17): <Environment> suspends
          on the HDR and the showcase suspends on the font, so the wood materials'
          first shader build already sees scene.environment — IBL is the ONLY
          light source here. */}
      <Suspense fallback={null}>
        {/* IBL only, no background image (the page stays white like the
            original): scene.environment + environmentIntensity = 2. */}
        <Environment files={HDR_URL} environmentIntensity={2} />
        <GridPlane />
        <WoodShowcase custom={custom} />
      </Suspense>
      <DemoHelpers grid={false} target={[0, 0, 0.548]} />
    </Canvas>
  )
}
