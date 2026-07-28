// CPU-side construction of the verlet cloth system — the original's
// setupVerletGeometry/setupVerletVertexBuffers/setupVerletSpringBuffers/
// setupClothMesh, flattened into the typed arrays the GPU kernels upload once.
// Pure and deterministic: after the upload, all live state is GPU-only.
import { BufferAttribute, BufferGeometry, Vector3 } from 'three/webgpu'

export const CLOTH_WIDTH = 1
export const CLOTH_HEIGHT = 1
export const CLOTH_SEGMENTS_X = 30
export const CLOTH_SEGMENTS_Y = 30
export const SPHERE_RADIUS = 0.15

interface VerletVertex {
  id: number
  position: Vector3
  isFixed: boolean
  springIds: number[]
}

interface VerletSpring {
  id: number
  vertex0: VerletVertex
  vertex1: VerletVertex
}

export interface VerletSystem {
  vertexCount: number
  springCount: number
  /** vec3 per verlet vertex — the live position buffer's initial upload. */
  vertexPositionArray: Float32Array
  /** uvec3 per vertex: x = isFixed, y = spring count, z = pointer into springListArray. */
  vertexParamsArray: Uint32Array
  /** Spring ids grouped per affected vertex (indexed via the springPointer above). */
  springListArray: Uint32Array
  /** uvec2 per spring: the ids of the two vertices it connects. */
  springVertexIdArray: Uint32Array
  /** float per spring: rest length. */
  springRestLengthArray: Float32Array
  /**
   * Render geometry: one vertex per grid CELL, centred on its 4 surrounding verlet
   * vertices by the material's positionNode via the `vertexIds` uvec4 attribute —
   * the CPU-side position attribute stays zeroed.
   */
  clothGeometry: BufferGeometry
}

export function buildVerletSystem(): VerletSystem {
  const vertices: VerletVertex[] = []
  const springs: VerletSpring[] = []
  const columns: VerletVertex[][] = []

  const addVertex = (x: number, y: number, z: number, isFixed: boolean): VerletVertex => {
    const vertex: VerletVertex = {
      id: vertices.length,
      position: new Vector3(x, y, z),
      isFixed,
      springIds: [],
    }
    vertices.push(vertex)
    return vertex
  }

  const addSpring = (vertex0: VerletVertex, vertex1: VerletVertex) => {
    const id = springs.length
    vertex0.springIds.push(id)
    vertex1.springIds.push(id)
    springs.push({ id, vertex0, vertex1 })
  }

  // Vertex grid: a horizontal 1x1 sheet at y = 0.5, pinned along the z = 0 edge at
  // every 5th column — gravity drapes the rest.
  for (let x = 0; x <= CLOTH_SEGMENTS_X; x++) {
    const column: VerletVertex[] = []
    for (let y = 0; y <= CLOTH_SEGMENTS_Y; y++) {
      const posX = x * (CLOTH_WIDTH / CLOTH_SEGMENTS_X) - CLOTH_WIDTH * 0.5
      const posZ = y * (CLOTH_HEIGHT / CLOTH_SEGMENTS_Y)
      const isFixed = y === 0 && x % 5 === 0
      column.push(addVertex(posX, CLOTH_HEIGHT * 0.5, posZ, isFixed))
    }
    columns.push(column)
  }

  // Springs: both axes plus both diagonals per cell (the original's rigidity grid).
  for (let x = 0; x <= CLOTH_SEGMENTS_X; x++) {
    for (let y = 0; y <= CLOTH_SEGMENTS_Y; y++) {
      const vertex0 = columns[x][y]
      if (x > 0) addSpring(vertex0, columns[x - 1][y])
      if (y > 0) addSpring(vertex0, columns[x][y - 1])
      if (x > 0 && y > 0) addSpring(vertex0, columns[x - 1][y - 1])
      if (x > 0 && y < CLOTH_SEGMENTS_Y) addSpring(vertex0, columns[x - 1][y + 1])
    }
  }

  const vertexCount = vertices.length
  const springCount = springs.length

  // Flatten vertices: positions + params (isFixed, spring count, spring pointer),
  // and the adjacency list the per-vertex kernel iterates with a dynamic Loop.
  const vertexPositionArray = new Float32Array(vertexCount * 3)
  const vertexParamsArray = new Uint32Array(vertexCount * 3)
  const springListIds: number[] = []

  for (let i = 0; i < vertexCount; i++) {
    const vertex = vertices[i]
    vertexPositionArray[i * 3] = vertex.position.x
    vertexPositionArray[i * 3 + 1] = vertex.position.y
    vertexPositionArray[i * 3 + 2] = vertex.position.z
    vertexParamsArray[i * 3] = vertex.isFixed ? 1 : 0
    if (!vertex.isFixed) {
      vertexParamsArray[i * 3 + 1] = vertex.springIds.length
      vertexParamsArray[i * 3 + 2] = springListIds.length
      springListIds.push(...vertex.springIds)
    }
  }

  // Flatten springs: endpoint vertex ids + rest lengths.
  const springVertexIdArray = new Uint32Array(springCount * 2)
  const springRestLengthArray = new Float32Array(springCount)
  for (let i = 0; i < springCount; i++) {
    const spring = springs[i]
    springVertexIdArray[i * 2] = spring.vertex0.id
    springVertexIdArray[i * 2 + 1] = spring.vertex1.id
    springRestLengthArray[i] = spring.vertex0.position.distanceTo(spring.vertex1.position)
  }

  // Render geometry: 30x30 cell-centred vertices, two triangles per interior cell.
  const clothVertexCount = CLOTH_SEGMENTS_X * CLOTH_SEGMENTS_Y
  const verletVertexIdArray = new Uint32Array(clothVertexCount * 4)
  const indices: number[] = []
  const getIndex = (x: number, y: number) => y * CLOTH_SEGMENTS_X + x

  for (let x = 0; x < CLOTH_SEGMENTS_X; x++) {
    for (let y = 0; y < CLOTH_SEGMENTS_Y; y++) {
      const index = getIndex(x, y)
      verletVertexIdArray[index * 4] = columns[x][y].id
      verletVertexIdArray[index * 4 + 1] = columns[x + 1][y].id
      verletVertexIdArray[index * 4 + 2] = columns[x][y + 1].id
      verletVertexIdArray[index * 4 + 3] = columns[x + 1][y + 1].id

      if (x > 0 && y > 0) {
        indices.push(getIndex(x, y), getIndex(x - 1, y), getIndex(x - 1, y - 1))
        indices.push(getIndex(x, y), getIndex(x - 1, y - 1), getIndex(x, y - 1))
      }
    }
  }

  const clothGeometry = new BufferGeometry()
  clothGeometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(clothVertexCount * 3), 3, false),
  )
  clothGeometry.setAttribute('vertexIds', new BufferAttribute(verletVertexIdArray, 4, false))
  clothGeometry.setIndex(indices)

  return {
    vertexCount,
    springCount,
    vertexPositionArray,
    vertexParamsArray,
    springListArray: new Uint32Array(springListIds),
    springVertexIdArray,
    springRestLengthArray,
    clothGeometry,
  }
}
