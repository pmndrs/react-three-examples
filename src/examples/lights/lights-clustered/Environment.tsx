// The backdrop: a physical sky (visible, plus baked into an IBL environment for the
// scene's ambient tint), a huge ground slab, and the four big spheres the orb field
// leaves clearings for.
import { useLayoutEffect, useState } from 'react';
import { MathUtils, PMREMGenerator, Scene, Vector3 } from 'three/webgpu';

import { useThree } from '@react-three/fiber/webgpu';

import { SkyMesh } from '../../../assets/SkyMesh';

const BIG_RADIUS = 6;
const BIG_POSITIONS: [number, number, number][] = [
  [-9, BIG_RADIUS, -9],
  [9, BIG_RADIUS, -9],
  [-9, BIG_RADIUS, 9],
  [9, BIG_RADIUS, 9],
];

// Sun sits 2° below the horizon (elevation 92° from zenith) for an almost-night mood —
// SkyMesh's own uniform fields, configured once since nothing here is a leva control.
function makeSky() {
  const sky = new SkyMesh();
  sky.turbidity.value = 10;
  sky.rayleigh.value = 3;
  sky.mieCoefficient.value = 0.005;
  sky.mieDirectionalG.value = 0.7;
  sky.showSunDisc.value = false;
  sky.sunPosition.value.copy(new Vector3().setFromSphericalCoords(1, MathUtils.degToRad(92), MathUtils.degToRad(225)));
  return sky;
}

export function Environment() {
  const scene = useThree((s) => s.scene);
  const renderer = useThree((s) => s.renderer);
  const [sky] = useState(() => makeSky());

  // Bake the (otherwise-hidden-below-the-horizon) sky into an environment map for the
  // faint ambient tint it still casts — a private one-mesh scene, not the live scene,
  // so the ground/big spheres never fold into their own lighting (same isolated-bake
  // idiom as custom-fog/SunSky.tsx). One-time: nothing here is animated or leva-driven.
  useLayoutEffect(() => {
    const pmremGenerator = new PMREMGenerator(renderer);
    const envScene = new Scene();
    envScene.add(makeSky());
    scene.environment = pmremGenerator.fromScene(envScene).texture;
    scene.environmentIntensity = 0.75;
    pmremGenerator.dispose();
  }, [scene, renderer]);

  return (
    <>
      <primitive object={sky} scale={10000} />

      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1000, 1000]} />
        <meshStandardNodeMaterial color="#2a2a2a" roughness={0.6} metalness={0} />
      </mesh>

      {BIG_POSITIONS.map((position, i) => (
        <mesh key={i} position={position}>
          <sphereGeometry args={[BIG_RADIUS, 64, 32]} />
          <meshStandardNodeMaterial color="#dddddd" roughness={0.5} metalness={0} />
        </mesh>
      ))}
    </>
  );
}
