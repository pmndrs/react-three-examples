// Static prop generator for shadowmap-array: columns, cubes, spheres and toruses as
// InstancedMesh, trees as a BatchedMesh (trunk + top geometries, per-instance vertex
// colors) — ported near-verbatim from the original's createScenery(). Random per
// mount, matching the original's per-load layout (no seed).
import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import {
  BatchedMesh,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshPhongMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three/webgpu'
import type { Mesh } from 'three/webgpu'

function buildScenery() {
  const matrix = new Matrix4()

  // 1. Columns — instanced cylinders scattered on a 40-unit grid, 70% fill.
  const columnGeometry = new CylinderGeometry(0.8, 1, 1, 16)
  const columnMaterial = new MeshPhongMaterial({ color: '#dddddd', shininess: 20 })
  const columnPositions: number[] = []
  const columnScales: number[] = []
  for (let x = -100; x <= 100; x += 40) {
    for (let z = -100; z <= 100; z += 40) {
      if (Math.random() > 0.3) {
        const height = 5 + Math.random() * 10
        columnPositions.push(x + (Math.random() * 10 - 5), height / 2, z + (Math.random() * 10 - 5))
        columnScales.push(1, height, 1)
      }
    }
  }
  const columnCount = columnPositions.length / 3
  const columns = new InstancedMesh(columnGeometry, columnMaterial, columnCount)
  for (let i = 0; i < columnCount; i++) {
    matrix.makeScale(1, columnScales[i * 3 + 1], 1)
    matrix.setPosition(columnPositions[i * 3], columnPositions[i * 3 + 1], columnPositions[i * 3 + 2])
    columns.setMatrixAt(i, matrix)
  }
  columns.castShadow = true
  columns.receiveShadow = true

  // 2. Cubes — three InstancedMesh batches (one per material), 10 instances each.
  const cubeGeometry = new BoxGeometry(3, 3, 3)
  const cubeMaterials = [
    new MeshPhongMaterial({ color: '#6699cc', shininess: 20 }),
    new MeshPhongMaterial({ color: '#cc6666', shininess: 20 }),
    new MeshPhongMaterial({ color: '#cccc66', shininess: 20 }),
  ]
  const cubeCount = 10
  const cubes = cubeMaterials.map((material) => new InstancedMesh(cubeGeometry, material, cubeCount))
  for (let i = 0; i < 30; i++) {
    const materialIndex = i % 3
    const instanceIndex = Math.floor(i / 3)
    matrix.makeRotationY(Math.random() * Math.PI * 2)
    matrix.setPosition(Math.random() * 300 - 150, 1.5, Math.random() * 300 - 150)
    cubes[materialIndex].setMatrixAt(instanceIndex, matrix)
  }
  cubes.forEach((instance) => {
    instance.castShadow = true
    instance.receiveShadow = true
  })

  // 3. Spheres.
  const sphereGeometry = new SphereGeometry(2, 32, 32)
  const sphereMaterial = new MeshPhongMaterial({ color: '#88ccaa', shininess: 40 })
  const sphereCount = 25
  const spheres = new InstancedMesh(sphereGeometry, sphereMaterial, sphereCount)
  for (let i = 0; i < sphereCount; i++) {
    matrix.identity()
    matrix.setPosition(Math.random() * 180 - 90, 2, Math.random() * 180 - 90)
    spheres.setMatrixAt(i, matrix)
  }
  spheres.castShadow = true
  spheres.receiveShadow = true

  // 4. Trees — a single BatchedMesh holding trunk + top geometries per tree, vertex
  // colors distinguishing the two (pattern: mesh-batch's imperative BatchedMesh build).
  const trunkGeometry = new CylinderGeometry(0.5, 0.5, 2, 8)
  const topGeometry = new ConeGeometry(2, 8, 8)
  const treeMaterial = new MeshPhongMaterial({ vertexColors: true, shininess: 5 })
  const treeCount = 40
  const trunkVertexCount = trunkGeometry.attributes.position.count
  const trunkIndexCount = trunkGeometry.index ? trunkGeometry.index.count : 0
  const topVertexCount = topGeometry.attributes.position.count
  const topIndexCount = topGeometry.index ? topGeometry.index.count : 0
  const trees = new BatchedMesh(
    treeCount * 2,
    (trunkVertexCount + topVertexCount) * 2,
    (trunkIndexCount + topIndexCount) * 2,
    treeMaterial,
  )
  trees.castShadow = true
  trees.perObjectFrustumCulled = false
  const trunkGeometryId = trees.addGeometry(trunkGeometry)
  const topGeometryId = trees.addGeometry(topGeometry)
  const trunkColor = new Color('#8b4513')
  const topColor = new Color('#336633')
  for (let i = 0; i < treeCount; i++) {
    const x = Math.random() * 300 - 150
    const z = Math.random() * 300 - 150

    const trunkId = trees.addInstance(trunkGeometryId)
    matrix.identity()
    matrix.setPosition(x, 1, z)
    trees.setMatrixAt(trunkId, matrix)
    trees.setColorAt(trunkId, trunkColor)

    const topId = trees.addInstance(topGeometryId)
    matrix.identity()
    matrix.setPosition(x, 6, z)
    trees.setMatrixAt(topId, matrix)
    trees.setColorAt(topId, topColor)
  }

  // 5. Toruses.
  const torusGeometry = new TorusGeometry(3, 1, 16, 50)
  const torusMaterial = new MeshPhongMaterial({ color: '#ff99cc', shininess: 30 })
  const torusCount = 15
  const toruses = new InstancedMesh(torusGeometry, torusMaterial, torusCount)
  for (let i = 0; i < torusCount; i++) {
    matrix.makeRotationX(Math.PI / 2)
    matrix.multiply(new Matrix4().makeRotationZ(Math.random() * Math.PI * 2))
    matrix.setPosition(Math.random() * 320 - 160, 2, Math.random() * 320 - 160)
    toruses.setMatrixAt(i, matrix)
  }
  toruses.castShadow = true
  toruses.receiveShadow = true

  return { columns, cubes, spheres, trees, toruses }
}

// Lazy useState (not useMemo): the built meshes must stay identity-stable across
// StrictMode's double render — a re-run factory would silently rebuild every geometry
// (AGENTS.md create-once-instance rule).
export function Scenery() {
  const [scenery] = useState(() => buildScenery())
  return (
    <>
      <primitive object={scenery.columns} />
      {scenery.cubes.map((cube, i) => (
        <primitive key={i} object={cube} />
      ))}
      <primitive object={scenery.spheres} />
      <primitive object={scenery.trees} />
      <primitive object={scenery.toruses} />
    </>
  )
}

// The one animated, non-instanced centerpiece — same rotation as this corpus's other
// shadow-mapping torus knots (shadowmap-vsm), scaled by the shared `speed` control.
export function TorusKnotCentral({ speed }: { speed: number }) {
  const meshRef = useRef<Mesh>(null)

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.rotation.x += 0.25 * speed * delta
    mesh.rotation.y += 0.5 * speed * delta
    mesh.rotation.z += 1 * speed * delta
  })

  return (
    <mesh ref={meshRef} position={[5, 5, 0]} scale={1 / 18} castShadow receiveShadow>
      <torusKnotGeometry args={[25, 8, 100, 30]} />
      <meshPhongMaterial color="#ff6347" shininess={30} />
    </mesh>
  )
}
