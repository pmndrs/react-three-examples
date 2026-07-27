/**
 * lights-rectarealight
 * R3F port of three.js `webgpu_lights_rectarealight`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_lights_rectarealight (~80 lines of JS)
 *
 * DEMONSTRATES
 * - `RectAreaLight` on the WebGPU backend, which needs its LTC (linearly-transformed
 *   cosine) BRDF approximation textures registered globally, once, before any
 *   rect-area-lit material can compile — `RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init())`,
 *   run at module load (mirrors the original's `init()`-time call; no React-owned
 *   state involved, so it doesn't need an effect)
 * - `RectAreaLightHelper` (three.js addon, not a drei helper) attached as an actual
 *   child of each light via a plain imperative effect — the helper's own docs require
 *   `light.add(helper)` so it inherits the light's transform, which matters here since
 *   the lights spin every frame
 * - `checker(uv().mul(scale))` (TSL) driving `meshStandardNodeMaterial`'s
 *   `roughnessNode` — a per-fragment roughness pattern with zero extra draw calls,
 *   the same node-composition style used by the other TSL ports in this repo
 *
 * DIVERGENCE from original
 * - Per-light rotation speed exposed as one leva `speed` multiplier (scales all three
 *   lights' spin together, same ratios as the original's hard-coded
 *   `-delta`/`delta*0.5`/`delta`); intensity/width/height (shared across all three
 *   lights) and the floor's checker scale are also leva controls — the original hard-
 *   codes every one of these
 * - Knot `roughness`/`metalness` exposed via leva (both default to the original's 0/0)
 *   to make it easy to see how RectAreaLight highlights react to surface glossiness
 * - Helper visibility toggle (`helpers`) added; the original always shows them
 * - DemoHelpers grid disabled (`grid={false}`) — the scene already has its own huge
 *   floor slab as ground, and DemoHelpers' grid plane (y = 0.002) would render
 *   underneath/inside it, invisible and pointless
 * - OrbitControls replaced with this repo's CameraControls wrapper (via DemoHelpers),
 *   targeting the knot's position like the original's `controls.target`
 */
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber/webgpu'
import { folder, useControls } from 'leva'
import { checker, uv } from 'three/tsl'
import { RectAreaLightHelper } from 'three/addons/helpers/RectAreaLightHelper.js'
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js'
import { RectAreaLightNode } from 'three/webgpu'
import type { RectAreaLight } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

// One-time, global BRDF texture registration for RectAreaLight on the WebGPU backend —
// see header DEMONSTRATES. Idempotent (just assigns a static field), so running it at
// module load (rather than gating it behind an effect) is safe and simplest.
RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init())

const KNOT_POSITION: [number, number, number] = [0, 5.5, 0]

interface RectAreaLightsProps {
  speed: number
  intensity: number
  width: number
  height: number
  helpers: boolean
}

// Three spinning RectAreaLights, each with a RectAreaLightHelper nested as a real
// scene-graph child (see header DEMONSTRATES) so the wireframe rectangle tracks the
// light's own rotation for free.
function RectAreaLights({ speed, intensity, width, height, helpers }: RectAreaLightsProps) {
  const light1Ref = useRef<RectAreaLight>(null)
  const light2Ref = useRef<RectAreaLight>(null)
  const light3Ref = useRef<RectAreaLight>(null)

  useEffect(() => {
    if (!helpers) return
    const lights = [light1Ref.current, light2Ref.current, light3Ref.current]
    const attached = lights.map((light) => {
      if (!light) return null
      const helper = new RectAreaLightHelper(light)
      light.add(helper)
      return helper
    })
    return () => {
      attached.forEach((helper, i) => {
        const light = lights[i]
        if (!light || !helper) return
        light.remove(helper)
        helper.dispose()
      })
    }
  }, [helpers])

  useFrame((_state, delta) => {
    const l1 = light1Ref.current
    const l2 = light2Ref.current
    const l3 = light3Ref.current
    if (!l1 || !l2 || !l3) return
    l1.rotation.y -= delta * speed
    l2.rotation.y += delta * 0.5 * speed
    l3.rotation.y += delta * speed
  })

  return (
    <>
      <rectAreaLight
        ref={light1Ref}
        color="#ff0000"
        intensity={intensity}
        width={width}
        height={height}
        position={[-5, 6, 5]}
      />
      <rectAreaLight
        ref={light2Ref}
        color="#00ff00"
        intensity={intensity}
        width={width}
        height={height}
        position={[0, 6, 5]}
      />
      <rectAreaLight
        ref={light3Ref}
        color="#0000ff"
        intensity={intensity}
        width={width}
        height={height}
        position={[5, 6, 5]}
      />
    </>
  )
}

// Huge floor slab; roughness driven per-fragment by a TSL checker pattern instead of a
// flat scalar — see header DEMONSTRATES.
function Floor({ checkerScale }: { checkerScale: number }) {
  const roughnessNode = useMemo(() => checker(uv().mul(checkerScale)), [checkerScale])

  return (
    <mesh position={[0, -0.05, 0]}>
      <boxGeometry args={[2000, 0.1, 2000]} />
      <meshStandardNodeMaterial color="#444444" roughnessNode={roughnessNode} />
    </mesh>
  )
}

// Glossy torus knot — the RectAreaLight showcase surface.
function Knot({ roughness, metalness }: { roughness: number; metalness: number }) {
  return (
    <mesh position={KNOT_POSITION}>
      <torusKnotGeometry args={[1.5, 0.5, 200, 16]} />
      <meshStandardMaterial color="#ffffff" roughness={roughness} metalness={metalness} />
    </mesh>
  )
}

export default function LightsRectAreaLight() {
  const { speed, intensity, width, height, helpers, roughness, metalness, checkerScale } = useControls(
    'rectarealight',
    {
      lights: folder({
        speed: { value: 1, min: 0, max: 3, step: 0.05 },
        intensity: { value: 5, min: 0, max: 20, step: 0.5 },
        width: { value: 4, min: 1, max: 10, step: 0.5 },
        height: { value: 10, min: 1, max: 20, step: 0.5 },
        helpers: true,
      }),
      knot: folder({
        roughness: { value: 0, min: 0, max: 1, step: 0.05 },
        metalness: { value: 0, min: 0, max: 1, step: 0.05 },
      }),
      floor: folder({
        checkerScale: { value: 400, min: 50, max: 800, step: 10 },
      }),
    },
  )

  return (
    <Canvas renderer background="#000000" camera={{ position: [0, 5, -15], fov: 45, near: 1, far: 1000 }}>
      <RectAreaLights speed={speed} intensity={intensity} width={width} height={height} helpers={helpers} />
      <Floor checkerScale={checkerScale} />
      <Knot roughness={roughness} metalness={metalness} />
      <DemoHelpers grid={false} target={KNOT_POSITION} />
    </Canvas>
  )
}
