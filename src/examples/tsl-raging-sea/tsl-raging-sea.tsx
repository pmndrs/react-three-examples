/**
 * tsl-raging-sea
 * A plane displaced into rolling waves by a TSL shader graph, lit from within.
 * Original: https://threejs.org/examples/#webgpu_tsl_raging_sea
 *
 * DEMONSTRATES
 * - One `useNodes` graph shared across components — `SeaSurface` reads the nodes
 *   back out of the store by scope, so nothing is passed down as props
 * - `useUniforms` wires Leva straight to the shader; changing a control updates
 *   the uniform, never rebuilds the graph
 * - A TSL `Loop` whose bound is a uniform, so wave detail is live
 * - Normals rebuilt by finite difference, so lighting follows the moving surface
 *
 * DIVERGENCE
 * - Leva replaces the three.js Inspector panel
 * Another important note, is the nodes are so long they are in another file. 
 */
import { Canvas, useNodes, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';
import { NoToneMapping } from 'three/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';
import { makeSeaNodes, seaControls, TerrainGeometry } from './seaNodes';


function SeaSurface({ color, roughness }: { color: string; roughness: number }) {
  const matNodes = useNodes('sea');

  return (
    <mesh>
      <TerrainGeometry />
      <meshStandardNodeMaterial
        color={color}
        roughness={roughness}
        {...matNodes}
      />
    </mesh>
  );
}

export default function TslRagingSea() {
  //* Controls ====================================================
  const { color, roughness, ...waveValues } = useControls('Raging Sea', seaControls);

  //* Shader graph ================================================
  const uniforms = useUniforms(waveValues, 'sea');
  useNodes(() => makeSeaNodes(uniforms), 'sea');
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [1.25, 1.25, 1.25], fov: 50, near: 0.1, far: 100 }}
    >
      <directionalLight position={[-4, 2, 0]} intensity={3} />
      <SeaSurface color={color} roughness={roughness} />
      <DemoHelpers grid={false} target={[0, -0.25, 0]} minDistance={0.1} maxDistance={50} />
    </Canvas>
  );
}
