// A point-light COUNT modeled as React state, so leva buttons can grow or shrink it
// live without ever recompiling the 50 materials in Shapes.tsx — `renderer.lighting =
// new DynamicLighting()` (the reason that never recompiles) is installed from the
// Canvas's renderer factory in lights-dynamic.tsx, not here. See the page header for
// the full DEMONSTRATES/DIVERGENCE notes.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Color } from 'three/webgpu';
import type { PointLight } from 'three/webgpu';

import { useFrame } from '@react-three/fiber/webgpu';
import { button, useControls } from 'leva';

interface LightConfig {
  id: number;
  color: string;
  angle: number;
  radius: number;
  speed: number;
  baseY: number;
}

let nextLightId = 0;
function makeLight(): LightConfig {
  const color = new Color().setHSL(Math.random(), 0.8, 0.5);
  return {
    id: nextLightId++,
    color: `#${color.getHexString()}`,
    angle: Math.random() * Math.PI * 2,
    radius: 5 + Math.random() * 20,
    speed: 0.2 + Math.random() * 0.8,
    baseY: 1 + Math.random() * 6,
  };
}

// One orbiting point light carrying its own marker sphere, orbit data taken as props
// (lights-phong's rule) — the array this is mapped over is what's actually dynamic.
function PointLightRig({ color, angle, radius, speed, baseY }: Omit<LightConfig, 'id'>) {
  const lightRef = useRef<PointLight>(null);

  useFrame(({ elapsed }) => {
    const light = lightRef.current;
    if (!light) return;
    const t = elapsed * speed + angle;
    light.position.set(Math.cos(t) * radius, baseY + Math.sin(t * 2) * 0.5, Math.sin(t) * radius);
  });

  return (
    <pointLight ref={lightRef} color={color} intensity={1000}>
      <mesh>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </pointLight>
  );
}

// Owns the light COUNT as React state and the leva add/remove/auto-add controls —
// see header DEMONSTRATES.
export function DynamicLights() {
  const [lights, setLights] = useState<LightConfig[]>(() => [makeLight(), makeLight()]);

  const addLight = useCallback(() => setLights((prev) => [...prev, makeLight()]), []);
  const removeLight = useCallback(() => setLights((prev) => prev.slice(0, -1)), []);
  const removeAll = useCallback(() => setLights([]), []);

  const { autoAdd } = useControls('lights-dynamic', {
    autoAdd: { value: false, label: 'auto-add lights' },
    'add light': button(() => addLight()),
    'remove light': button(() => removeLight()),
    'remove all lights': button(() => removeAll()),
  });

  useEffect(() => {
    if (!autoAdd) return;
    const interval = setInterval(addLight, 500);
    return () => clearInterval(interval);
  }, [autoAdd, addLight]);

  return (
    <>
      <ambientLight color="#404040" intensity={0.5} />
      {lights.map((light) => (
        <PointLightRig key={light.id} {...light} />
      ))}
    </>
  );
}
