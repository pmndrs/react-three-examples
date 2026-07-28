/**
 * shadowmap-opacity
 * R3F port of three.js `webgpu_shadowmap_opacity`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_shadowmap_opacity (~110 lines of JS)
 *
 * DEMONSTRATES
 * - `material.castShadowNode`: a custom TSL graph that controls what color/opacity a
 *   transmissive object writes into the shadow map, instead of the default opaque
 *   black — `Fn(([shadowColor]) => mix(1, shadowColor, opacity))` tints the dragons'
 *   shadows by their own glass color, `mix`ed toward white (no tint) as opacity falls
 * - `castShadowNode` is duck-typed and read generically by the renderer's shadow-pass
 *   builder (`Renderer.js`, `hasCastShadowNode` check) — it works on the material glTF
 *   actually loads (a classic `MeshPhysicalMaterial`, not a `*NodeMaterial` subclass),
 *   not just materials built from JSX node-material tags. Cast to
 *   `MeshPhysicalNodeMaterial` to get the property typed (same duck-typed-`*Node`
 *   family as `scene.fogNode`/`scene.backgroundNode`, AGENTS.md B11, first hit on a
 *   loaded-not-authored material)
 * - `renderer.shadowMap.transmitted = true` is REQUIRED whenever any material sets
 *   `castShadowNode` (`Renderer.js` warns otherwise) — same renderer-level flag
 *   `volume-fire` needs for its volumetric shadow proxy, set in a `useLayoutEffect` so
 *   it lands before the first shadow render
 * - Two clones of the same transmissive dragon (`KHR_materials_transmission` +
 *   `KHR_materials_volume`, imported by `GLTFLoader` into `MeshPhysicalMaterial.
 *   transmission`/`.attenuationColor`) with different attenuation colors, so the
 *   opacity slider visibly retints two different-colored shadows at once
 *
 * DIVERGENCE from original
 * - The original bakes the shadow ONCE (`shadow.autoUpdate = false` after an initial
 *   `needsUpdate = true`) since nothing in the scene moves — a static-scene perf
 *   optimization. This port leaves `shadow.autoUpdate` at its default (always-on) so
 *   the `shadowOpacity` leva slider actually retints the shadow live, frame to frame —
 *   the whole point of exposing it as a control (corpus rule: direct value controls
 *   beat hidden state). The rendered image is still static without user input, so the
 *   example keeps `"static": true` in the manifest.
 * - `shadowOpacity` (the `opacity` argument to `castShadowNode`'s `mix`) is a leva
 *   slider driving a `useUniforms` uniform instead of the original's hard-coded
 *   default (`1`) — the one genuinely live knob this demo is built to showcase.
 * - `toneMappingExposure` (original hard-codes 1.5) is a leva slider, same pattern as
 *   `materials-transmission`/`tonemapping` — set imperatively on the renderer, not a
 *   Canvas prop.
 * - `shadow.radius` (original hard-codes 4) is a leva slider, consistent with this
 *   corpus's other shadow-mapping ports (`shadowmap-vsm`, `shadowmap-pointlight`).
 * - OrbitControls -> this repo's CameraControls (via DemoHelpers), same 0.1/10 dolly
 *   clamps as the original; grid disabled (`grid={false}`) — the dragon's own scaled
 *   floor plane is the shadow receiver in frame.
 * - `renderer.inspector = new Inspector()` dropped (this repo doesn't wire the
 *   Inspector RootState slot, same gap noted across the corpus's other ports).
 */
