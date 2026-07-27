// Room shell of the gallery scene: checkerboard floor (procedural CanvasTexture),
// two walls, classical columns, extruded picture frames, and warm wall spotlights.
// Pure JSX scene graph — geometry that needs imperative construction (canvas 2D,
// Shape with a hole) is memoized and attached declaratively.
import { useMemo } from 'react'
import {
  CanvasTexture,
  ExtrudeGeometry,
  MeshStandardMaterial,
  Object3D,
  Path,
  RepeatWrapping,
  Shape,
  SRGBColorSpace,
} from 'three/webgpu'

const TILES = 16

const SPOTLIGHTS: { position: [number, number, number]; target: [number, number, number] }[] = [
  { position: [-2.5, 5, -4.8], target: [-2.5, -2, -4.8] },
  { position: [2.5, 5, -4.8], target: [2.5, -2, -4.8] },
  { position: [-5.3, 5, 0], target: [-5.3, -2, 0] },
]

const COLUMNS: [number, number][] = [
  [-5.05, -4.55],
  [4.5, -4.55],
  [-5.05, 3],
]

const FRAMES: {
  position: [number, number, number]
  width: number
  height: number
  paint: string
  rotationY?: number
}[] = [
  { position: [-3.2, 2.0, -4.9], width: 1.8, height: 1.2, paint: '#e8a8a0' },
  { position: [-0.5, 2.6, -4.9], width: 1.1, height: 1.6, paint: '#a0c0e0' },
  { position: [2, 1.8, -4.9], width: 2.0, height: 1.4, paint: '#a0d0a8' },
  { position: [-5.4, 2.2, -3], width: 1.5, height: 1.1, paint: '#d0b0d8', rotationY: Math.PI / 2 },
  { position: [-5.4, 1.8, 1], width: 1.8, height: 1.3, paint: '#e0c8a0', rotationY: Math.PI / 2 },
]

function useCheckerTexture() {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = TILES * 32
    canvas.height = TILES * 32
    const ctx = canvas.getContext('2d')!
    for (let x = 0; x < TILES; x++) {
      for (let z = 0; z < TILES; z++) {
        ctx.fillStyle = (x + z) % 2 === 0 ? '#d8d0c8' : '#b8b0a8'
        ctx.fillRect(x * 32, z * 32, 32, 32)
      }
    }
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    return texture
  }, [])
}

// Wall-mounted spotlight aimed straight down the wall — the spotlight target is a
// plain Object3D mounted declaratively so three.js updates its matrix.
function WallSpotLight({ position, target }: { position: [number, number, number]; target: [number, number, number] }) {
  const targetObject = useMemo(() => new Object3D(), [])
  return (
    <>
      <spotLight
        color="#ffe09e"
        intensity={40}
        angle={0.6}
        penumbra={1}
        distance={6.5}
        decay={2}
        position={position}
        target={targetObject}
      />
      <primitive object={targetObject} position={target} />
    </>
  )
}

function PictureFrame({
  position,
  width,
  height,
  paint,
  rotationY = 0,
}: {
  position: [number, number, number]
  width: number
  height: number
  paint: string
  rotationY?: number
}) {
  const frameGeometry = useMemo(() => {
    const t = 0.1
    const outerW = width + t * 2
    const outerH = height + t * 2

    const shape = new Shape()
    shape.moveTo(-outerW / 2, -outerH / 2)
    shape.lineTo(outerW / 2, -outerH / 2)
    shape.lineTo(outerW / 2, outerH / 2)
    shape.lineTo(-outerW / 2, outerH / 2)
    shape.closePath()

    const hole = new Path()
    hole.moveTo(-width / 2, -height / 2)
    hole.lineTo(width / 2, -height / 2)
    hole.lineTo(width / 2, height / 2)
    hole.lineTo(-width / 2, height / 2)
    hole.closePath()
    shape.holes.push(hole)

    return new ExtrudeGeometry(shape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
    })
  }, [width, height])

  return (
    <group position={position} rotation-y={rotationY}>
      <mesh geometry={frameGeometry}>
        <meshStandardMaterial color="#8b6840" roughness={0.7} metalness={0} />
      </mesh>
      <mesh position-z={0.001}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color={paint} roughness={0.95} metalness={0} />
      </mesh>
    </group>
  )
}

function Column({ x, z, material }: { x: number; z: number; material: MeshStandardMaterial }) {
  return (
    <group scale={1.5} position={[x, 1.0, z]}>
      <mesh position-y={-1.9} material={material}>
        <boxGeometry args={[0.6, 0.2, 0.6]} />
      </mesh>
      <mesh position-y={0.7} material={material}>
        <cylinderGeometry args={[0.18, 0.22, 5, 16]} />
      </mesh>
      <mesh position-y={3.35} material={material}>
        <boxGeometry args={[0.55, 0.25, 0.55]} />
      </mesh>
    </group>
  )
}

export function Gallery() {
  const floorTexture = useCheckerTexture()

  const { wallMaterial, columnMaterial } = useMemo(
    () => ({
      wallMaterial: new MeshStandardMaterial({ color: '#e0d8d0', roughness: 0.9, metalness: 0 }),
      columnMaterial: new MeshStandardMaterial({ color: '#e8e4de', roughness: 0.5, metalness: 0 }),
    }),
    [],
  )

  return (
    <>
      {/* checkerboard floor */}
      <mesh rotation-x={-Math.PI / 2} position-y={-2}>
        <planeGeometry args={[TILES, TILES]} />
        <meshStandardMaterial map={floorTexture} roughness={0.7} metalness={0.05} />
      </mesh>

      {/* walls */}
      <mesh position={[0, 3, -5]} material={wallMaterial}>
        <planeGeometry args={[16, 10]} />
      </mesh>
      <mesh position={[-5.5, 3, 0]} rotation-y={Math.PI / 2} material={wallMaterial}>
        <planeGeometry args={[16, 10]} />
      </mesh>

      {SPOTLIGHTS.map((light) => (
        <WallSpotLight key={light.position.join()} {...light} />
      ))}

      {COLUMNS.map(([x, z]) => (
        <Column key={`${x},${z}`} x={x} z={z} material={columnMaterial} />
      ))}

      {FRAMES.map((frame) => (
        <PictureFrame key={frame.position.join()} {...frame} />
      ))}
    </>
  )
}
