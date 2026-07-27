// Furnishings of the gallery scene: pedestals (central + two small), torus knot,
// lathe-profile vase, rounded-box armchair, side table with cup, and a layered rug.
// Lots of tight geometry contacts — exactly where ambient occlusion earns its keep.
import { useMemo } from 'react'
import { LatheGeometry, MeshStandardMaterial, Vector2 } from 'three/webgpu'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const VASE_PROFILE: [number, number][] = [
  [0, 0.5],
  [0.12, 0.5],
  [0.18, 0.7],
  [0.28, 0.9],
  [0.32, 1.0],
  [0.3, 1.1],
  [0.22, 1.15],
  [0.2, 1.2],
  [0.22, 1.25],
  [0, 1.25],
]

const CHAIR_LEGS: [number, number][] = [
  [-0.38, -0.32],
  [-0.38, 0.32],
  [0.38, -0.32],
  [0.38, 0.32],
]

// Small display pedestal (used for the vase and the Tennyson bust).
function SmallPedestal({ x, z, material }: { x: number; z: number; material: MeshStandardMaterial }) {
  return (
    <>
      <mesh position={[x, -1.925, z]} material={material}>
        <cylinderGeometry args={[0.6, 0.7, 0.15, 32]} />
      </mesh>
      <mesh position={[x, -1.35, z]} material={material}>
        <cylinderGeometry args={[0.35, 0.42, 1, 32]} />
      </mesh>
      <mesh position={[x, -0.775, z]} material={material}>
        <cylinderGeometry args={[0.55, 0.48, 0.15, 32]} />
      </mesh>
    </>
  )
}

export function Furniture() {
  const { pedestalMaterial, woodMaterial, fabricMaterial } = useMemo(
    () => ({
      pedestalMaterial: new MeshStandardMaterial({ color: '#f0ece8', roughness: 0.4, metalness: 0.05 }),
      woodMaterial: new MeshStandardMaterial({ color: '#8b6840', roughness: 0.8, metalness: 0 }),
      fabricMaterial: new MeshStandardMaterial({ color: '#8b3a3a', roughness: 0.9, metalness: 0 }),
    }),
    [],
  )

  const { vaseGeometry, seatGeometry, backrestGeometry } = useMemo(
    () => ({
      vaseGeometry: new LatheGeometry(
        VASE_PROFILE.map(([x, y]) => new Vector2(x, y)),
        24,
      ),
      seatGeometry: new RoundedBoxGeometry(0.9, 0.25, 0.8, 4, 0.06),
      backrestGeometry: new RoundedBoxGeometry(0.9, 0.6, 0.12, 4, 0.04),
    }),
    [],
  )

  return (
    <>
      {/* central pedestal */}
      <mesh position={[0, -1.9, 0]} material={pedestalMaterial}>
        <cylinderGeometry args={[0.9, 1.0, 0.2, 32]} />
      </mesh>
      <mesh position={[0, -1.05, 0]} material={pedestalMaterial}>
        <cylinderGeometry args={[0.55, 0.65, 1.5, 32]} />
      </mesh>
      <mesh position={[0, -0.18, 0]} material={pedestalMaterial}>
        <cylinderGeometry args={[0.8, 0.7, 0.25, 32]} />
      </mesh>

      {/* torus knot on the central pedestal */}
      <mesh position={[0, 0.82, 0]}>
        <torusKnotGeometry args={[0.5, 0.17, 128, 32]} />
        <meshStandardMaterial color="#c0a060" roughness={0.45} metalness={0} />
      </mesh>

      {/* vase on its own pedestal */}
      <SmallPedestal x={-5} z={-2} material={pedestalMaterial} />
      <mesh geometry={vaseGeometry} position={[-5, -1.6, -2]} scale={1.8}>
        <meshStandardMaterial color="#d4806a" roughness={0.6} metalness={0.02} />
      </mesh>

      {/* pedestal for the Tennyson bust (the bust itself loads async) */}
      <SmallPedestal x={-3} z={-3.2} material={pedestalMaterial} />

      {/* armchair */}
      <group scale={1.76} position={[4, 0.948, -2.5]} rotation-y={-0.6}>
        <mesh geometry={seatGeometry} position={[0, -1.35, 0]} material={fabricMaterial} />
        <mesh geometry={backrestGeometry} position={[0, -0.95, -0.4]} rotation-x={-0.3} material={fabricMaterial} />
        {([-1, 1] as const).map((side) => (
          <group key={side}>
            <mesh position={[side * 0.5, -1.2, 0]} material={woodMaterial}>
              <boxGeometry args={[0.1, 0.25, 0.7]} />
            </mesh>
            <mesh position={[side * 0.5, -1.07, 0]} material={woodMaterial}>
              <boxGeometry args={[0.14, 0.06, 0.8]} />
            </mesh>
          </group>
        ))}
        {CHAIR_LEGS.map(([lx, lz]) => (
          <mesh key={`${lx},${lz}`} position={[lx, -1.575, lz]} material={woodMaterial}>
            <cylinderGeometry args={[0.03, 0.035, 0.2, 8]} />
          </mesh>
        ))}
      </group>

      {/* side table with cup */}
      <group scale={2.2} position={[2, 2.29, -4]}>
        <mesh position-y={-1.05} material={woodMaterial}>
          <cylinderGeometry args={[0.4, 0.4, 0.05, 24]} />
        </mesh>
        <mesh position-y={-1.5} material={woodMaterial}>
          <cylinderGeometry args={[0.04, 0.06, 0.9, 8]} />
        </mesh>
        <mesh position-y={-1.92} material={woodMaterial}>
          <cylinderGeometry args={[0.25, 0.28, 0.06, 24]} />
        </mesh>
        <mesh position={[0.15, -0.98, 0]} scale={1 / 2.2}>
          <cylinderGeometry args={[0.1, 0.08, 0.2, 16]} />
          <meshStandardMaterial color="#f0ece0" roughness={0.4} metalness={0.05} />
        </mesh>
      </group>

      {/* rug (two stacked thin boxes: field + border) */}
      <mesh position={[0, -1.99, 0.5]}>
        <boxGeometry args={[6, 0.02, 5]} />
        <meshStandardMaterial color="#c8a0a8" roughness={0.95} metalness={0} />
      </mesh>
      <mesh position={[0, -1.9925, 0.5]}>
        <boxGeometry args={[6.3, 0.015, 5.3]} />
        <meshStandardMaterial color="#d4b880" roughness={0.95} metalness={0} />
      </mesh>
    </>
  )
}
