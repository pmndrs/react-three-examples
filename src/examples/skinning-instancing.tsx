/**
 * skinning-instancing
 * R3F port of three.js `webgpu_skinning_instancing`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_skinning_instancing (~186 lines of JS)
 *
 * DEMONSTRATES
 * - Manual GPU instancing of a single skinned mesh (one skeleton, N instance
 *   transforms) via the `isInstancedMesh` + `instanceMatrix` escape hatch — three.js's
 *   own pattern for this, no drei or fiber JSX equivalent exists
 * - Per-instance TSL variation: a `range()` node samples a different color/metalness
 *   per GPU instance, blended over time by an `oscSine(time)` oscillator
 * - `useRenderPipeline` with a depth-driven `gaussianBlur` post-process, blended via a
 *   leva-controlled uniform (pipeline callbacks don't re-run on render, so the blend
 *   amount must live in a uniform, not a closure value)
 * - Escape hatch: a point light attached to the camera via `camera.add()` in an effect
 *   (no declarative "light as camera child" in R3F)
 *
 * DIVERGENCE from original
 * - Original's large invisible black ground plane (pure depth-catcher for the blur's
 *   `remapClamp` range) dropped in favor of DemoHelpers' grid, which renders real scene
 *   depth at the origin
 * - leva controls added: instance count, mixer timeScale/paused, blur amount
 *   (original always renders the blur at full strength with no UI)
 * - DemoHelpers baseline (grid + camera controls) added; original had a fixed camera
 */
import { useEffect, useMemo } from 'react'
import { Canvas, useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu'
import { useAnimations, useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { color, mix, oscSine, range, time } from 'three/tsl'
import { Color, InstancedBufferAttribute, Mesh, MeshStandardNodeMaterial, Object3D, PointLight } from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const MICHELLE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Michelle.glb'

// Instance grid layout (matches the original's fixed 5-column arrangement).
const COLUMNS = 5

// Three.js's manual-instancing escape hatch: a plain Mesh masquerading as an
// InstancedMesh by setting these three fields directly (no InstancedMesh class).
type InstancedSkinnedMesh = Mesh & {
  isInstancedMesh: boolean
  instanceMatrix: InstancedBufferAttribute
  count: number
}

// Point light rigidly attached to the camera (a "headlight"). No declarative
// "light as camera child" pattern exists in R3F, so this is wired imperatively.
function CameraLight() {
  const camera = useThree((s) => s.camera)
  const light = useMemo(() => {
    const l = new PointLight('#0099ff', 1, 100)
    l.power = 400
    return l
  }, [])

  useEffect(() => {
    camera.add(light)
    return () => {
      camera.remove(light)
    }
  }, [camera, light])

  return null
}

interface MichelleProps {
  instances: number
  timeScale: number
  paused: boolean
}

function Michelle({ instances, timeScale, paused }: MichelleProps) {
  const { scene, animations } = useGLTF(MICHELLE_URL)
  const { actions, mixer } = useAnimations(animations, scene)

  useEffect(() => {
    const first = Object.values(actions)[0]
    first?.play()
  }, [actions])

  useEffect(() => {
    mixer.timeScale = paused ? 0 : timeScale
  }, [mixer, paused, timeScale])

  // Node material + per-instance TSL variation — set up once per loaded scene.
  useEffect(() => {
    scene.traverse((child) => {
      if (!(child as Mesh).isMesh) return
      const mesh = child as Mesh

      const oscNode = oscSine(time.mul(0.1))
      // Random per-instance color/metalness between 0 and 1 (the `range()` node
      // samples one value per GPU instance, not per vertex/fragment).
      const randomColors = range(new Color(0x000000), new Color(0xffffff))
      const randomMetalness = range(0, 1)

      const material = new MeshStandardNodeMaterial()
      material.roughness = 0.1
      material.metalnessNode = mix(0.0, randomMetalness, oscNode)
      material.colorNode = mix(color(0xffffff), randomColors, oscNode)
      mesh.material = material
    })
  }, [scene])

  // Instance transforms: draw the ONE skinned mesh `instances` times from a
  // manually-populated instanceMatrix buffer.
  useEffect(() => {
    const dummy = new Object3D()
    scene.traverse((child) => {
      if (!(child as Mesh).isMesh) return
      const mesh = child as InstancedSkinnedMesh

      mesh.isInstancedMesh = true
      mesh.instanceMatrix = new InstancedBufferAttribute(new Float32Array(instances * 16), 16)
      mesh.count = instances

      for (let i = 0; i < instances; i++) {
        dummy.position.x = -200 + (i % COLUMNS) * 70
        dummy.position.y = Math.floor(i / COLUMNS) * -200
        dummy.updateMatrix()
        dummy.matrix.toArray(mesh.instanceMatrix.array, i * 16)
      }
    })
  }, [scene, instances])

  return <primitive object={scene} />
}

function PostFX({ blur }: { blur: number }) {
  const { uBlur } = useUniforms(() => ({ uBlur: blur }))

  useEffect(() => {
    uBlur.value = blur
  }, [uBlur, blur])

  useRenderPipeline(({ renderPipeline, passes }) => {
    if (!renderPipeline) return

    const sceneColor = passes.scenePass.getTextureNode()
    // Blur radius grows with distance from camera (depth-driven, like a focus falloff).
    const depth = passes.scenePass.getLinearDepthNode().remapClamp(0.15, 0.3)

    const blurred = gaussianBlur(sceneColor)
    blurred.directionNode = depth

    // Blend against the uniform node (not the `blur` prop value) — pipeline callbacks
    // don't re-run on render, so dynamic values must live behind a uniform, and `uBlur`'s
    // identity is stable across re-renders (create-if-not-exists), so the closure stays live.
    // Cast: fiber's `UniformNode<T>` pins the TSL node-type parameter to `unknown` (see the
    // type's own doc comment in @react-three/fiber/webgpu), so it never structurally narrows
    // to `Node<"float">` for TSL math functions — even though it is one at runtime.
    renderPipeline.outputNode = mix(sceneColor, blurred, uBlur as unknown as Node<'float'>)
  })

  return null
}

export default function SkinningInstancing() {
  const { instances, timeScale, paused, blur } = useControls('skinning-instancing', {
    instances: { value: 30, min: 5, max: 60, step: 5 },
    timeScale: { value: 1, min: 0, max: 2 },
    paused: false,
    blur: { value: 1, min: 0, max: 1 },
  })

  return (
    <Canvas renderer background="#000000" camera={{ position: [1, 2, 3], fov: 50, near: 0.01, far: 40 }}>
      <pointLight color="#ff9900" position={[0, 4.5, -2]} power={400} />
      <CameraLight />
      <Michelle instances={instances} timeScale={timeScale} paused={paused} />
      <PostFX blur={blur} />
      <DemoHelpers target={[0, 1, 0]} />
    </Canvas>
  )
}
