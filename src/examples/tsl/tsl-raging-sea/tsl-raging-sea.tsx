/**
 * tsl-raging-sea
 * A plane displaced into rolling waves by a TSL shader graph, lit from within.
 * Original: https://threejs.org/examples/#webgpu_tsl_raging_sea
 *
 * DEMONSTRATES
 * - Controls live NEXT TO the mesh that uses them: Leva feeds `useUniforms`
 *   directly, so nothing is drilled down from the page component
 * - Changing a control updates a uniform — it never rebuilds the shader graph
 * - A TSL `Loop` whose bound is a uniform, so wave detail is live
 * - Normals rebuilt by finite difference, so lighting follows the moving surface
 *
 * DIVERGENCE from original
 * - Leva replaces the three.js Inspector panel
 * - The node graph is long, so it lives in `seaNodes.tsx`
 */
import { NoToneMapping } from 'three/webgpu'
import { Canvas, useNodes, useUniforms } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'

import { DemoHelpers } from '../../../utils/DemoHelpers'
import { makeSeaNodes, seaControls, TerrainGeometry } from './seaNodes'

function SeaSurface() {
  //* Controls ====================================================
  // Leva works anywhere; fiber's hooks only work inside <Canvas>, so both live
  // here in the component that actually consumes them.
  const { color, roughness, ...waveValues } = useControls('Raging Sea', seaControls)

  //* Shader graph ================================================
  const uniforms = useUniforms(waveValues)
  const matNodes = useNodes(() => makeSeaNodes(uniforms))

  return (
    <mesh>
      <TerrainGeometry />
      <meshStandardNodeMaterial color={color} roughness={roughness} {...matNodes} />
    </mesh>
  )
}

export default function TslRagingSea() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [1.25, 1.25, 1.25], fov: 50, near: 0.1, far: 100 }}>
      <directionalLight position={[-4, 2, 0]} intensity={3} />
      <SeaSurface />
      <DemoHelpers grid={false} target={[0, -0.25, 0]} minDistance={0.1} maxDistance={50} />
    </Canvas>
  )
}
