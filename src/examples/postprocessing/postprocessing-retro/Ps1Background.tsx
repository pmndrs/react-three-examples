// The PS1-era skybox: a two-stop gradient from warm horizon to navy zenith, with
// procedural stars stamped into a spherical-coordinate grid. No texture, no geometry —
// it is one node hung off `scene.backgroundNode`.
import { useLayoutEffect } from 'react';
import type { Node } from 'three/webgpu';
import {
  atan,
  color,
  dot,
  float,
  floor,
  fract,
  length,
  mix,
  normalWorld,
  sin,
  smoothstep,
  step,
  vec2,
  vec3,
} from 'three/tsl';
import { useNodes, useThree } from '@react-three/fiber/webgpu';

export function Ps1Background() {
  const scene = useThree((state) => state.scene);

  const { ps1Background } = useNodes(() => {
    // normalWorld points outward from the camera; flipping Y puts the warm end down.
    const flippedY = normalWorld.y.negate();
    const skyUV = flippedY.mul(0.5).add(0.5);

    const skyGradient = mix(
      color('#663322'),
      mix(color('#330066'), color('#000033'), skyUV.smoothstep(0.4, 0.9)),
      skyUV.smoothstep(0.0, 0.4),
    );

    // Stars: quantise longitude/latitude into cells, hash each cell, and draw a
    // core + glow + cross flare in the ~15% of cells that win the threshold.
    const starUV = vec2(atan(normalWorld.x, normalWorld.z).mul(50), flippedY.asin().mul(50));
    const cellHash = fract(sin(dot(floor(starUV), vec2(12.9898, 78.233))).mul(43758.5453));

    const toCenter = fract(starUV).sub(0.5);
    const distToCenter = length(toCenter);
    const core = smoothstep(float(0.08), float(0.0), distToCenter);
    const glow = smoothstep(float(0.25), float(0.0), distToCenter).mul(0.4);
    const crossX = smoothstep(float(0.15), float(0.0), toCenter.x.abs()).mul(
      smoothstep(float(0.4), float(0.0), toCenter.y.abs()),
    );
    const crossY = smoothstep(float(0.15), float(0.0), toCenter.y.abs()).mul(
      smoothstep(float(0.4), float(0.0), toCenter.x.abs()),
    );
    const starShape = core.add(glow).add(crossX.add(crossY).mul(0.3));

    // Only above the horizon, only in winning cells, brightness varying by hash.
    const starIntensity = step(0.85, cellHash)
      .mul(smoothstep(float(-0.2), float(0.1), flippedY))
      .mul(starShape)
      .mul(cellHash.mul(0.6).add(0.4));
    const starColor = mix(vec3(1.0, 1.0, 0.95), vec3(0.8, 0.9, 1.0), cellHash);

    return { ps1Background: mix(skyGradient, starColor, starIntensity.clamp(0.0, 1.0)) };
  });

  // Layout effect: `scene.backgroundNode` is read at shader-graph build time (first RAF
  // render). The cast is the duck-typed *Node gap — `@types/three`'s Scene doesn't
  // declare it even though the WebGPU renderer reads it (UPSTREAM B11).
  useLayoutEffect(() => {
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null };
    withBackgroundNode.backgroundNode = ps1Background;
    return () => {
      withBackgroundNode.backgroundNode = null;
    };
  }, [scene, ps1Background]);

  return null;
}
