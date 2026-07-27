/**
 * mesh-batch
 * R3F port of three.js `webgpu_mesh_batch`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_mesh_batch (~330 lines of JS)
 *
 * DEMONSTRATES
 * - `THREE.BatchedMesh` — thousands of cones/boxes/spheres drawn in a single call,
 *   built imperatively (`addGeometry` / `addInstance` / `setMatrixAt` / `setColorAt`)
 *   and mounted with `<primitive>`; the batch setup is three.js's own API and stays
 *   visible in the component that owns it (the showcased escape hatch)
 * - Live BatchedMesh knobs: `sortObjects` / `perObjectFrustumCulled` applied
 *   declaratively as `<primitive>` props, geometry reshuffling via `setGeometryIdAt`,
 *   and a custom hybrid radix sort (`setCustomSort` + `radixSort` from three/addons)
 * - Per-frame instance animation through the matrix API (`getMatrixAt` → multiply →
 *   `setMatrixAt`) for the first `dynamic` instances
 * - Whole-material opacity: flipping `transparent`/`depthWrite` + `needsUpdate` at the
 *   1.0 boundary, which the custom sort reads live to reverse its draw order
 * - Unlit custom shading via `outputNode` (per-instance diffuse color modulated by the
 *   packed view-space normal) on `MeshBasicNodeMaterial`
 *
 * DIVERGENCE from original
 * - Inspector `createParameters` GUI replaced with leva `useControls`; the
 *   "randomize geometry" button increments a nonce consumed by an effect inside the
 *   Canvas (leva lives outside the Canvas, the mesh inside).
 * - The WebGPU/WebGL renderer toggle is dropped (every port here is WebGPU) along
 *   with its pink `forceWebGL` background variant.
 * - `count` changes remount the keyed batch component, which rebuilds mesh + material
 *   via lazy `useState` — the original's manual `cleanup()`/`dispose()` is replaced by
 *   remount + GC: `BatchedMesh.dispose()` nulls internal textures, so a StrictMode-safe
 *   effect cleanup must not dispose the create-once instance (AGENTS.md).
 * - The custom sort keeps its scratch options in a closure instead of the original's
 *   untyped `this._options` stash on the mesh (identical behavior, strict-tsc safe).
 * - OrbitControls autoRotate becomes the DemoHelpers/camera-controls baseline at the
 *   same OrbitControls-compatible speed; grid off (free-floating instance cloud).
 */