import { Suspense, useLayoutEffect } from 'react'
import { Canvas, useThree, useUniforms } from '@react-three/fiber/webgpu'
import { useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { color, Fn, mix } from 'three/tsl'
import { AgXToneMapping, Color } from 'three/webgpu'
import type { Mesh, MeshPhysicalNodeMaterial, Node, WebGPURenderer } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/DragonAttenuation.glb'

interface RendererSetupProps {
  exposure: number
}

// toneMappingExposure + shadowMap.transmitted are WebGPURenderer properties with no
// Canvas prop — set imperatively (pattern: materials-transmission, volume-fire).
// useThree's renderer union needs the B9 cast for the WebGPU-only `shadowMap.transmitted`
// flag; useLayoutEffect because it must land before the first shadow render.
function RendererSetup({ exposure }: RendererSetupProps) {
  const rawRenderer = useThree((s) => s.renderer)
  const renderer = rawRenderer as WebGPURenderer

  useLayoutEffect(() => {
    renderer.shadowMap.transmitted = true
  }, [renderer])

  useLayoutEffect(() => {
    renderer.toneMappingExposure = exposure
  }, [renderer, exposure])

  return null
}

// Loads the dragon-in-glass glTF once, clones a second dragon with a different
// attenuation color, and wires both materials' castShadowNode to a shared TSL graph
// driven by the live `shadowOpacity` uniform. Guarded by scene.userData so StrictMode's
// double-invoked effect (and any remount sharing drei's cached scene) never re-adds
// dragon2 or double-applies the +=4 floor scale.
function DragonScene({ shadowOpacity }: { shadowOpacity: number }) {
  const { scene } = useGLTF(MODEL_URL)
  const { uOpacity } = useUniforms(() => ({ uOpacity: 1 }))

  useLayoutEffect(() => {
    uOpacity.value = shadowOpacity
  }, [uOpacity, shadowOpacity])

  useLayoutEffect(() => {
    if (scene.userData.shadowmapOpacitySetup) return
    scene.userData.shadowmapOpacitySetup = true

    const floor = scene.children[0] as Mesh
    floor.scale.x += 4
    floor.scale.y += 4
    floor.receiveShadow = true

    const dragon = scene.children[1] as Mesh
    dragon.position.set(-1.5, -0.8, 1)
    dragon.castShadow = true
    dragon.receiveShadow = true

    // Duck-typed cast (AGENTS.md B11 family): GLTFLoader hands back a classic
    // MeshPhysicalMaterial, but attenuationColor/castShadowNode both read fine at
    // runtime regardless of the material's declared TS type.
    const dragonMaterial = dragon.material as unknown as MeshPhysicalNodeMaterial

    const dragon2 = dragon.clone()
    dragon2.material = dragonMaterial.clone()
    dragon2.position.x += 4
    dragon2.castShadow = true
    dragon2.receiveShadow = true
    const dragon2Material = dragon2.material as MeshPhysicalNodeMaterial
    dragon2Material.attenuationColor = new Color('#ff0000')
    scene.add(dragon2)

    // opacity by color (mix(1, color, opacity)) — opacity by blending (mix into the
    // alpha channel instead) is the original's commented-out alternative.
    const opacityNode = uOpacity as unknown as Node<'float'>
    const customShadow = Fn(([shadowColorIn]) => {
      // Fn's destructured params come back as bare `ShaderNodeObject<Node>` (AGENTS.md
      // B10) — cast to the concrete vec3 type mix() needs.
      const shadowColor = shadowColorIn as unknown as Node<'vec3'>
      return mix(1, shadowColor, opacityNode)
    })

    dragonMaterial.castShadowNode = customShadow(color(dragonMaterial.attenuationColor))
    dragon2Material.castShadowNode = customShadow(color(dragon2Material.attenuationColor))
  }, [scene, uOpacity])

  return <primitive object={scene} position={[0, 0, -0.5]} />
}

export default function ShadowmapOpacity() {
  const { shadowOpacity, exposure, shadowRadius } = useControls('shadowmap-opacity', {
    shadowOpacity: { value: 1, min: 0, max: 1, step: 0.01, label: 'shadow opacity' },
    exposure: { value: 1.5, min: 0.1, max: 3, step: 0.05 },
    shadowRadius: { value: 4, min: 0, max: 12, step: 0.5, label: 'shadow radius' },
  })

  return (
    <Canvas
      renderer={{ toneMapping: AgXToneMapping }}
      shadows
      background="#9e9eff"
      camera={{ position: [-4, 2, 6], fov: 45, near: 0.1, far: 40 }}
    >
      <RendererSetup exposure={exposure} />
      <ambientLight intensity={0.5} />
      <directionalLight
        color="#6666ff"
        intensity={10}
        position={[3, 5, 17]}
        castShadow
        shadow-camera-near={0.1}
        shadow-camera-far={50}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-radius={shadowRadius}
      />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <DragonScene shadowOpacity={shadowOpacity} />
      </Suspense>
      <DemoHelpers grid={false} target={[0, 0, 0]} minDistance={0.1} maxDistance={10} />
    </Canvas>
  )
}
