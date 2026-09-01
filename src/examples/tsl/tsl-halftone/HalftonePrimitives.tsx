// Two primitive shapes sharing the scene's stable halftone output graph.
import type { Node } from 'three/webgpu'
import { folder, useControls } from 'leva'

export function HalftonePrimitives({ outputNode }: { outputNode: Node }) {
  const { materialColor } = useControls('tsl-halftone', {
    material: folder({
      materialColor: { value: '#ff622e', label: 'color' },
    }),
  })

  return (
    <>
      <mesh position={[3, 0, 0]}>
        <torusKnotGeometry args={[0.6, 0.25, 128, 32]} />
        <meshStandardNodeMaterial color={materialColor} outputNode={outputNode} />
      </mesh>
      <mesh position={[-3, 0, 0]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardNodeMaterial color={materialColor} outputNode={outputNode} />
      </mesh>
    </>
  )
}
