/**
 * lights-pointlights
 * R3F port of three.js `webgpu_lights_pointlights`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_lights_pointlights (~110 lines of JS)
 *
 * DEMONSTRATES
 * - A custom `MeshPhongNodeMaterial.positionNode` driven by the LIVE positions of two
 *   orbiting `PointLight`s: `uniform(light.position)` wraps the light's own `Vector3`
 *   instance directly, so mutating `light.position.x/y/z` every frame (the orbit
 *   motion, done imperatively in `useFrame`) is automatically reflected in the vertex
 *   shader — no manual uniform sync required, the same wrap-a-live-object pattern as
 *   the built-in `modelWorldMatrixInverse` (auto-updates from `object.matrixWorld`
 *   every frame via `onObjectUpdate`)
 * - A one-time CPU geometry pass (`createGeometry`, ported near-verbatim): every source
 *   triangle is expanded into a 4-triangle tetrahedron (the 3 original vertices plus an
 *   inward-displaced centroid), baking three custom per-vertex attributes (`time`,
 *   `seed`, `displaceNormal`) that the TSL vertex shader reads back via
 *   `attribute(name)` — plain geometry processing, not rendering, so it runs once in a
 *   `useMemo` keyed on the loaded model, never per-frame
 * - `PointLight`s carrying a `MeshBasicMaterial` sphere as a real scene-graph child
 *   (`<pointLight><mesh>…`) that doubles as the light's own visible marker — same
 *   "child inherits the light's transform for free" pattern as
 *   `lights-rectarealight`'s `RectAreaLightHelper` / `lights-spotlight`'s
 *   `SpotLightHelper`, except here the child IS the visible light, not a debug overlay
 * - `OBJLoader` (three.js addon) via fiber's `useLoader` + `Suspense` — a mesh format
 *   with no material/scene metadata, same loading shape as `loader-gltf`'s `useGLTF`
 *
 * DIVERGENCE from original
 * - Both point lights' color/intensity and the shared orbit-speed multiplier are leva
 *   controls (`useControls`); the original hard-codes all three
 * - Each light's marker-sphere color is bound to that light's own leva color control
 *   (the original hard-codes the sphere's `MeshBasicMaterial` color separately,
 *   coincidentally matching the light's color) — recoloring a light now recolors its
 *   marker too
 * - OrbitControls -> this repo's CameraControls (via DemoHelpers); `enableDamping` is
 *   CameraControls' default behavior, nothing to configure
 * - DemoHelpers grid disabled (`grid={false}`) — the original scene is a black void
 *   with no floor; an infinite ground grid would be pure invention
 */
