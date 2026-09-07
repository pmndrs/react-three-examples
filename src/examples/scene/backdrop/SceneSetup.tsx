// Scene fixtures that have no declarative JSX equivalent: the TSL sky-gradient
// background and a spotlight rigidly attached to the camera. See backdrop.tsx header
// DEMONSTRATES for both.
import { useEffect, useMemo } from 'react';
import { color, screenUV } from 'three/tsl';
import { SpotLight } from 'three/webgpu';

import { useThree } from '@react-three/fiber/webgpu';

// Scene-level TSL sky gradient. `@types/three` declares `backgroundNode` on `Scene`
// directly (0.185.1), so no cast is needed.
export function SceneBackground() {
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const withBackgroundNode = scene;
    withBackgroundNode.backgroundNode = screenUV.y.mix(color(0x66bbff), color(0x4466ff));
    return () => {
      withBackgroundNode.backgroundNode = null;
    };
  }, [scene]);

  return null;
}

// SpotLight rigidly attached to the camera (a declarative equivalent exists —
// `<PerspectiveCamera makeDefault><spotLight/></PerspectiveCamera>`, used by
// postprocessing-bloom — but this attaches to whatever camera Canvas's `camera` prop
// made default, so it's kept imperative on purpose, same as skinning-instancing's
// `CameraLight`).
export function CameraLight() {
  const camera = useThree((s) => s.camera);
  const light = useMemo(() => {
    const l = new SpotLight('#ffffff', 1);
    l.power = 2000;
    return l;
  }, []);

  useEffect(() => {
    camera.add(light);
    return () => {
      camera.remove(light);
    };
  }, [camera, light]);

  return null;
}
