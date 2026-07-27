// A faint reflective floor: a `reflector()` TSL node feeds a transparent NodeMaterial's
// `colorNode` directly (unlike reflection/ReflectiveFloor.tsx, there's no diffuse
// checkerboard or normal-map perturbation to blend with here — just the mirrored render
// at low opacity, matching the original's minimal floor).
import { useMemo } from 'react'
import { reflector } from 'three/tsl'
import { BoxGeometry, Mesh, NodeMaterial } from 'three/webgpu'

export function Floor() {
  const { mesh, reflectionTarget } = useMemo(() => {
    const reflection = reflector()
    reflection.target.rotateX(-Math.PI / 2)

    const material = new NodeMaterial()
    material.colorNode = reflection
    material.opacity = 0.2
    material.transparent = true

    const mesh = new Mesh(new BoxGeometry(50, 0.001, 50), material)
    mesh.receiveShadow = true

    return { mesh, reflectionTarget: reflection.target }
  }, [])

  return (
    <>
      <primitive object={mesh} />
      <primitive object={reflectionTarget} />
    </>
  )
}
