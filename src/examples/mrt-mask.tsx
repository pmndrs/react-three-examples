/**
 * mrt-mask
 * R3F port of three.js `webgpu_mrt_mask`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_mrt_mask (~150 lines of JS)
 *
 * DEMONSTRATES
 * - Per-MATERIAL MRT override: `material.mrtNode` merges into the scene pass's MRT
 *   config for just that object (`PassNode.merge()`), so individual meshes can write
 *   extra data into a channel the rest of the scene leaves at its default — here, a
 *   'mask' channel that is `vec4(0)` (invisible) everywhere except the objects opting
 *   in via their own `mrtNode`
 * - A selective glow/bloom built entirely from that mask: the mask channel is blurred
 *   (`gaussianBlur`) and screen-composited back onto the beauty channel — only the
 *   masked objects appear to glow, at zero extra geometry passes
 * - `material.mrtNode = mrt({ mask: output.add(1) })` on a loaded glTF mesh vs.
 *   `mrt({ mask: output })` on a primitive mesh — two different per-object mask
 *   intensities composited through the same blur
 * - A camera-attached `<spotLight>` via drei's `<PerspectiveCamera makeDefault>` (the
 *   declarative equivalent of the original's `camera.add(light)`) — a headlamp that
 *   always faces what the camera is looking at
 * - `scene.backgroundNode` as a plain TSL gradient (`screenUV.y.mix(...)`) instead of
 *   a texture — background can be ANY node graph, not just an image
 *
 * DIVERGENCE from original
 * - The original pauses the spheres' auto-rotation during camera drag via
 *   OrbitControls' `start`/`end` events; ported using `camera-controls`' equivalent
 *   `controlstart`/`controlend` events on the `controlsRef` escape hatch (the
 *   showcased imperative path for behavior CameraControls doesn't model declaratively)
 * - `renderer.inspector` is not wired in this repo (no divergence in controls — the
 *   original ships no GUI either, this example has none)
 * - DemoHelpers baseline (camera-controls only, `grid={false}`: the original has no
 *   ground plane, just the gradient sky) replaces the bare `OrbitControls`
 * - Michelle's dance clip is played BY NAME (its single clip, read off
 *   `animations[0].name`) rather than the original's `gltf.animations[0]` index
 */
import { Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { PerspectiveCamera, useAnimations, useGLTF } from '@react-three/drei/webgpu'
import { color, mrt, output, screenUV, vec4 } from 'three/tsl'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { NeutralToneMapping, MathUtils } from 'three/webgpu'
import type { Group, Mesh, Node } from 'three/webgpu'
import type CameraControlsImpl from 'camera-controls'
import { useRenderPipeline } from '@react-three/fiber/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const MICHELLE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Michelle.glb'

const SPHERE_COLORS: [color: number, glow: boolean][] = [
  [0x0000ff, true],
  [0x00ff00, false],
  [0xff0000, false],
  [0x00ffff, false],
]

// scene.backgroundNode as a plain gradient — @types/three's Scene doesn't declare
// this even though the WebGPU renderer reads it off the live scene (duck-typed
// *Node gap, UPSTREAM B11).
function GradientBackground() {
  const scene = useThree((s) => s.scene)

  useLayoutEffect(() => {
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null }
    withBackgroundNode.backgroundNode = screenUV.y.mix(color(0x66bbff), color(0x4466ff)).mul(0.05)
    return () => {
      withBackgroundNode.backgroundNode = null
    }
  }, [scene])

  return null
}

// The animated dancer, marked with a stronger per-material mask ('glow effect' in
// the original) than the plain spheres below — `output.add(1)` overdrives the mask
// channel for a hotter blur. `.mrtNode` is duck-typed (same B11 family as
// backgroundNode) and must land before the first shader-graph build (AGENTS.md
// imperative-setup rule), hence useLayoutEffect.
function Michelle() {
  const { scene, animations } = useGLTF(MICHELLE_URL)
  const { actions } = useAnimations(animations, scene)

  useEffect(() => {
    const name = animations[0]?.name
    if (name) actions[name]?.play()
  }, [actions, animations])

  useLayoutEffect(() => {
    let applied = false
    scene.traverse((child) => {
      if (applied) return
      const mesh = child as Mesh
      if (mesh.isMesh) {
        const material = mesh.material as unknown as { mrtNode: Node | null }
        material.mrtNode = mrt({ mask: output.add(1) })
        applied = true
      }
    })
  }, [scene])

  return <primitive object={scene} />
}

