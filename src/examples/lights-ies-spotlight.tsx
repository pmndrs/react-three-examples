/**
 * lights-ies-spotlight
 * R3F port of three.js `webgpu_lights_ies_spotlight`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_lights_ies_spotlight (~130 lines of JS)
 *
 * DEMONSTRATES
 * - `IESSpotLight` (WebGPURenderer-only, `three/webgpu`): a `SpotLight` subclass whose
 *   `iesMap` property multiplies the cone by a real luminaire's photometric profile —
 *   loaded here via `IESLoader` (three.js addon) + fiber's `useLoader`, same shape as
 *   `lights-spotlight`'s `PLYLoader` usage
 * - `extend(THREE)` (done once, at `@react-three/fiber/webgpu`'s module scope) covers
 *   every class in the `three/webgpu` namespace automatically, including WebGPU-only
 *   light subclasses like this one — no manual `extend()` call needed in the example
 *   itself. The one sharp edge: fiber's tag-casing only lowercases the FIRST letter
 *   (`Uncapitalize<'IESSpotLight'>`), so the JSX tag is `<iESSpotLight>`, not the more
 *   readable `<iesSpotLight>` — the latter resolves to a different (nonexistent)
 *   PascalCase name and throws "not part of the THREE namespace"
 * - Four independently-colored IES spotlights sharing one `SpotLightHelper` pattern
 *   (real scene-graph child of each light, `.update()` every frame) — same helper
 *   technique as `lights-spotlight`, applied four times
 * - `light.target` as a real, independently-animated `Object3D`: each light's target
 *   sweeps between the light's own footprint and the room's center every frame (ported
 *   from the original's `MathUtils.lerp` sweep), demonstrating that a spotlight's aim
 *   point is just another object the renderer reads live off the scene graph
 *
 * DIVERGENCE from original
 * - OrbitControls -> this repo's CameraControls (via DemoHelpers), same
 *   min/maxDistance and `pan={false}` (original sets `enablePan = false`)
 * - `renderer.inspector`'s GUI toggle replaced by leva (`helpers` boolean); the
 *   original's four `IESSpotLight`s' colors/intensity are also exposed per-light via
 *   leva folders (hard-coded in the original)
 * - `renderer={{ toneMapping: NoToneMapping }}` set explicitly — the original never
 *   configures tone mapping, which defaults to `NoToneMapping` on `WebGPURenderer`
 *   (see AGENTS.md tone-mapping trap)
 * - DemoHelpers grid disabled (`grid={false}`) — the original's own 200x200 floor
 *   plane IS the shadow receiver this example is about
 */
import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu'
import { folder, useControls } from 'leva'
import { IESLoader } from 'three/addons/loaders/IESLoader.js'
import { MathUtils, NoToneMapping, SpotLightHelper } from 'three/webgpu'
import type { IESSpotLight as IESSpotLightImpl, Texture } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const IES_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/ies/'
const IES_URLS = [
  `${IES_BASE}007cfb11e343e2f42e3b476be4ab684e.ies`,
  `${IES_BASE}06b4cfdc8805709e767b5e2e904be8ad.ies`,
  `${IES_BASE}02a7562c650498ebb301153dbbf59207.ies`,
  `${IES_BASE}1a936937a49c63374e6d4fbed9252b29.ies`,
]

interface IESLightRigProps {
  index: number
  position: [number, number, number]
  color: string
  intensity: number
  iesMap: Texture
  helpers: boolean
}

