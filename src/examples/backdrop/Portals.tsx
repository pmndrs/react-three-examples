// Eight backdrop spheres arranged in a ring, each compositing the live frame
// (`viewportSharedTexture`) through a different TSL grading graph. See backdrop.tsx
// header DEMONSTRATES. Materials are built once: none of these graphs depend on React
// state.
import { useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import {
  blendOverlay,
  checker,
  color,
  float,
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
import { MathUtils, MeshStandardNodeMaterial } from 'three/webgpu'
import type { Group, Node } from 'three/webgpu'

const PORTAL_DISTANCE = 1

function usePortalMaterials() {
  return useMemo(() => {
    const configs: { backdropNode: Node; backdropAlphaNode?: Node }[] = [
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
    ]

    return configs.map(({ backdropNode, backdropAlphaNode }) => {
      const material = new MeshStandardNodeMaterial({ color: 0x0066ff })
      material.roughnessNode = float(0.2)
      material.metalnessNode = float(0)
      material.backdropNode = backdropNode
      material.backdropAlphaNode = backdropAlphaNode ?? null
      material.transparent = true
      return material
    })
  }, [])
}

interface PortalsProps {
  rotateSpeed: number
  rotatingRef: MutableRefObject<boolean>
}

export function Portals({ rotateSpeed, rotatingRef }: PortalsProps) {
  const groupRef = useRef<Group>(null)
  const materials = usePortalMaterials()

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group || !rotatingRef.current) return
    group.rotation.y += delta * rotateSpeed
  })

  return (
    <group ref={groupRef}>
      {materials.map((material, id) => {
        const rotation = MathUtils.degToRad(id * 45)
        return (
          <mesh
            key={id}
            material={material}
            position={[Math.cos(rotation) * PORTAL_DISTANCE, 1, Math.sin(rotation) * PORTAL_DISTANCE]}
          >
            <sphereGeometry args={[0.3, 32, 16]} />
          </mesh>
        )
      })}
    </group>
  )
}
