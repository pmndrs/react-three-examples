// The hover-selectable scene subjects from the original: a normalized OBJ tree,
// a cloud of 20 random Lambert spheres, a shadow-catching floor, and a torus.
import { useMemo } from 'react'
import { useLoader } from '@react-three/fiber/webgpu'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { Color, DoubleSide, Mesh, MeshPhongMaterial, SphereGeometry } from 'three/webgpu'

const TREE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/obj/tree.obj'

// The OBJ tree, normalized so its bounding sphere lands at radius 5 (the original's
// `scale = 0.2 * radius` divisor). Geometry centering + material swap happen on the
// cached loader result (both idempotent); the derived scale/position stay in JSX.
export function Tree() {
  const object = useLoader(OBJLoader, TREE_URL)

  const scale = useMemo(() => {
    let s = 1.0
    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.geometry.center()
        child.geometry.computeBoundingSphere()
        s = 0.2 * (child.geometry.boundingSphere?.radius ?? 5)
        child.material = new MeshPhongMaterial({
          color: 0xffffff,
          specular: 0x111111,
          shininess: 5,
        })
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    return s
  }, [object])

  return <primitive object={object} position={[0, 1, 0]} scale={1 / scale} />
}

// 20 spheres with random saturated HSL colors, positions and scales — one shared
// geometry, per-mesh materials (each needs its own color), regenerated per mount
// exactly like the original regenerates per page load.
export function SphereCloud() {
  const geometry = useMemo(() => new SphereGeometry(3, 48, 24), [])
  const spheres = useMemo(
    () =>
      Array.from({ length: 20 }, () => ({
        color: new Color().setHSL(Math.random(), 1.0, 0.3),
        position: [Math.random() * 4 - 2, Math.random() * 4 - 2, Math.random() * 4 - 2] as [
          number,
          number,
          number,
        ],
        scale: Math.random() * 0.3 + 0.1,
      })),
    [],
  )

  return (
    <>
      {spheres.map((sphere, i) => (
        <mesh
          key={i}
          geometry={geometry}
          position={sphere.position}
          scale={sphere.scale}
          castShadow
          receiveShadow
        >
          <meshLambertMaterial color={sphere.color} />
        </mesh>
      ))}
    </>
  )
}

export function Floor() {
  return (
    <mesh rotation-x={-Math.PI * 0.5} position-y={-1.5} receiveShadow>
      <planeGeometry args={[12, 12]} />
      <meshLambertMaterial side={DoubleSide} />
    </mesh>
  )
}

export function Torus() {
  return (
    <mesh position-z={-4} castShadow receiveShadow>
      <torusGeometry args={[1, 0.3, 16, 100]} />
      <meshPhongMaterial color="#ffaaff" />
    </mesh>
  )
}
