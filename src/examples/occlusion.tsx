/**
 * occlusion
 * R3F port of three.js `webgpu_occlusion`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_occlusion (~110 lines of JS)
 *
 * DEMONSTRATES
 * - WebGPU hardware occlusion queries: setting `mesh.occlusionTest = true` makes the
 *   renderer wrap that mesh's draw call in a GPU occlusion query, and
 *   `renderer.isOccluded(mesh)` reads back whether ANY samples survived the depth
 *   test — GPU-exact visibility, no CPU raycasting. (WebGPU-renderer capability;
 *   `occlusionTest` is duck-typed on Object3D — see the documented cast below.)
 * - A custom `Node` subclass (`OcclusionNode`, ported from the original) with
 *   `updateType = NodeUpdateType.OBJECT`: `update()` polls `isOccluded` each time the
 *   plane renders and copies the answer into a color uniform feeding the plane's
 *   `colorNode` — query result drives shading with zero React re-renders.
 * - Wiring an imperative test object into a declarative scene: the sphere mounts via
 *   JSX and a callback ref hands the live Mesh to the node; the plane mounts one
 *   commit later, once the node exists.
 *
 * DIVERGENCE from original
 * - leva controls added (original had none): a sphere-z slider pushes the sphere in
 *   and out of occlusion without touching the camera, and visible/occluded color
 *   pickers mutate the node's live Color objects (`update()` re-copies every frame).
 * - OrbitControls replaced by the DemoHelpers camera-controls baseline (same 3/25
 *   distance limits); the corpus grid is disabled — the original is a floating
 *   composition at the origin in a black void, and the unit grid would slice through
 *   both meshes.
 * - `OcclusionNode.update()` is synchronous — the original declares it `async` but
 *   awaits nothing (`isOccluded` is a sync readback of the latest resolved query).
 * - Tone mapping pinned to `NoToneMapping` (the original relies on the WebGPURenderer
 *   default; fiber's Canvas would otherwise default to ACESFilmic).
 */
import { useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { uniform } from 'three/tsl'
import { Color, DoubleSide, Node, NodeUpdateType, NoToneMapping } from 'three/webgpu'
import type { Mesh, NodeFrame, Object3D } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

// Original defaults: plane shows blue while the sphere is visible, green once the
// sphere is completely occluded behind it.
const VISIBLE_COLOR = 0x0000ff
const OCCLUDED_COLOR = 0x00ff00

// Ported from the original `webgpu_occlusion` example (three.js authors).
// updateType OBJECT: the renderer calls update() right before drawing each object
// that uses this node (here: the plane), so the uniform always carries the freshest
// occlusion-query result for the sphere — read on the CPU, consumed by the shader.
class OcclusionNode extends Node {
  uniformNode = uniform(new Color())

  testObject: Object3D
  normalColor: Color
  occludedColor: Color

  constructor(testObject: Object3D, normalColor: Color, occludedColor: Color) {
    super('vec3')
    this.updateType = NodeUpdateType.OBJECT
    this.testObject = testObject
    this.normalColor = normalColor
    this.occludedColor = occludedColor
  }

  update(frame: NodeFrame): boolean | undefined {
    if (frame.renderer === null) return undefined
    const isOccluded = frame.renderer.isOccluded(this.testObject)
    this.uniformNode.value.copy(isOccluded ? this.occludedColor : this.normalColor)
    return undefined
  }

  setup() {
    return this.uniformNode
  }
}

export default function Occlusion() {
  const { sphereZ, visibleColor, occludedColor } = useControls('occlusion', {
    sphereZ: { value: -1, min: -4, max: 2.5, step: 0.01, label: 'sphere z' },
    visibleColor: { value: '#0000ff', label: 'visible' },
    occludedColor: { value: '#00ff00', label: 'occluded' },
  })

  const [sphere, setSphere] = useState<Mesh | null>(null)

  // Built once the live sphere Mesh exists; leva colors are applied by mutation below
  // (the node holds the Color instances, update() copies from them per frame).
  const occlusionNode = useMemo(
    () =>
      sphere
        ? new OcclusionNode(sphere, new Color(VISIBLE_COLOR), new Color(OCCLUDED_COLOR))
        : null,
    [sphere],
  )

  useEffect(() => {
    if (!occlusionNode) return
    occlusionNode.normalColor.set(visibleColor)
    occlusionNode.occludedColor.set(occludedColor)
  }, [occlusionNode, visibleColor, occludedColor])

  return (
    <Canvas
      // Original never sets a tone mapping (WebGPURenderer default NoToneMapping) —
      // pinned deliberately; fiber's Canvas would default to ACESFilmic (AGENTS.md).
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 0, 7], fov: 50, near: 0.01, far: 100 }}
    >
      <ambientLight color={0xb0b0b0} />
      <directionalLight color={0xffffff} intensity={1} position={[0.32, 0.39, 0.7]} />

      {/* The occlusion-tested subject: fully behind the plane at z=-1 → occluded. */}
      <mesh
        position={[0, 0, sphereZ]}
        ref={(mesh) => {
          if (!mesh) return
          // The renderer reads `object.occlusionTest` generically (RenderList.js:305)
          // to wrap this mesh's draw in a GPU occlusion query, but @types/three does
          // not declare the flag on Object3D — documented duck-typing cast (AGENTS.md
          // B11 family; verified against renderers/common in node_modules/three).
          ;(mesh as Mesh & { occlusionTest: boolean }).occlusionTest = true
          setSphere(mesh)
        }}
      >
        <sphereGeometry args={[0.5]} />
        <meshPhongNodeMaterial color={0xffff00} />
      </mesh>

      {/* The indicator plane: its colorNode IS the occlusion readout. */}
      {occlusionNode && (
        <mesh>
          <planeGeometry args={[2, 2]} />
          <meshPhongNodeMaterial side={DoubleSide} colorNode={occlusionNode} />
        </mesh>
      )}

      <DemoHelpers grid={false} minDistance={3} maxDistance={25} />
    </Canvas>
  )
}
