// Scene-level TSL sky gradient with no declarative JSX equivalent. See
// backdrop-water.tsx header DEMONSTRATES. Same escape hatch as `backdrop`/
// `reflection`'s `SceneBackground`.
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber/webgpu'
import { color, normalWorld } from 'three/tsl'
import type { Node } from 'three/webgpu'

// Cast: `@types/three`'s `Scene` doesn't declare `backgroundNode` even though the
// webgpu renderer reads it directly off the live scene instance (duck-typed gap,
// UPSTREAM.md B11).
export function SceneBackground() {
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null }
    withBackgroundNode.backgroundNode = normalWorld.y.mix(color(0x0487e2), color(0x0066ff))
    return () => {
      withBackgroundNode.backgroundNode = null
    }
  }, [scene])

  return null
}
