// The duck flock: duck.glb (Draco-compressed) loaded via drei's useGLTF — this
// component SUSPENDS, so Water mounts it behind its own <Suspense> gate, after the
// sim's creator hooks have already run (AGENTS.md B17/B18). One InstancedMesh whose
// `positionNode` (built in Water's useNodes, passed down) offsets each instance by
// the duck struct storage buffer — placement lives on the GPU only.
import { useEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei/webgpu'
import type { Mesh, MeshStandardMaterial, MeshStandardNodeMaterial, Node } from 'three/webgpu'

export const NUM_DUCKS = 100

const DUCK_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/duck.glb'

export interface DucksProps {
  /** Instance placement graph (positionLocal + struct-buffer position), built in Water. */
  positionNode: Node
  visible: boolean
  wireframe: boolean
}

export function Ducks({ positionNode, visible, wireframe }: DucksProps) {
  const gltf = useGLTF(DUCK_URL, true) // Draco-compressed; arg 2 wires drei's decoder
  const duck = gltf.nodes.duck as Mesh
  // The loaded material is a core-three MeshStandardMaterial — NOT a node material,
  // so the original's `material.positionNode = ...` mutation has nothing to land on
  // here. Rebuild it as an explicit node material from the same maps/params instead
  // (see header DIVERGENCE).
  const sourceMaterial = duck.material as MeshStandardMaterial

  const materialRef = useRef<MeshStandardNodeMaterial>(null)
  useEffect(() => {
    // wireframe changes the pipeline topology — the property write alone doesn't
    // re-key the WebGPU pipeline (same family as instance-points' alphaToCoverage).
    if (materialRef.current) materialRef.current.needsUpdate = true
  }, [wireframe])

  return (
    // Instance positions exist only in the storage buffer — three's culling sphere is
    // the source duck at origin, so culling must be off (AGENTS.md positionNode rule).
    <instancedMesh
      args={[undefined, undefined, NUM_DUCKS]}
      geometry={duck.geometry}
      visible={visible}
      frustumCulled={false}
    >
      <meshStandardNodeMaterial
        ref={materialRef}
        map={sourceMaterial.map}
        color={sourceMaterial.color}
        roughness={sourceMaterial.roughness}
        metalness={sourceMaterial.metalness}
        positionNode={positionNode}
        wireframe={wireframe}
      />
    </instancedMesh>
  )
}
