/**
 * shadowmap
 * R3F port of three.js `webgpu_shadowmap`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_shadowmap (~175 lines of JS)
 *
 * DEMONSTRATES
 * - `NodeMaterial.maskNode` (Shapes.tsx): a fractal-noise discard mask (MaterialX's
 *   `mx_fractal_noise_float`) punched through the torus knot's fragment shader — since
 *   the shadow pass shares the same material graph, discarded fragments cast no shadow
 *   either, unlike legacy alpha-test setups that need a separate depth material to keep
 *   a caster's silhouette and its shadow in sync
 * - `NodeMaterial.receivedShadowPositionNode` (Ground.tsx): perturbing the position the
 *   ground material samples shadow maps at (`mx_fractal_noise_vec3`), producing a
 *   wavy/distorted shadow edge with no extra vertex displacement
 * - Two independent shadow-casting lights (`SpotLight` + `DirectionalLight`, Lights.tsx)
 *   configured via fiber's dash-path props (`shadow-camera-*`, `shadow-mapSize-*`,
 *   `shadow-radius`)
 * - `useUniforms` feeding a leva-controlled threshold straight into the discard mask's
 *   TSL graph (same "feed a value in, keep the graph identity stable" pattern as
 *   tsl-halftone), tying a live control directly to the maskNode technique above
 * - Legacy `<fog attach="fog">` (a plain `THREE.Fog`, not a TSL `fogNode`) rendering
 *   correctly under the WebGPU node-material pipeline — three's `NodeManager.updateFog()`
 *   auto-wraps `scene.fog` into a fog node every frame, so the declarative fiber `<fog>`
 *   idiom (used elsewhere in this corpus for legacy WebGL-style fog) needs no cast or
 *   TSL rewrite here; see header DIVERGENCE for why this refines an existing AGENTS.md note
 *
 * DIVERGENCE from original
 * - Folder pattern: split by scene role into `Lights.tsx` (spot + directional, orbit +
 *   bob animation), `Shapes.tsx` (torus knot + pillars), and `Ground.tsx` (the noise-
 *   shaded/shadow-perturbed plane) — the flat file exceeded the ~200-line threshold
 * - OrbitControls (`target`, `minDistance`, `maxDistance`, no pan lock) becomes
 *   DemoHelpers' camera-controls v3 wrapper; grid disabled (`grid={false}`) — the
 *   original's own 600x600 noise-shaded ground plane IS the subject of this example
 *   (`receivedShadowPositionNode`), and an infinite world grid at the same height would
 *   visually compete with it
 * - `THREE.Timer` dropped; `useFrame`'s `state.delta`/`state.time` drive the per-frame
 *   rotation/orbit/bob directly, same translation as every other port in this corpus
 * - The four pillars are four independent JSX `meshPhongNodeMaterial` instances instead
 *   of the original's one shared material + three `.clone()`s — declarative simplicity,
 *   the four extra material instances are negligible next to the torus knot / ground
 *   node graphs
 * - The ground's `colorNode` drops the original's dead position-perturbation calc (a
 *   `pos.xz` noise offset computed via `toVar()`/`addAssign()` but never read before the
 *   node returns — apparent copy/paste from `receivedShadowPositionNode` just above it
 *   in the original source); the perturbation is kept where it's actually used
 * - `renderer.inspector`'s dat.gui-less imperative setup gains a small leva panel
 *   (`maskThreshold`, `shadowRadius`, `spinSpeed`, `exposure`) — the original has no UI
 *   at all; added for interactivity/pedagogy, same rationale as this corpus's other
 *   zero-GUI ports (sky, sprites)
 * - `spinSpeed` uniformly scales the torus knot's three rotation axes, the directional
 *   light group's orbit, and the light's z-bob frequency together (one dial, not the
 *   original's four independent hard-coded rates)
 * - `renderer.toneMappingExposure` driven from leva (same escape hatch as
 *   `sky`/`postprocessing-bloom-emissive`: a WebGPURenderer property, not a TSL uniform)
 */
import { useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { useControls, folder } from 'leva'
import { ACESFilmicToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { Ground } from './Ground'
import { Lights } from './Lights'
import { Pillars, TorusKnot } from './Shapes'

// renderer.toneMappingExposure is a WebGPURenderer property, not a TSL uniform — set
// imperatively (same pattern as sky.tsx / postprocessing-bloom-emissive.tsx).
function ToneMappingExposure({ exposure }: { exposure: number }) {
  const renderer = useThree((s) => s.renderer)

  useEffect(() => {
    renderer.toneMappingExposure = exposure
  }, [renderer, exposure])

  return null
}

export default function Shadowmap() {
  const { maskThreshold, shadowRadius, spinSpeed, exposure } = useControls('shadowmap', {
    maskThreshold: { value: 0, min: -1, max: 1, step: 0.01 },
    shadow: folder({
      shadowRadius: { value: 4, min: 0, max: 10, step: 0.5 },
    }),
    spinSpeed: { value: 1, min: 0, max: 3, step: 0.05 },
    exposure: { value: 1, min: 0, max: 2, step: 0.01 },
  })

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      shadows
      background="#222244"
      camera={{ position: [0, 10, 20], fov: 45, near: 1, far: 1000 }}
    >
      <fog attach="fog" args={['#222244', 50, 100]} />
      <Lights shadowRadius={shadowRadius} spinSpeed={spinSpeed} />
      <TorusKnot maskThreshold={maskThreshold} spinSpeed={spinSpeed} />
      <Pillars />
      <Ground />
      <ToneMappingExposure exposure={exposure} />
      <DemoHelpers grid={false} target={[0, 2, 0]} minDistance={7} maxDistance={40} />
    </Canvas>
  )
}
