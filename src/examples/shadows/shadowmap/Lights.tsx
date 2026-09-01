// SpotLight + DirectionalLight, both shadow casters, configured via fiber's dash-path
// props (`shadow-camera-*`, `shadow-mapSize-*`, `shadow-radius`). The directional light
// orbits inside `dirGroup` and bobs along z — the same two independent animations the
// original drives from its bare `animate()` function, now a `useFrame` job.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import type { DirectionalLight, Group } from 'three/webgpu'

export interface LightsProps {
  shadowRadius: number
  spinSpeed: number
}

export function Lights({ shadowRadius, spinSpeed }: LightsProps) {
  const dirGroupRef = useRef<Group>(null)
  const dirLightRef = useRef<DirectionalLight>(null)

  useFrame((state, delta) => {
    const group = dirGroupRef.current
    const light = dirLightRef.current
    if (!group || !light) return
    group.rotation.y += 0.7 * spinSpeed * delta
    light.position.z = 17 + Math.sin(state.time * 0.001 * spinSpeed) * 5
  })

  return (
    <>
      <ambientLight color="#444444" intensity={2} />
      <spotLight
        color="#ff8888"
        intensity={400}
        position={[8, 10, 5]}
        angle={Math.PI / 5}
        penumbra={0.3}
        castShadow
        shadow-camera-near={8}
        shadow-camera-far={200}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-radius={shadowRadius}
      />
      <group ref={dirGroupRef}>
        <directionalLight
          ref={dirLightRef}
          color="#8888ff"
          intensity={3}
          position={[3, 12, 17]}
          castShadow
          shadow-camera-near={0.1}
          shadow-camera-far={500}
          shadow-camera-left={-17}
          shadow-camera-right={17}
          shadow-camera-top={17}
          shadow-camera-bottom={-17}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-radius={shadowRadius}
        />
      </group>
    </>
  )
}
