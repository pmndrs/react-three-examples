/**
 * backdrop-area
 * R3F port of three.js `webgpu_backdrop_area`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_backdrop_area (~140 lines of JS)
 *
 * DEMONSTRATES
 * - `viewportLinearDepth` (already-rendered scene depth) compared against `linearDepth()`
 *   (the mesh currently being shaded) into a distance field (`depthDistance`) that drives
 *   both a soft depth-based alpha falloff and a `hashBlur()`-blurred
 *   `viewportSharedTexture()` sample — the same `backdropNode` escape hatch family as
 *   `backdrop`/`backdrop-water`, here demonstrating FOUR alternate
 *   `MeshBasicNodeMaterial.backdropNode` graphs on ONE box, switchable at runtime
 *   (depth-tinted blurred glass, raw depth silhouette, a `checker()`-masked blur, and a
 *   pixelated `viewportSharedTexture(screenUV...floor...)` sample)
 * - `modelScale` — a TSL builtin that reads the mesh's live `scale` each frame, feeding
 *   the checker material's UV tiling; the box's leva scale sliders need no manual
 *   uniform sync, just a plain `<mesh scale={...}>`
 * - `scene.backgroundNode` — a `screenUV.y` sky gradient rotated over time via `hue()`
 *   (same cast pattern as `backdrop`'s `SceneBackground`, `time`-driven here)
 * - `positionWorld.xz.distance(0)` on the floor's `opacityNode` — a world-space radial
 *   falloff that fades the floor to nothing at its edge instead of a hard clip
 *
 * DIVERGENCE from original
 * - The material switcher + box scale sliders move from `renderer.inspector` (three.js's
 *   internal debug GUI, not wired in this repo — same gap noted in
 *   `backdrop`/`backdrop-water`/`refraction`/`reflection`) to leva
 * - DemoHelpers baseline (grid + camera-controls orbit) added; `target` matches the
 *   original's `camera.lookAt`/`controls.target` of `(0, 1, 0)`
 * - `NeutralToneMapping` / `toneMappingExposure: 0.9` set via `<Canvas renderer={{...}}>`
 *   (Layer 1 rule) instead of imperative `renderer.toneMapping` assignment
 * - `renderer.inspector` dropped entirely (same gap as above)
 */
import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { useAnimations, useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { hashBlur } from 'three/addons/tsl/display/hashBlur.js'
import {
  checker,
  color,
  hue,
  linearDepth,
  modelScale,
  positionWorld,
  screenUV,
  time,
  uv,
  viewportLinearDepth,
  viewportSharedTexture,
} from 'three/tsl'
import { DoubleSide, MeshBasicNodeMaterial, NeutralToneMapping } from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const MICHELLE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Michelle.glb'

// scene.backgroundNode cast — @types/three's Scene doesn't declare it even though the
// webgpu renderer reads it directly off the live scene instance (same duck-typed gap as
// backdrop's SceneBackground, with a hue() rotation over time added here).
function SceneBackground() {
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null }
    withBackgroundNode.backgroundNode = hue(screenUV.y.mix(color(0x66bbff), color(0x4466ff)), time.mul(0.1))
    return () => {
      withBackgroundNode.backgroundNode = null
    }
  }, [scene])

  return null
}

function Michelle() {
  const { scene, animations } = useGLTF(MICHELLE_URL)
  const { actions } = useAnimations(animations, scene)

  useEffect(() => {
    // Michelle.glb ships a single clip — same "first action" idiom as backdrop/
    // backdrop-water (no named-clip ambiguity to worry about here).
    const first = Object.values(actions)[0]
    first?.play()
  }, [actions])

  return <primitive object={scene} />
}

// Four alternate `backdropNode` graphs for the box, switchable via leva — see header
// DEMONSTRATES. Built once: none of these graphs depend on React state (the checker
// material's tiling reads the box's live scale through `modelScale`, not a uniform we
// manage).
function useAreaMaterials() {
  return useMemo(() => {
    const depthDistance = viewportLinearDepth.distance(linearDepth())
    const depthAlphaNode = depthDistance.oneMinus().smoothstep(0.9, 2).mul(10).saturate()
    const depthBlurred = hashBlur(viewportSharedTexture(), depthDistance.smoothstep(0, 0.6).mul(40).clamp().mul(0.1))

    const blurred = new MeshBasicNodeMaterial()
    blurred.backdropNode = depthBlurred.add(depthAlphaNode.mix(color(0x003399).mul(0.3), 0))
    blurred.transparent = true
    blurred.side = DoubleSide

    const depth = new MeshBasicNodeMaterial()
    depth.backdropNode = depthAlphaNode
    depth.transparent = true
    depth.side = DoubleSide

    const checkerMat = new MeshBasicNodeMaterial()
    checkerMat.backdropNode = hashBlur(viewportSharedTexture(), 0.05)
    checkerMat.backdropAlphaNode = checker(uv().mul(3).mul(modelScale.xy))
    checkerMat.opacityNode = checkerMat.backdropAlphaNode
    checkerMat.transparent = true
    checkerMat.side = DoubleSide

    const pixel = new MeshBasicNodeMaterial()
    pixel.backdropNode = viewportSharedTexture(screenUV.mul(100).floor().div(100))
    pixel.transparent = true

    return { blurred, depth, checker: checkerMat, pixel }
  }, [])
}

function Scene() {
  const materials = useAreaMaterials()
  const { material, scaleX, scaleY } = useControls('backdrop-area', {
    material: { value: 'blurred', options: Object.keys(materials) },
    scaleX: { value: 1, min: 0.1, max: 2, step: 0.01, label: 'box scale x' },
    scaleY: { value: 1, min: 0.1, max: 2, step: 0.01, label: 'box scale y' },
  })

  return (
    <>
      <ambientLight intensity={2.5} />
      <Suspense fallback={null}>
        <Michelle />
      </Suspense>
      <mesh
        position={[0, 1, 0]}
        scale={[scaleX, scaleY, 1]}
        material={materials[material as keyof typeof materials]}
        renderOrder={1}
      >
        <boxGeometry args={[2, 2, 2]} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[5, 0.01, 5]} />
        <meshBasicNodeMaterial
          color={0xff6600}
          opacityNode={positionWorld.xz.distance(0).oneMinus().clamp()}
          transparent
          depthWrite={false}
        />
      </mesh>
    </>
  )
}

export default function BackdropArea() {
  return (
    <Canvas
      renderer={{ toneMapping: NeutralToneMapping, toneMappingExposure: 0.9 }}
      camera={{ position: [3, 2, 3], fov: 50, near: 0.25, far: 25 }}
    >
      <SceneBackground />
      <Scene />
      {/* Grid off: the example draws its own radially-fading grid floor — the
          DemoHelpers infinite grid double-exposes against it. */}
      <DemoHelpers grid={false} target={[0, 1, 0]} />
    </Canvas>
  )
}
