// Ground plane: `receivedShadowPositionNode` perturbs the position used to sample
// incoming shadow maps (wavy shadow edges), independent of `colorNode`'s own noise
// pattern — see the file header DIVERGENCE re: the original's dead perturbation calc
// in colorNode.
import { Fn, mx_fractal_noise_vec3, positionWorld } from 'three/tsl'

import { useNodes } from '@react-three/fiber/webgpu'

const BASE_COLOR = '#999999'

export function Ground() {
  const { colorNode, receivedShadowPositionNode } = useNodes(() => ({
    colorNode: mx_fractal_noise_vec3(positionWorld.mul(2)).saturate().zzz.mul(0.2).add(0.5),
    receivedShadowPositionNode: Fn(() => {
      const pos = positionWorld.toVar()
      pos.xz.addAssign(mx_fractal_noise_vec3(positionWorld.mul(2)).saturate().xz)
      return pos
    })(),
  }))

  return (
    <mesh rotation-x={-Math.PI / 2} scale={3} castShadow receiveShadow>
      <planeGeometry args={[200, 200]} />
      <meshPhongNodeMaterial
        color={BASE_COLOR}
        shininess={0}
        specular="#111111"
        colorNode={colorNode}
        receivedShadowPositionNode={receivedShadowPositionNode}
      />
    </mesh>
  )
}