import { useEffect, useMemo, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber/webgpu'
import { button, useControls } from 'leva'
import { diffuseColor, normalView, packNormalToRGB, vec4 } from 'three/tsl'
import {
  BatchedMesh,
  BoxGeometry,
  Color,
  ConeGeometry,
  Euler,
  Matrix4,
  MeshBasicNodeMaterial,
  NoToneMapping,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three/webgpu'
import type { Camera, Material, PerspectiveCamera } from 'three/webgpu'
import { radixSort } from 'three/addons/utils/SortUtils.js'
import { DemoHelpers } from '../utils/DemoHelpers'

const MAX_INSTANCE_COUNT = 20000

// Scratch objects reused across matrix randomization and the per-frame rotation loop
// (no per-call allocation) — reusable setup, not stateful (values are always rewritten
// before use).
const scratchMatrix = new Matrix4()
const scratchPosition = new Vector3()
const scratchEuler = new Euler()
const scratchQuaternion = new Quaternion()
const scratchScale = new Vector3()

function randomizeMatrix(matrix: Matrix4) {
  scratchPosition.set(Math.random() * 40 - 20, Math.random() * 40 - 20, Math.random() * 40 - 20)
  scratchEuler.set(Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI)
  scratchQuaternion.setFromEuler(scratchEuler)
  const s = 0.5 + Math.random() * 0.5
  scratchScale.set(s, s, s)
  return matrix.compose(scratchPosition, scratchQuaternion, scratchScale)
}

/** One BatchedMesh holding `count` instances of three template geometries. */
function buildBatch(count: number) {
  const geometries = [
    new ConeGeometry(1.0, 2.0),
    new BoxGeometry(2.0, 2.0, 2.0),
    new SphereGeometry(1.0, 16, 8),
  ]

  // Unlit shading: per-instance diffuse color scaled by the packed view-space normal's
  // green channel — a cheap top-lit look with no lights in the scene.
  const material = new MeshBasicNodeMaterial()
  material.outputNode = vec4(
    diffuseColor.mul(packNormalToRGB(normalView).y.add(0.5)).rgb,
    diffuseColor.a,
  )

  // Vertex/index budget covers the three template geometries once — instances share them.
  const mesh = new BatchedMesh(count, geometries.length * 512, geometries.length * 1024, material)

  // Disable whole-object frustum culling: any instance can be dynamic, so per-object
  // culling (the `perObjectFrustumCulled` control) does the work instead.
  mesh.frustumCulled = false

  const geometryIds = geometries.map((geometry) => mesh.addGeometry(geometry))

  const ids: number[] = []
  const rotationSpeeds: Matrix4[] = []

  for (let i = 0; i < count; i++) {
    const id = mesh.addInstance(geometryIds[i % geometryIds.length])
    mesh.setMatrixAt(id, randomizeMatrix(scratchMatrix))
    mesh.setColorAt(id, new Color(Math.random() * 0xffffff))

    scratchEuler.set(Math.random() * 0.01, Math.random() * 0.01, Math.random() * 0.01)
    rotationSpeeds.push(new Matrix4().makeRotationFromEuler(scratchEuler))
    ids.push(id)
  }

  return { mesh, material, ids, rotationSpeeds, geometryCount: geometries.length }
}

type BatchDrawItem = { start: number; count: number; z: number }

/**
 * Depth sort via three's hybrid radix sort — O(n) against the default O(n log n)
 * comparison sort. Scratch options live in this closure (see header DIVERGENCE).
 */
function createRadixSort(maxInstanceCount: number, material: Material) {
  const options = {
    get: (el: BatchDrawItem) => el.z,
    aux: new Array<BatchDrawItem>(maxInstanceCount),
    reversed: false,
  }

  return function sortFunction(list: BatchDrawItem[], camera: Camera) {
    // Transparent draws back-to-front, opaque front-to-back (three's default order).
    options.reversed = material.transparent

    // Convert view depth to the unsigned 32-bit range the radix sort buckets on.
    // setCustomSort types `camera` as base Camera (no `far`); the batch is only ever
    // sorted against the scene's perspective camera here.
    const factor = (2 ** 32 - 1) / (camera as PerspectiveCamera).far
    for (let i = 0, l = list.length; i < l; i++) list[i].z *= factor

    radixSort(list, options)
  }
}

interface BatchedShapesProps {
  count: number
  dynamic: number
  opacity: number
  sortObjects: boolean
  perObjectFrustumCulled: boolean
  useCustomSort: boolean
  randomizeNonce: number
}

function BatchedShapes({
  count,
  dynamic,
  opacity,
  sortObjects,
  perObjectFrustumCulled,
  useCustomSort,
  randomizeNonce,
}: BatchedShapesProps) {
  // Built once per `count` (the parent keys this component on it). Lazy useState, not
  // useMemo: the create-once instance must stay identity-stable across StrictMode
  // re-renders (AGENTS.md).
  const [{ mesh, material, ids, rotationSpeeds, geometryCount }] = useState(() => buildBatch(count))

  const customSort = useMemo(
    () => createRadixSort(mesh.maxInstanceCount, material),
    [mesh, material],
  )

  useEffect(() => {
    mesh.setCustomSort(useCustomSort ? customSort : null)
  }, [mesh, customSort, useCustomSort])

  // Below 1.0 the whole batch goes transparent: no depth write, back-to-front sort.
  useEffect(() => {
    material.transparent = opacity < 1
    material.depthWrite = opacity >= 1
    material.opacity = opacity
    material.needsUpdate = true
  }, [material, opacity])

  // "randomize geometry": reassign every instance a random template geometry in place.
  useEffect(() => {
    if (randomizeNonce === 0) return
    for (const id of ids) {
      mesh.setGeometryIdAt(id, Math.floor(Math.random() * geometryCount))
    }
  }, [mesh, ids, geometryCount, randomizeNonce])

  // Spin the first `dynamic` instances through the BatchedMesh matrix API.
  useFrame(() => {
    const loopNum = Math.min(count, dynamic)
    for (let i = 0; i < loopNum; i++) {
      const id = ids[i]
      mesh.getMatrixAt(id, scratchMatrix)
      scratchMatrix.multiply(rotationSpeeds[i])
      mesh.setMatrixAt(id, scratchMatrix)
    }
  })

  return (
    <primitive
      object={mesh}
      sortObjects={sortObjects}
      perObjectFrustumCulled={perObjectFrustumCulled}
    />
  )
}

export default function MeshBatch() {
  const [randomizeNonce, setRandomizeNonce] = useState(0)

  const { count, dynamic, opacity, sortObjects, perObjectFrustumCulled, useCustomSort } =
    useControls('mesh-batch', {
      count: { value: 512, min: 1, max: MAX_INSTANCE_COUNT, step: 1 },
      dynamic: { value: 16, min: 0, max: MAX_INSTANCE_COUNT, step: 1 },
      opacity: { value: 1, min: 0, max: 1 },
      sortObjects: true,
      perObjectFrustumCulled: true,
      useCustomSort: true,
      'randomize geometry': button(() => setRandomizeNonce((n) => n + 1)),
    })

  return (
    <Canvas
      // Tone-mapping parity: the original renders with the WebGPURenderer default
      // (NoToneMapping) — ACESFilmic would mute the unlit instance palette.
      renderer={{ toneMapping: NoToneMapping }}
      background="#c1c1ff"
      camera={{ position: [0, 0, 30], fov: 70, near: 1, far: 100 }}
    >
      <BatchedShapes
        key={count}
        count={count}
        dynamic={dynamic}
        opacity={opacity}
        sortObjects={sortObjects}
        perObjectFrustumCulled={perObjectFrustumCulled}
        useCustomSort={useCustomSort}
        randomizeNonce={randomizeNonce}
      />
      <DemoHelpers grid={false} autoRotate autoRotateSpeed={1} />
    </Canvas>
  )
}
