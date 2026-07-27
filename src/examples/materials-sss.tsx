/**
 * materials-sss
 * R3F port of three.js `webgpu_materials_sss`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materials_sss (~175 lines of JS)
 *
 * DEMONSTRATES
 * - `MeshSSSNodeMaterial` declaratively (`<meshSSSNodeMaterial>`): three's fast
 *   subsurface-scattering approximation (Colin Barré-Brisebois' GDC 2011 translucency
 *   term layered onto the physical lighting model), with `thicknessColorNode` built
 *   from a baked thickness map (`texture(map).mul(vec3(tint))`)
 * - The material's five `thickness*Node` knobs (distortion/ambient/attenuation/power/
 *   scale) as three/tsl `uniform()` nodes whose `.value` is mutated from leva in an
 *   effect — live updates with zero shader rebuilds, the same three-side-uniform
 *   pattern the original's GUI uses
 * - FBX loading via drei's `useFBX`, keeping the loaded mesh as a `<primitive>` (its
 *   baked FBX transform intact) and swapping its material declaratively with
 *   `<meshSSSNodeMaterial attach="material">` — the JSX form of the original's
 *   `model.material = material`
 * - Static point lights + a slowly rotating model: as the bunny turns, the rear
 *   yellow light visibly bleeds through the thin ears and rump — the whole point of
 *   the technique
 *
 * DIVERGENCE from original
 * - `renderer.inspector.createParameters` panel replaced with leva: the same five
 *   thickness sliders, plus a surface color control the original hard-codes
 *   (`new Color(1.0, 0.2, 0.2)` — linear components; the leva default `#ff7c7c` is
 *   that color's sRGB encoding, since fiber/leva color props are sRGB-managed)
 * - The original's dead `white.jpg` load is dropped — it fetches the texture but
 *   never assigns it to the material (and applies wrap settings to that unused
 *   texture); only `bunny_thickness.jpg` is fetched here
 * - OrbitControls (minDistance 500 / maxDistance 3000) → this repo's CameraControls
 *   via DemoHelpers, same dolly range
 * - Tone mapping pinned to `NoToneMapping` to match the original's WebGPURenderer
 *   default (fiber's Canvas would otherwise default to ACESFilmic and mute the bleed)
 * - DemoHelpers grid disabled — the original is a floating bunny in a black void,
 *   and at this scene scale (~500-unit model) the 0.5-unit grid would be moiré noise
 */
import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber/webgpu'
import { useFBX } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { texture, uniform, vec3 } from 'three/tsl'
import { NoToneMapping, TextureLoader } from 'three/webgpu'
import type { Mesh } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples'
const MODEL_URL = `${ASSETS}/models/fbx/stanford-bunny.fbx`
const THICKNESS_URL = `${ASSETS}/models/fbx/bunny_thickness.jpg`

interface ThicknessControls {
  color: string
  distortion: number
  ambient: number
  attenuation: number
  power: number
  scale: number
}

function Bunny({ color, distortion, ambient, attenuation, power, scale }: ThicknessControls) {
  const fbx = useFBX(MODEL_URL)
  const thicknessMap = useLoader(TextureLoader, THICKNESS_URL)

  // The original takes `object.children[0]`, overrides its position/scale and swaps
  // its material — keep the mesh itself (baked FBX transform intact) and do the same
  // declaratively via <primitive> below.
  const bunny = useMemo(() => fbx.children[0] as Mesh, [fbx])

  // The five SSS knobs, as the same three-side `uniform()` nodes the original
  // assigns — stable node identities, live-updated via `.value` in the effect below.
  const uniforms = useMemo(
    () => ({
      distortion: uniform(0.1),
      ambient: uniform(0.4),
      attenuation: uniform(0.8),
      power: uniform(2.0),
      scale: uniform(16.0),
    }),
    [],
  )

  useEffect(() => {
    uniforms.distortion.value = distortion
    uniforms.ambient.value = ambient
    uniforms.attenuation.value = attenuation
    uniforms.power.value = power
    uniforms.scale.value = scale
  }, [uniforms, distortion, ambient, attenuation, power, scale])

  // Baked thickness map times the original's ochre tint — thin regions (ears) read
  // bright in the map, so they transmit the most light.
  const thicknessColorNode = useMemo(() => texture(thicknessMap).mul(vec3(0.5, 0.3, 0.0)), [thicknessMap])

  // Original: `model.rotation.y = performance.now() / 5000` — state.elapsed is seconds.
  useFrame((state) => {
    bunny.rotation.y = state.elapsed / 5
  })

  return (
    <primitive object={bunny} position={[0, 0, 10]} scale={1}>
      <meshSSSNodeMaterial
        attach="material"
        color={color}
        roughness={0.3}
        thicknessColorNode={thicknessColorNode}
        thicknessDistortionNode={uniforms.distortion}
        thicknessAmbientNode={uniforms.ambient}
        thicknessAttenuationNode={uniforms.attenuation}
        thicknessPowerNode={uniforms.power}
        thicknessScaleNode={uniforms.scale}
      />
    </primitive>
  )
}

export default function MaterialsSSS() {
  const controls = useControls('materials-sss', {
    color: '#ff7c7c', // sRGB encoding of the original's linear Color(1.0, 0.2, 0.2)
    distortion: { value: 0.1, min: 0.01, max: 1, step: 0.01 },
    ambient: { value: 0.4, min: 0.01, max: 5, step: 0.05 },
    attenuation: { value: 0.8, min: 0.01, max: 5, step: 0.05 },
    power: { value: 2.0, min: 0.01, max: 16, step: 0.1 },
    scale: { value: 16.0, min: 0.01, max: 50, step: 0.1 },
  })

  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 300, 1600], fov: 40, near: 1, far: 5000 }}
    >
      <ambientLight color="#c1c1c1" />
      <directionalLight color="#ffffff" intensity={0.03} position={[0, 0.5, 0.5]} />
      {/* Front white light — its sphere marker doubles as the visible light source. */}
      <pointLight position={[0, -50, 350]} color="#c1c1c1" intensity={4} distance={300} decay={0}>
        <mesh>
          <sphereGeometry args={[4, 8, 8]} />
          <meshBasicMaterial color="#c1c1c1" />
        </mesh>
      </pointLight>
      {/* Rear yellow light — the one that bleeds through the bunny's thin parts. */}
      <pointLight position={[-100, 20, -260]} color="#c1c100" intensity={0.75} distance={500} decay={0}>
        <mesh>
          <sphereGeometry args={[4, 8, 8]} />
          <meshBasicMaterial color="#c1c100" />
        </mesh>
      </pointLight>
      <Suspense fallback={null}>
        <Bunny {...controls} />
      </Suspense>
      <DemoHelpers grid={false} minDistance={500} maxDistance={3000} />
    </Canvas>
  )
}
