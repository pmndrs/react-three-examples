// Ground plane: `receivedShadowPositionNode` perturbs the position used to sample
// incoming shadow maps (wavy shadow edges), independent of `colorNode`'s own noise
// pattern — see the file header DIVERGENCE re: the original's dead perturbation calc
// in colorNode.
import { useMemo } from 'react'
import { Fn, mx_fractal_noise_vec3, positionWorld } from 'three/tsl'

const BASE_COLOR = '#999999'

export function Ground() {
  const receivedShadowPositionNode = useMemo(
    () =>
      Fn(() => {
        const pos = positionWorld.toVar()
        pos.xz.addAssign(mx_fractal_noise_vec3(positionWorld.mul(2)).saturate().xz)
        return pos
      })(),
    [],
  )

  const colorNode = useMemo(() => mx_fractal_noise_vec3(positionWorld.mul(2)).saturate().zzz.mul(0.2).add(0.5), [])

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
