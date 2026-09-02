// Sky — the physical sky driving the visible backdrop and the IBL fill, plus the
// directional key light. Unlike generator-building's Sky (whose shadow frustum must
// track a single tower's footprint), the city's shadow camera is a fixed box sized to
// the whole layout — the original hardcodes it once, so this port does too.
import { useLayoutEffect, useMemo } from 'react';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { Color, MathUtils, PMREMGenerator, Scene, Vector3 } from 'three/webgpu';

import { useThree } from '@react-three/fiber/webgpu';

const SUN_HORIZON_COLOR = new Color(0xffb072);
const SUN_MIDDAY_COLOR = new Color(0xfff4e8);

export function Sky({ timeOfDay }: { timeOfDay: number }) {
  const scene = useThree((s) => s.scene);
  const renderer = useThree((s) => s.renderer);

  const sky = useMemo(() => {
    const mesh = new SkyMesh();
    mesh.scale.setScalar(10000);
    mesh.turbidity.value = 8;
    mesh.rayleigh.value = 3;
    mesh.mieCoefficient.value = 0.008;
    mesh.mieDirectionalG.value = 0.88;
    return mesh;
  }, []);

  const env = useMemo(() => ({ pmremGenerator: new PMREMGenerator(renderer), envScene: new Scene() }), [renderer]);

  // Sun arc: low and warm at dawn/dusk, high and bright at noon, sweeping east → west.
  const sunDir = useMemo(() => {
    const u = (timeOfDay - 12) / 6; // -1 at sunrise, 0 at noon, +1 at sunset
    const elevation = Math.max(0, 1 - u * u) * 72; // degrees above the horizon, peaks at noon
    const azimuth = 90 - u * 55;
    return new Vector3().setFromSphericalCoords(1, MathUtils.degToRad(90 - elevation), MathUtils.degToRad(azimuth));
  }, [timeOfDay]);

  const transmittance = Math.sqrt(Math.max(sunDir.y, 0));
  const sunColor = useMemo(() => SUN_HORIZON_COLOR.clone().lerp(SUN_MIDDAY_COLOR, transmittance), [transmittance]);

  useLayoutEffect(() => {
    scene.environmentIntensity = 0.2;
    return () => {
      scene.environmentIntensity = 1;
    };
  }, [scene]);

  // Re-bake the sky (without the sun disc) into the environment map, then show it as
  // the backdrop (with the sun disc restored) — mirrors updateSun(); `sky` is
  // reparented by hand, never mounted via JSX (pattern: generator-building/Sky.tsx).
  useLayoutEffect(() => {
    const { pmremGenerator, envScene } = env;

    sky.sunPosition.value.copy(sunDir);
    sky.showSunDisc.value = false;
    envScene.add(sky);
    const envRT = pmremGenerator.fromScene(envScene);
    scene.environment?.dispose();
    scene.environment = envRT.texture;
    sky.showSunDisc.value = true;
    scene.add(sky);
  }, [env, scene, sky, sunDir]);

  return (
    <directionalLight
      color={sunColor}
      intensity={6 * transmittance}
      position={[sunDir.x * 600, sunDir.y * 600, sunDir.z * 600]}
      castShadow
      shadow-camera-left={-280}
      shadow-camera-right={280}
      shadow-camera-top={360}
      shadow-camera-bottom={-40}
      shadow-camera-far={2400}
      shadow-mapSize-width={4096}
      shadow-mapSize-height={4096}
      shadow-bias={-0.0004}
    />
  );
}