import { Suspense, useMemo, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber/webgpu'
import { folder, useControls } from 'leva'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import {
  abs,
  attribute,
  distance,
  float,
  max,
  modelWorldMatrixInverse,
  positionLocal,
  sin,
  time,
  uniform,
} from 'three/tsl'
import { BufferGeometry, Float32BufferAttribute, MeshPhongNodeMaterial, Plane, SphereGeometry, Vector3 } from 'three/webgpu'
import type { BufferAttribute, Mesh, PointLight } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const WALT_HEAD_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/obj/walt/WaltHead.obj'

// Shared marker-sphere geometry (radius 0.5, matches the original) — a constant asset,
// not mutable state, so a module-scope THREE instance is the idiomatic call here (same
// rationale as instance-mesh's scratch `dummy` Object3D).
const markerGeometry = new SphereGeometry(0.5, 16, 8)

// Ported near-verbatim from the original's `createGeometry()` — see header
// DEMONSTRATES. Pure CPU geometry processing: reads the source position attribute only,
// never mutates it, and returns a brand-new BufferGeometry.
function createGeometry(source: BufferGeometry) {
  const positionAttribute = source.getAttribute('position') as BufferAttribute

  const v0 = new Vector3()
  const v1 = new Vector3()
  const v2 = new Vector3()
  const v3 = new Vector3()
  const n = new Vector3()
  const plane = new Plane()

  const vertices: number[] = []
  const times: number[] = []
  const seeds: number[] = []
  const displaceNormal: number[] = []

  for (let i = 0; i < positionAttribute.count; i += 3) {
    v0.fromBufferAttribute(positionAttribute, i)
    v1.fromBufferAttribute(positionAttribute, i + 1)
    v2.fromBufferAttribute(positionAttribute, i + 2)

    plane.setFromCoplanarPoints(v0, v1, v2)

    v3.copy(v0).add(v1).add(v2).divideScalar(3) // triangle centroid
    v3.add(n.copy(plane.normal).multiplyScalar(-1)) // displace centroid inward

    // Emit a tetrahedron: the original face plus 3 faces to the displaced centroid.
    vertices.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z)
    vertices.push(v3.x, v3.y, v3.z, v1.x, v1.y, v1.z, v0.x, v0.y, v0.z)
    vertices.push(v3.x, v3.y, v3.z, v2.x, v2.y, v2.z, v1.x, v1.y, v1.z)
    vertices.push(v3.x, v3.y, v3.z, v0.x, v0.y, v0.z, v2.x, v2.y, v2.z)

    const t = Math.random()
    const s = Math.random()
    n.copy(plane.normal)

    for (let k = 0; k < 4; k++) {
      times.push(t, t, t)
      seeds.push(s, s, s)
      displaceNormal.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('time', new Float32BufferAttribute(times, 1))
  geometry.setAttribute('seed', new Float32BufferAttribute(seeds, 1))
  geometry.setAttribute('displaceNormal', new Float32BufferAttribute(displaceNormal, 3))
  geometry.computeVertexNormals()

  return geometry
}

// Builds the TSL vertex-displacement material, wired to both lights' LIVE positions —
// see header DEMONSTRATES.
function createMaterial(light1: PointLight, light2: PointLight) {
  const material = new MeshPhongNodeMaterial()

  // Explicit type args: `attribute<T>` infers `unknown` without one, which doesn't
  // structurally narrow to the math API used below (same family as
  // instancedBufferAttribute, documented in AGENTS.md).
  const seedAttribute = attribute<'float'>('seed')
  const displaceNormalAttribute = attribute<'vec3'>('displaceNormal')
  const localTime = attribute<'float'>('time').add(time)

  const effector1 = uniform(light1.position).toVar()
  const effector2 = uniform(light2.position).toVar()

  const distance1 = distance(positionLocal, modelWorldMatrixInverse.mul(effector1))
  const distance2 = distance(positionLocal, modelWorldMatrixInverse.mul(effector2))

  const invDistance1 = max(0, float(20).sub(distance1)).div(2)
  const invDistance2 = max(0, float(20).sub(distance2)).div(2)

  const s = abs(sin(localTime.mul(2).add(seedAttribute)).mul(0.5)).add(invDistance1).add(invDistance2)

  material.positionNode = positionLocal.add(displaceNormalAttribute.mul(s))

  return material
}

interface WaltHeadProps {
  light1Ref: RefObject<PointLight | null>
  light2Ref: RefObject<PointLight | null>
}

// Walt Disney's head: loaded as a plain OBJ (no material/scene data), then rebuilt into
// the tetrahedron-expanded geometry + light-driven material described in the header.
function WaltHead({ light1Ref, light2Ref }: WaltHeadProps) {
  const obj = useLoader(OBJLoader, WALT_HEAD_URL)

  const geometry = useMemo(() => createGeometry((obj.children[0] as Mesh).geometry as BufferGeometry), [obj])

  const material = useMemo(() => {
    const light1 = light1Ref.current
    const light2 = light2Ref.current
    // Both lights mount as siblings outside this Suspense boundary (see the page
    // component below), so their refs are already populated by the time the OBJ
    // fetch resolves and this runs.
    if (!light1 || !light2) return null
    return createMaterial(light1, light2)
  }, [light1Ref, light2Ref])

  if (!material) return null

  return <mesh geometry={geometry} material={material} scale={0.8} position={[0, -30, 0]} />
}

interface OrbitingLightProps {
  id: 1 | 2
  lightRef: RefObject<PointLight | null>
  color: string
  intensity: number
  speed: number
}

// One of the two orbiting point lights, each following its own fixed elliptical path
// (ported directly from the original's `animate()`) and carrying a matching-colored
// sphere as its own visible marker — see header DEMONSTRATES.
function OrbitingLight({ id, lightRef, color, intensity, speed }: OrbitingLightProps) {
  useFrame((state) => {
    const light = lightRef.current
    if (!light) return
    const t = state.elapsed * 0.5 * speed
    if (id === 1) {
      light.position.set(Math.sin(t) * 20, Math.cos(t * 0.75) * -30, Math.cos(t * 0.5) * 20)
    } else {
      light.position.set(Math.cos(t * 0.5) * 20, Math.sin(t * 0.75) * -30, Math.sin(t) * 20)
    }
  })

  return (
    <pointLight ref={lightRef} color={color} intensity={intensity}>
      <mesh geometry={markerGeometry}>
        <meshBasicMaterial color={color} />
      </mesh>
    </pointLight>
  )
}

export default function LightsPointlights() {
  const light1Ref = useRef<PointLight>(null)
  const light2Ref = useRef<PointLight>(null)

  const { speed, light1Color, light1Intensity, light2Color, light2Intensity, ambient } = useControls(
    'lights-pointlights',
    {
      speed: { value: 1, min: 0, max: 3, step: 0.05 },
      light1: folder({
        light1Color: { value: '#ff0040', label: 'color' },
        light1Intensity: { value: 2000, min: 0, max: 5000, step: 50, label: 'intensity' },
      }),
      light2: folder({
        light2Color: { value: '#0040ff', label: 'color' },
        light2Intensity: { value: 2000, min: 0, max: 5000, step: 50, label: 'intensity' },
      }),
      ambient: { value: 0.1, min: 0, max: 1, step: 0.01 },
    },
  )

  return (
    <Canvas renderer background="#000000" camera={{ position: [0, 0, 100], fov: 50, near: 1, far: 1000 }}>
      <ambientLight color="#aaaaaa" intensity={ambient} />
      <OrbitingLight id={1} lightRef={light1Ref} color={light1Color} intensity={light1Intensity} speed={speed} />
      <OrbitingLight id={2} lightRef={light2Ref} color={light2Color} intensity={light2Intensity} speed={speed} />
      <Suspense fallback={null}>
        <WaltHead light1Ref={light1Ref} light2Ref={light2Ref} />
      </Suspense>
      <DemoHelpers grid={false} minDistance={20} maxDistance={400} />
    </Canvas>
  )
}
