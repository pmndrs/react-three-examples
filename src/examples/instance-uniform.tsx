/**
 * instance-uniform
 * R3F port of three.js `webgpu_instance_uniform`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_instance_uniform (~160 lines of JS)
 *
 * DEMONSTRATES
 * - A custom `Node` subclass (`InstanceUniformNode`, ported from the original) with
 *   `updateType = NodeUpdateType.OBJECT`: its `update()` runs once per rendered object,
 *   copying that mesh's color into a single shared uniform — 12 teapots, ONE material,
 *   per-object color with zero material clones. The showcased imperative escape hatch.
 * - Composing the custom node into a shared TSL graph: `colorNode = instanceColor +
 *   cubeTexture`, `emissiveNode = instanceColor * cubeTexture` on a
 *   `MeshBasicNodeMaterial` (duck-typed `emissiveNode`, AGENTS.md B11 cast)
 * - Feeding per-mesh data to the node declaratively via the `userData` JSX prop —
 *   the React side of the per-object contract
 * - drei `useCubeTexture` (Suspense-gated, B17) for the environment cube map
 *
 * DIVERGENCE from original
 * - The original stores each color as an ad-hoc `mesh.color` expando property; the port
 *   uses `mesh.userData.color` — the three.js-sanctioned home for custom per-object
 *   state, and typable under strict tsc (the node reads `frame.object.userData.color`)
 * - Per-frame rotation increments (+0.01/+0.005 at an implicit 60 fps) are delta-scaled
 *   for frame-rate independence, with a leva `speed` slider added (original had no GUI)
 * - OrbitControls replaced by the DemoHelpers camera-controls baseline (same 400/2000
 *   distance limits); the corpus infinite grid is disabled in favor of the original's
 *   1000-unit `GridHelper` (the unit-scale corpus grid is invisible at this scene scale)
 * - `renderer.inspector` (three.js Inspector) dropped — this repo doesn't wire it
 * - Tone mapping pinned to `NoToneMapping` (the original relies on the WebGPURenderer
 *   default; fiber's Canvas would otherwise default to ACESFilmic)
 */
import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber/webgpu'
import { useCubeTexture } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js'
import { cubeTexture, uniform } from 'three/tsl'
import { Color, MeshBasicNodeMaterial, Node, NodeUpdateType, NoToneMapping } from 'three/webgpu'
import type { Mesh, NodeFrame } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const CUBE_PATH =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/cube/SwedishRoyalCastle/'
const CUBE_FILES = ['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg']

const TEAPOT_COUNT = 12

// Ported from the original `webgpu_instance_uniform` example (three.js authors).
// One uniform, updated per OBJECT: the renderer calls update() right before drawing
// each mesh that uses this node, so every mesh sees its own color in the same
// compiled shader — the per-object-uniform pattern this example exists to teach.
class InstanceUniformNode extends Node {
  uniformNode = uniform(new Color())

  constructor() {
    super('vec3')
    this.updateType = NodeUpdateType.OBJECT
  }

  update(frame: NodeFrame): boolean | undefined {
    const color = frame.object?.userData.color as Color | undefined
    if (color) this.uniformNode.value.copy(color)
    return undefined
  }

  setup() {
    return this.uniformNode
  }
}

interface TeapotData {
  color: Color
  position: [number, number, number]
  rotation: [number, number, number]
}

function Teapots({ speed }: { speed: number }) {
  const textureCube = useCubeTexture(CUBE_FILES, { path: CUBE_PATH })

  const geometry = useMemo(() => new TeapotGeometry(50, 18), [])

  // ONE material shared by all 12 meshes — the custom node supplies per-object color.
  const material = useMemo(() => {
    // Runtime installs the fluent TSL surface on Node.prototype, but @types/three only
    // carries it on the typed `Node<T>` alias — cast the custom-node instance and the
    // vec4-flavored cube texture node once (AGENTS.md B10/B11 cast family).
    const instanceColor = new InstanceUniformNode() as unknown as Node<'vec3'>
    const envColor = cubeTexture(textureCube) as unknown as Node<'vec3'>

    const mat = new MeshBasicNodeMaterial()
    mat.colorNode = instanceColor.add(envColor)
    // B11: NodeMaterial.setupOutgoingLight reads `emissiveNode` generically at runtime
    // (verified in renderers/common), but @types/three declares it only on
    // MeshStandardNodeMaterial — documented duck-typing cast.
    ;(mat as MeshBasicNodeMaterial & { emissiveNode: Node | null }).emissiveNode =
      instanceColor.mul(envColor)
    return mat
  }, [textureCube])

  // Random colors and rotations rolled once per mount, like the original's init().
  const teapots = useMemo<TeapotData[]>(
    () =>
      Array.from({ length: TEAPOT_COUNT }, (_, i) => ({
        color: new Color(Math.random() * 0xffffff),
        position: [(i % 4) * 200 - 300, 0, Math.floor(i / 4) * 200 - 200],
        rotation: [
          Math.random() * 200 - 100,
          Math.random() * 200 - 100,
          Math.random() * 200 - 100,
        ],
      })),
    [],
  )

  const meshRefs = useRef<(Mesh | null)[]>([])

  useFrame((_, delta) => {
    // Original tuned at +0.01/+0.005 per frame at 60 fps — delta-scaled here.
    const step = 60 * delta * speed
    for (const mesh of meshRefs.current) {
      if (!mesh) continue
      mesh.rotation.x += 0.01 * step
      mesh.rotation.y += 0.005 * step
    }
  })

  return (
    <>
      {teapots.map((teapot, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            meshRefs.current[i] = mesh
          }}
          geometry={geometry}
          material={material}
          position={teapot.position}
          rotation={teapot.rotation}
          userData={{ color: teapot.color }}
        />
      ))}
    </>
  )
}

export default function InstanceUniform() {
  const { speed } = useControls('instance-uniform', {
    speed: { value: 1, min: 0, max: 3, step: 0.01 },
  })

  return (
    <Canvas
      // Original never sets a tone mapping (WebGPURenderer default NoToneMapping) —
      // pinned deliberately; fiber's Canvas would default to ACESFilmic (AGENTS.md).
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 200, 1200], fov: 45, near: 1, far: 4000 }}
    >
      {/* B17 gate: useCubeTexture suspends — never let suspension reach Canvas. */}
      <Suspense fallback={null}>
        <Teapots speed={speed} />
      </Suspense>
      {/* The original's GridHelper, kept over the corpus grid — see header DIVERGENCE. */}
      <gridHelper args={[1000, 40, '#303030', '#303030']} position={[0, -75, 0]} />
      <DemoHelpers grid={false} minDistance={400} maxDistance={2000} />
    </Canvas>
  )
}
