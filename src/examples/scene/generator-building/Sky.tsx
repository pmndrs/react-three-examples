// Sky — the physical sky driving both the visible backdrop and the IBL fill, plus the
// directional key light whose crisp shadow the sky's soft fill alone can't give.
// `timeOfDay` walks the sun along a fixed dawn-to-dusk arc; `fitShadowCamera` (the
// original's own name) refits the light's shadow frustum to the tower on every sun
// OR dimension change, so a low sun's long shadow is never clipped.
import { useLayoutEffect, useMemo, useRef } from 'react';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { Color, MathUtils, PMREMGenerator, Scene, Vector3 } from 'three/webgpu';
import type { DirectionalLight } from 'three/webgpu';

import { useThree } from '@react-three/fiber/webgpu';

export interface SkyProps {
  timeOfDay: number; // hours: 6 sunrise, 12 noon, 18 sunset
  height: number;
  width: number;
  depth: number;
}

const SUN_HORIZON_COLOR = new Color(0xffb072);
const SUN_MIDDAY_COLOR = new Color(0xfff4e8);

export function Sky({ timeOfDay, height, width, depth }: SkyProps) {
  const scene = useThree((s) => s.scene);
  const renderer = useThree((s) => s.renderer);
  const sunRef = useRef<DirectionalLight>(null);

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

  // Real sunlight is far brighter than the sky, so the sun stays the key and casts
  // shadows that read clearly against the soft fill. The longer air path near the
  // horizon dims and warms it (the fill dims with it — the environment is re-baked
  // below).
  const transmittance = Math.sqrt(Math.max(sunDir.y, 0));
  const sunColor = useMemo(() => SUN_HORIZON_COLOR.clone().lerp(SUN_MIDDAY_COLOR, transmittance), [transmittance]);

  // Sky fill only — the sun is the key. Layout effect: the tower's first shader build
  // must already see the environment (AGENTS.md B15).
  useLayoutEffect(() => {
    scene.environmentIntensity = 0.25;
    return () => {
      scene.environmentIntensity = 1;
    };
  }, [scene]);

  // Re-bake the sky (without the sun disc) into the environment map, then fit the
  // shadow frustum to the tower — mirrors the original's updateSun()/fitShadowCamera().
  // `sky` is reparented by hand each time: into `envScene` to bake, then back onto the
  // visible `scene` as the backdrop (with the sun disc back on) — it is never mounted
  // via JSX (contrast custom-fog/SunSky.tsx, where the sky is never made visible at all).
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

    const sunLight = sunRef.current;
    if (!sunLight) return;

    // fitShadowCamera: centre the frustum on where the tower's shadow actually falls
    // (not the origin), sized to the tower footprint plus margin, so a low sun's long
    // shadow isn't clipped.
    const tipDistance = height / Math.max(sunDir.y, 0.05); // shadow tip on the ground
    const centerX = -sunDir.x * tipDistance * 0.5;
    const centerZ = -sunDir.z * tipDistance * 0.5;

    const radius = Math.hypot(width, depth) * 0.5;
    const half = Math.hypot(centerX, centerZ) + radius + 20;
    const distance = half + height; // place the light clear of the whole scene

    sunLight.target.position.set(centerX, 0, centerZ);
    sunLight.target.updateMatrixWorld();
    sunLight.position.set(centerX + sunDir.x * distance, sunDir.y * distance, centerZ + sunDir.z * distance);

    const shadowCamera = sunLight.shadow.camera;
    shadowCamera.left = -half;
    shadowCamera.right = half;
    shadowCamera.top = half;
    shadowCamera.bottom = -half;
    shadowCamera.near = 1;
    shadowCamera.far = distance * 2;
    shadowCamera.updateProjectionMatrix();
  }, [env, scene, sky, sunDir, height, width, depth]);

  return (
    <>
      <directionalLight
        ref={sunRef}
        color={sunColor}
        intensity={6 * transmittance}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
      />
    </>
  );
}