// One IES spotlight: carries a SpotLightHelper as a real child (see header
// DEMONSTRATES, same pattern as lights-spotlight) and independently animates its own
// `target` — a plain Object3D the renderer reads every frame, not a fiber concept.
function IESLightRig({ index, position, color, intensity, iesMap, helpers }: IESLightRigProps) {
  const lightRef = useRef<IESSpotLightImpl>(null)
  const helperRef = useRef<SpotLightHelper | null>(null)
  const scene = useThree((s) => s.scene)

  // Mount once: add the light's target to the scene (matches the original's explicit
  // `scene.add(spotLight.target)`) and attach the helper as the light's own child so it
  // inherits the light's transform for free.
  useEffect(() => {
    const light = lightRef.current
    if (!light) return
    scene.add(light.target)

    const helper = new SpotLightHelper(light)
    light.add(helper)
    helperRef.current = helper

    return () => {
      scene.remove(light.target)
      light.remove(helper)
      helper.dispose()
      helperRef.current = null
    }
  }, [scene])

  useEffect(() => {
    const helper = helperRef.current
    if (helper) helper.visible = helpers
  }, [helpers])

  // Ported from the original's `render()`: the target sweeps between the light's own
  // (fixed) footprint and the room's center, phase-offset per light by `index`.
  useFrame((state) => {
    const light = lightRef.current
    if (!light) return
    const t = (Math.sin((state.elapsed + index) * (Math.PI / 2)) + 1) / 2
    light.target.position.x = MathUtils.lerp(light.position.x, 0, t)
    light.target.position.z = MathUtils.lerp(light.position.z, 0, t)
    helperRef.current?.update()
  })

  return (
    <iESSpotLight
      ref={lightRef}
      color={color}
      intensity={intensity}
      position={position}
      angle={Math.PI / 8}
      penumbra={0.7}
      distance={20}
      iesMap={iesMap}
      castShadow
    />
  )
}

interface SceneProps {
  helpers: boolean
  colors: [string, string, string, string]
  intensities: [number, number, number, number]
}

function Scene({ helpers, colors, intensities }: SceneProps) {
  const iesTextures = useLoader(IESLoader, IES_URLS)

  const positions: [number, number, number][] = [
    [6.5, 3, 6.5],
    [-6.5, 3, 6.5],
    [-6.5, 3, -6.5],
    [6.5, 3, -6.5],
  ]

  return (
    <>
      {positions.map((position, i) => (
        <IESLightRig
          key={i}
          index={i}
          position={position}
          color={colors[i]}
          intensity={intensities[i]}
          iesMap={iesTextures[i]}
          helpers={helpers}
        />
      ))}
      <mesh rotation-x={-Math.PI * 0.5} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshPhongMaterial color="#999999" />
      </mesh>
      <mesh position={[0, 1, 0]} castShadow>
        <boxGeometry args={[2, 2, 2]} />
        <meshPhongMaterial color="#999999" />
      </mesh>
    </>
  )
}

export default function LightsIesSpotlight() {
  const { helpers, color1, intensity1, color2, intensity2, color3, intensity3, color4, intensity4 } = useControls(
    'lights-ies-spotlight',
    {
      helpers: false,
      light1: folder({ color1: { value: '#ff0000', label: 'color' }, intensity1: { value: 500, min: 0, max: 2000, step: 10, label: 'intensity' } }),
      light2: folder({ color2: { value: '#00ff00', label: 'color' }, intensity2: { value: 500, min: 0, max: 2000, step: 10, label: 'intensity' } }),
      light3: folder({ color3: { value: '#0000ff', label: 'color' }, intensity3: { value: 500, min: 0, max: 2000, step: 10, label: 'intensity' } }),
      light4: folder({ color4: { value: '#ffffff', label: 'color' }, intensity4: { value: 500, min: 0, max: 2000, step: 10, label: 'intensity' } }),
    },
  )

  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      shadows
      camera={{ position: [16, 4, 1], fov: 35, near: 0.1, far: 100 }}
    >
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <Scene
          helpers={helpers}
          colors={[color1, color2, color3, color4]}
          intensities={[intensity1, intensity2, intensity3, intensity4]}
        />
      </Suspense>
      <DemoHelpers grid={false} pan={false} minDistance={2} maxDistance={50} />
    </Canvas>
  )
}
