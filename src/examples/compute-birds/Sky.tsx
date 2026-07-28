// The gradient atmosphere dome for compute-birds: local vertex positions feed a
// `varying` vec4 colorNode on a BackSide icosahedron — the original's sky mesh
// verbatim (rotation.z tilts the gradient, scale 1200 wraps the whole flock).
import { useMemo } from 'react'
import { add, positionLocal, sub, varying, vec4 } from 'three/tsl'
import { BackSide } from 'three/webgpu'

export function Sky() {
  // Static node graph, built once — nothing here reacts to props or uniforms.
  const colorNode = useMemo(
    () =>
      varying(
        vec4(
          sub(0.25, positionLocal.y),
          sub(-0.25, positionLocal.y),
          add(1.5, positionLocal.y),
          1.0,
        ),
      ),
    [],
  )

  return (
    <mesh rotation-z={0.75} scale={1200}>
      <icosahedronGeometry args={[1, 6]} />
      <meshBasicNodeMaterial colorNode={colorNode} side={BackSide} />
    </mesh>
  )
}
