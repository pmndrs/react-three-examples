// Scene content for the pixelation demo: a checker floor, two checker crates, and a
// glowing crystal that bobs, pulses its emissive, and spins with a stop-and-go ease.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { MathUtils, NearestFilter, RepeatWrapping, SRGBColorSpace } from 'three/webgpu'
import type { Mesh, MeshPhongMaterial, Texture } from 'three/webgpu'

const CHECKER_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/checker.png'

// The "big pixel" look starts at the texture filters, not just the pass: nearest
// filtering, no mipmaps, sRGB.
function pixelTexture(texture: Texture) {
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.generateMipmaps = false
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  return texture
}

// Stop-and-go easing from the original: rest until `downtime`, then ease through one
// full unit per `period` — the crystal's snappy quarter-pause rotation.
function easeInOutCubic(x: number) {
  return x ** 2 * 3 - x ** 3 * 2
}

function linearStep(x: number, edge0: number, edge1: number) {
  const w = edge1 - edge0
  const m = 1 / w
  const y0 = -m * edge0
  return MathUtils.clamp(y0 + m * x, 0, 1)
}

function stopGoEased(x: number, downtime: number, period: number) {
  const cycle = (x / period) | 0
  const tween = x - cycle * period
  const linStep = easeInOutCubic(linearStep(tween, downtime, period))
  return cycle + linStep
}

function Crystal() {
  const meshRef = useRef<Mesh>(null)
  const materialRef = useRef<MeshPhongMaterial>(null)

  useFrame(({ elapsed }) => {
    const mesh = meshRef.current
    const material = materialRef.current
    if (!mesh || !material) return
    material.emissiveIntensity = Math.sin(elapsed * 3) * 0.5 + 0.5
    mesh.position.y = 0.7 + Math.sin(elapsed * 2) * 0.05
    mesh.rotation.y = stopGoEased(elapsed, 2, 4) * 2 * Math.PI
  })

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <icosahedronGeometry args={[0.2]} />
      <meshPhongMaterial
        ref={materialRef}
        color={0x68b7e9}
        emissive={0x4f7e8b}
        shininess={10}
        specular={0xffffff}
      />
    </mesh>
  )
}

const BOXES: { size: number; position: [number, number, number]; rotationY: number }[] = [
  { size: 0.4, position: [0, 0.2 + 0.0001, 0], rotationY: Math.PI / 4 },
  { size: 0.5, position: [-0.5, 0.25 + 0.0001, -0.5], rotationY: Math.PI / 4 },
]

export function PixelScene() {
  const checker = useTexture(CHECKER_URL)

  // One fetch, two configurations: the original loads checker.png twice to get
  // independent repeat settings; clone() shares the decoded image.
  const [floorTexture, crateTexture] = useMemo(() => {
    const floor = pixelTexture(checker.clone())
    floor.repeat.set(3, 3)
    const crate = pixelTexture(checker.clone())
    crate.repeat.set(1.5, 1.5)
    return [floor, crate]
  }, [checker])

  return (
    <>
      {BOXES.map((box, i) => (
        <mesh key={i} castShadow receiveShadow position={box.position} rotation-y={box.rotationY}>
          <boxGeometry args={[box.size, box.size, box.size]} />
          <meshPhongMaterial map={crateTexture} />
        </mesh>
      ))}
      <mesh receiveShadow rotation-x={-Math.PI / 2}>
        <planeGeometry args={[2, 2]} />
        <meshPhongMaterial map={floorTexture} />
      </mesh>
      <Crystal />
      <ambientLight color={0x757f8e} intensity={3} />
      <directionalLight
        color={0xfffecd}
        intensity={1.5}
        position={[100, 100, 100]}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <spotLight
        color={0xffc100}
        intensity={10}
        distance={10}
        angle={Math.PI / 16}
        penumbra={0.02}
        decay={2}
        position={[2, 2, 0]}
        castShadow
      />
    </>
  )
}
