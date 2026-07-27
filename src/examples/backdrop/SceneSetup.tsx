// Scene fixtures that have no declarative JSX equivalent: the TSL sky-gradient
// background and a spotlight rigidly attached to the camera. See backdrop.tsx header
// DEMONSTRATES for both.
import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber/webgpu'
import { color, screenUV } from 'three/tsl'
import { SpotLight } from 'three/webgpu'
import type { Node } from 'three/webgpu'

// Scene-level TSL sky gradient. Cast: `@types/three`'s `Scene` doesn't declare
// `backgroundNode` even though the webgpu renderer reads it directly off the live scene
// instance (same duck-typed gap as `reflection.tsx`'s `SceneBackground`).
export function SceneBackground() {
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null }
    withBackgroundNode.backgroundNode = screenUV.y.mix(color(0x66bbff), color(0x4466ff))
    return () => {
      withBackgroundNode.backgroundNode = null
    }
  }, [scene])

  return null
}

// SpotLight rigidly attached to the camera. No declarative "light as camera child"
// pattern exists in R3F — same escape hatch as skinning-instancing's `CameraLight`.
export function CameraLight() {
  const camera = useThree((s) => s.camera)
  const light = useMemo(() => {
    const l = new SpotLight('#ffffff', 1)
    l.power = 2000
    return l
  }, [])

  useEffect(() => {
    camera.add(light)
    return () => {
      camera.remove(light)
    }
  }, [camera, light])

  return null
}
