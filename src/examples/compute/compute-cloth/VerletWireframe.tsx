// The original's setupWireframe() debug view: every verlet vertex as a tiny
// billboarded quad (one Mesh, `count`-instanced SpriteNodeMaterial) and every
// spring as an instanced two-vertex Line whose positionNode dereferences the
// spring's endpoint ids from the storage buffers. Toggled by leva `wireframe`.
import { useMemo } from 'react'
import {
  BufferAttribute,
  InstancedBufferGeometry,
  Line,
  LineBasicNodeMaterial,
  type Node,
} from 'three/webgpu'

export interface VerletWireframeProps {
  visible: boolean
  vertexCount: number
  springCount: number
  /** Live verlet vertex position, indexed by `instanceIndex`. */
  vertexPositionNode: Node
  /** Spring endpoint position — selects vertex0/vertex1 by the `vertexIndex` attribute. */
  springPositionNode: Node
}

export function VerletWireframe({
  visible,
  vertexCount,
  springCount,
  vertexPositionNode,
  springPositionNode,
}: VerletWireframeProps) {
  // The spring visualizer is an InstancedBufferGeometry on a THREE.Line — built
  // imperatively (lines-fat's pattern) and mounted via <primitive>. Memo keyed on
  // the store-stable node, never disposed in cleanup (StrictMode rule).
  const springLines = useMemo(() => {
    const geometry = new InstancedBufferGeometry()
    // Two dummy vertices per instance; the positionNode below replaces them.
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(6), 3, false))
    geometry.setAttribute('vertexIndex', new BufferAttribute(new Uint32Array([0, 1]), 1, false))
    geometry.instanceCount = springCount

    const material = new LineBasicNodeMaterial()
    material.positionNode = springPositionNode

    const lines = new Line(geometry, material)
    lines.frustumCulled = false
    // Cast: `count` isn't declared on Line in @types/three (Mesh/Sprite have it),
    // but the renderer reads `object.count` generically for instanced draws — the
    // original sets it on its Line too (B11-family duck-typed field).
    ;(lines as Line & { count: number }).count = springCount
    return lines
  }, [springCount, springPositionNode])

  return (
    <>
      {/* Verlet vertices: one 0.01-unit quad instanced per vertex via Mesh.count,
          billboarded by SpriteNodeMaterial, placed straight from the live buffer.
          GPU-relocated geometry → frustumCulled off (AGENTS.md positionNode rule). */}
      <mesh frustumCulled={false} count={vertexCount} visible={visible}>
        <planeGeometry args={[0.01, 0.01]} />
        <spriteNodeMaterial positionNode={vertexPositionNode} />
      </mesh>
      <primitive object={springLines} visible={visible} />
    </>
  )
}
