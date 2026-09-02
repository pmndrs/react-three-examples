// Eight backdrop spheres arranged in a ring, each compositing the live frame
// (`viewportSharedTexture`) through a different TSL grading graph. See backdrop.tsx
// header DEMONSTRATES. Configs are built once: none of these graphs depend on React
// state.
import { useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import {
  blendOverlay,
  checker,
  color,
  grayscale,
  hue,
  oscSine,
  saturation,
  screenUV,
  uv,
  vec3,
  viewportSafeUV,
  viewportSharedTexture,
} from 'three/tsl'
import { MathUtils } from 'three/webgpu'
import type { Group, Node } from 'three/webgpu'

import { useFrame } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'

const PORTAL_DISTANCE = 1

function usePortalConfigs() {
  return useMemo(
    () =>
      [
        { backdropNode: hue(viewportSharedTexture().bgr, oscSine().mul(Math.PI)) },
        { backdropNode: viewportSharedTexture().rgb.oneMinus() },
        { backdropNode: grayscale(viewportSharedTexture().rgb) },
        { backdropNode: saturation(viewportSharedTexture().rgb, 10), backdropAlphaNode: oscSine() },
        { backdropNode: blendOverlay(viewportSharedTexture().rgb, checker(uv().mul(10))) },
        { backdropNode: viewportSharedTexture(viewportSafeUV(screenUV.mul(40).floor().div(40))) },
        {
          backdropNode: viewportSharedTexture(viewportSafeUV(screenUV.mul(80).floor().div(80))).add(color(0x0033ff)),
        },
        { backdropNode: vec3(0, 0, viewportSharedTexture().b) },
      ] satisfies { backdropNode: Node; backdropAlphaNode?: Node }[],
    [],
  )
}

export function Portals({ rotatingRef }: { rotatingRef: MutableRefObject<boolean> }) {
  const groupRef = useRef<Group>(null)
  const configs = usePortalConfigs()
  const { rotateSpeed } = useControls('backdrop', {
    rotateSpeed: { value: 0.5, min: 0, max: 2, step: 0.05 },
  })

  useFrame(({ delta }) => {
    const group = groupRef.current
    if (!group || !rotatingRef.current) return
    group.rotation.y += delta * rotateSpeed
  })

  return (
    <group ref={groupRef}>
      {configs.map(({ backdropNode, backdropAlphaNode }, id) => {
        const rotation = MathUtils.degToRad(id * 45)
        return (
          <mesh key={id} position={[Math.cos(rotation) * PORTAL_DISTANCE, 1, Math.sin(rotation) * PORTAL_DISTANCE]}>
            <sphereGeometry args={[0.3, 32, 16]} />
            <meshStandardNodeMaterial
              color={0x0066ff}
              roughness={0.2}
              metalness={0}
              backdropNode={backdropNode}
              backdropAlphaNode={backdropAlphaNode}
              transparent
            />
          </mesh>
        )
      })}
    </group>
  )
}
