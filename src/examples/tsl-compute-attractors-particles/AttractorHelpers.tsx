// Attractor gizmo meshes for tsl-compute-attractors-particles: a ring (spin
// plane) + cone arrow (spin direction) per attractor, oriented along its fixed
// rotation axis. Pure declarative JSX — the original builds the same meshes
// imperatively and hangs TransformControls off them (see entry DIVERGENCE).
import { useMemo } from 'react'
import { DoubleSide, Quaternion, Vector3 } from 'three/webgpu'
import { ATTRACTOR_ROTATION_AXES } from './attractors'

export interface AttractorHelpersProps {
  positions: readonly { x: number; y: number; z: number }[]
  visible: boolean
}

export function AttractorHelpers({ positions, visible }: AttractorHelpersProps) {
  // Axes are fixed, so the orientation quaternions are build-once.
  const quaternions = useMemo(() => {
    const up = new Vector3(0, 1, 0)
    return ATTRACTOR_ROTATION_AXES.map((axis) => new Quaternion().setFromUnitVectors(up, axis))
  }, [])

  return (
    <group visible={visible}>
      {positions.map((p, i) => (
        <group key={i} position={[p.x, p.y, p.z]} quaternion={quaternions[i]}>
          <group scale={0.325}>
            <mesh rotation-x={-Math.PI * 0.5}>
              <ringGeometry args={[1, 1.02, 32, 1, 0, Math.PI * 1.5]} />
              <meshBasicMaterial side={DoubleSide} />
            </mesh>
            <mesh position={[1, 0, 0.2]} rotation-x={Math.PI * 0.5}>
              <coneGeometry args={[0.1, 0.4, 12, 1, false]} />
              <meshBasicMaterial side={DoubleSide} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  )
}
