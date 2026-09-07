// Scene-level TSL sky gradient with no declarative JSX equivalent. See
// backdrop-water.tsx header DEMONSTRATES. Same escape hatch as `backdrop`/
// `reflection`'s `SceneBackground`.
import { useEffect } from 'react';
import { color, normalWorld } from 'three/tsl';

import { useThree } from '@react-three/fiber/webgpu';

// `@types/three` declares `backgroundNode` on `Scene` directly (0.185.1), so no
// cast is needed.
export function SceneBackground() {
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const withBackgroundNode = scene;
    withBackgroundNode.backgroundNode = normalWorld.y.mix(color(0x0487e2), color(0x0066ff));
    return () => {
      withBackgroundNode.backgroundNode = null;
    };
  }, [scene]);

  return null;
}
