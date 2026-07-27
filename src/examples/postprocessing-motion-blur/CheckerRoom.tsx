// The static room: a thin floor slab and an inside-out wall box sharing one
// 5x-tiled checkerboard `colorNode` (TSL `texture(map, uv().mul(5))`), as in the
// original. Static geometry — its per-pixel velocity comes from camera motion only.
import { useMemo } from 'react'
import { useTexture } from '@react-three/drei/webgpu'
import { texture, uv } from 'three/tsl'
import { BackSide, RepeatWrapping, SRGBColorSpace } from 'three/webgpu'

const FLOOR_COLOR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/floors/FloorsCheckerboard_S_Diffuse.jpg'

export function CheckerRoom() {
  const floorColor = useTexture(FLOOR_COLOR_URL, (map) => {
    map.wrapS = RepeatWrapping
    map.wrapT = RepeatWrapping
    map.colorSpace = SRGBColorSpace
  })

  // One shared colorNode for floor and walls (the original reuses
  // `floorMaterial.colorNode` on the wall material).
  const colorNode = useMemo(() => texture(floorColor, uv().mul(5)), [floorColor])

  return (
    <>
      <mesh receiveShadow>
        <boxGeometry args={[15, 0.001, 15]} />
        <meshPhongNodeMaterial colorNode={colorNode} />
      </mesh>
      <mesh>
        <boxGeometry args={[15, 15, 15]} />
        <meshPhongNodeMaterial colorNode={colorNode} side={BackSide} />
      </mesh>
    </>
  )
}