interface SphereProps {
  position: [number, number, number]
  colorHex: number
  glow: boolean
}

function GlowSphere({ position, colorHex, glow }: SphereProps) {
  const materialRef = useRef<{ mrtNode: Node | null }>(null)

  useLayoutEffect(() => {
    const material = materialRef.current
    if (!glow || !material) return
    material.mrtNode = mrt({ mask: output })
    return () => {
      material.mrtNode = null
    }
  }, [glow])

  return (
    <mesh position={position}>
      <sphereGeometry args={[0.3, 32, 16]} />
      {/* mrtNode cast: same B11 duck-typed *Node family as scene.backgroundNode. */}
      <meshStandardNodeMaterial ref={materialRef as never} color={colorHex} />
    </mesh>
  )
}

// Four spheres around a circle, auto-rotating unless the camera is being dragged —
// `controlstart`/`controlend` are camera-controls' equivalent of OrbitControls'
// `start`/`end` events, reached via the controlsRef escape hatch.
function Spheres({ controlsRef }: { controlsRef: React.RefObject<CameraControlsImpl | null> }) {
  const groupRef = useRef<Group>(null)
  const rotating = useRef(true)

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const onStart = () => {
      rotating.current = false
    }
    const onEnd = () => {
      rotating.current = true
    }
    controls.addEventListener('controlstart', onStart)
    controls.addEventListener('controlend', onEnd)
    return () => {
      controls.removeEventListener('controlstart', onStart)
      controls.removeEventListener('controlend', onEnd)
    }
  }, [controlsRef])

  useFrame((_, delta) => {
    if (rotating.current && groupRef.current) groupRef.current.rotation.y += delta * 0.5
  })

  return (
    <group ref={groupRef}>
      {SPHERE_COLORS.map(([colorHex, glow], id) => {
        const distance = 1
        const rotation = MathUtils.degToRad(id * 90)
        return (
          <GlowSphere
            key={id}
            position={[Math.cos(rotation) * distance, 1, Math.sin(rotation) * distance]}
            colorHex={colorHex}
            glow={glow}
          />
        )
      })}
    </group>
  )
}

// Scene-pass MRT: beauty ('output') + a 'mask' channel individual materials opt into
// via their own `mrtNode`. The pipeline output is the beauty channel plus a Gaussian
// blur of the mask — a selective glow with zero extra geometry passes.
function MaskPipeline() {
  useRenderPipeline(
    ({ renderPipeline, passes }) => {
      if (!renderPipeline) return

      const colorPass = passes.scenePass.getTextureNode()
      const maskPass = passes.scenePass.getTextureNode('mask')

      renderPipeline.outputColorTransform = false
      renderPipeline.outputNode = colorPass.add(gaussianBlur(maskPass, 1, 20).mul(0.3)).renderOutput()
    },
    ({ passes }) => {
      passes.scenePass.setMRT(
        mrt({
          output: output.renderOutput(),
          mask: vec4(0), // default: empty everywhere a material doesn't set its own mrtNode
        }),
      )
    },
  )

  return null
}

export default function MrtMask() {
  const controlsRef = useRef<CameraControlsImpl>(null)

  return (
    <Canvas renderer={{ toneMapping: NeutralToneMapping, toneMappingExposure: 0.4 }}>
      {/* makeDefault replaces Canvas's implicit camera entirely — the spot light
          child is the declarative equivalent of the original's `camera.add(light)`. */}
      <PerspectiveCamera makeDefault position={[1, 2, 3]} fov={50} near={0.01} far={100}>
        <spotLight color="#ffffff" intensity={1} power={2000} />
      </PerspectiveCamera>
      <GradientBackground />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <Michelle />
      </Suspense>
      <Spheres controlsRef={controlsRef} />
      <MaskPipeline />
      <DemoHelpers grid={false} target={[0, 1, 0]} controlsRef={controlsRef} />
    </Canvas>
  )
}
