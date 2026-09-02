// SpotLight + DirectionalLight, both shadow casters, configured via fiber's dash-path
// props (`shadow-camera-*`, `shadow-mapSize-*`, `shadow-radius`). The directional light
// orbits inside `dirGroup` and bobs along z — the same two independent animations the
// original drives from its bare `animate()` function, now a `useFrame` job.
import { useRef } from 'react';
import type { DirectionalLight, Group } from 'three/webgpu';

import { useFrame } from '@react-three/fiber/webgpu';
import { folder, useControls } from 'leva';

export interface LightsProps {
  spinSpeed: number;
}

export function Lights({ spinSpeed }: LightsProps) {
  const { shadowRadius } = useControls('shadowmap', {
    shadow: folder({ shadowRadius: { value: 4, min: 0, max: 10, step: 0.5 } }),
  });
  const dirGroupRef = useRef<Group>(null);
  const dirLightRef = useRef<DirectionalLight>(null);

  useFrame(({ time, delta }) => {
    const group = dirGroupRef.current;
    const light = dirLightRef.current;
    if (!group || !light) return;
    group.rotation.y += 0.7 * spinSpeed * delta;
    light.position.z = 17 + Math.sin(time * 0.001 * spinSpeed) * 5;
  });

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
  );
}
