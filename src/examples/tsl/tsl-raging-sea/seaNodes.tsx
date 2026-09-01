import { folder } from 'leva';
import { useLayoutEffect, useRef } from 'react';
import {
  Fn,
  Loop,
  float,
  mul,
  mx_noise_float,
  positionLocal,
  sin,
  time,
  transformNormalToView,
  vec3,
} from 'three/tsl';
import type { Node, PlaneGeometry } from 'three/webgpu';

//* Controls ======================================================

/** Leva schema for the wave graph. Every key here becomes a live uniform. */
export const seaControls = {
  color: '#271442',
  roughness: { value: 0.15, min: 0, max: 1, step: 0.001 },
  emissive: folder({
    emissiveColor: { value: '#ff0a81', label: 'color' },
    emissiveLow: { value: -0.25, min: -1, max: 0, step: 0.001, label: 'low' },
    emissiveHigh: { value: 0.2, min: 0, max: 1, step: 0.001, label: 'high' },
    emissivePower: { value: 7, min: 1, max: 10, step: 1, label: 'power' },
  }),
  largeWaves: folder({
    largeWavesFrequencyX: { value: 3, min: 0, max: 10, label: 'frequency X' },
    largeWavesFrequencyY: { value: 1, min: 0, max: 10, label: 'frequency Y' },
    largeWavesSpeed: { value: 1.25, min: 0, max: 5, label: 'speed' },
    largeWavesMultiplier: { value: 0.15, min: 0, max: 1, label: 'multiplier' },
  }),
  smallWaves: folder({
    smallWavesIterations: { value: 3, min: 0, max: 5, step: 1, label: 'iterations' },
    smallWavesFrequency: { value: 2, min: 0, max: 10, label: 'frequency' },
    smallWavesSpeed: { value: 0.3, min: 0, max: 1, label: 'speed' },
    smallWavesMultiplier: { value: 0.18, min: 0, max: 1, label: 'multiplier' },
  }),
  normalComputeShift: { value: 0.01, min: 0, max: 0.1, step: 0.0001, label: 'normal shift' },
};

//* Shader graph ==================================================

type SeaUniforms = Record<
  | 'emissiveLow'
  | 'emissiveHigh'
  | 'emissivePower'
  | 'largeWavesFrequencyX'
  | 'largeWavesFrequencyY'
  | 'largeWavesSpeed'
  | 'largeWavesMultiplier'
  | 'smallWavesIterations'
  | 'smallWavesFrequency'
  | 'smallWavesSpeed'
  | 'smallWavesMultiplier'
  | 'normalComputeShift',
  Node<'float'>
> & { emissiveColor: Node<'color'> };

/**
 * Builds the sea's position / normal / emissive nodes from live uniforms.
 * Called once inside `useNodes` — the uniforms keep it reactive without a rebuild.
 */
export function makeSeaNodes(u: SeaUniforms) {
  // Two crossed sine waves, with smaller noise octaves subtracted out of them.
  const wavesElevation = Fn(([position]) => {
    const elevation = mul(
      sin(position.x.mul(u.largeWavesFrequencyX).add(time.mul(u.largeWavesSpeed))),
      sin(position.z.mul(u.largeWavesFrequencyY).add(time.mul(u.largeWavesSpeed))),
      u.largeWavesMultiplier,
    ).toVar();

    // A TSL Loop runs in WGSL, so the octave count stays live off the uniform.
    Loop({ start: float(1), end: u.smallWavesIterations.add(1) }, ({ i }) => {
      const noiseInput = vec3(
        position.xz
          .add(2) // avoids the a-hole pattern at the origin
          .mul(u.smallWavesFrequency)
          .mul(i),
        time.mul(u.smallWavesSpeed),
      );

      elevation.subAssign(
        mx_noise_float(noiseInput, 1, 0).mul(u.smallWavesMultiplier).div(i).abs(),
      );
    });

    return elevation;
  });

  const elevation = wavesElevation(positionLocal);
  const positionNode = positionLocal.add(vec3(0, elevation, 0));

  // Normals by finite difference: sample two neighbours and cross the directions.
  const normalNode = Fn(() => {
    const a = positionLocal.add(vec3(u.normalComputeShift, 0, 0));
    const b = positionLocal.add(vec3(0, 0, u.normalComputeShift.negate()));

    const positionA = a.add(vec3(0, wavesElevation(a), 0));
    const positionB = b.add(vec3(0, wavesElevation(b), 0));

    const toA = positionA.sub(positionNode).normalize();
    const toB = positionB.sub(positionNode).normalize();

    return transformNormalToView(toA.cross(toB));
  });

  // Reversing the elevation range lights the troughs instead of the crests.
  const emissiveNode = u.emissiveColor.mul(
    elevation.remap(u.emissiveHigh, u.emissiveLow).pow(u.emissivePower),
  );

  return { positionNode, normalNode: normalNode(), emissiveNode };
}

//* Geometry ======================================================

/**
 * A densely subdivided plane, rotated flat in GEOMETRY space so the shader can
 * displace `positionLocal.y`. Rotating the mesh would turn the displacement with it.
 */
export function TerrainGeometry() {
  const ref = useRef<PlaneGeometry>(null);

  useLayoutEffect(() => {
    const geometry = ref.current;
    // Fast Refresh keeps the geometry but reruns the effect — rotate only once.
    if (!geometry || geometry.userData.rotatedToHorizontal) return;

    geometry.userData.rotatedToHorizontal = true;
    geometry.rotateX(-Math.PI / 2);
  }, []);

  return <planeGeometry args={[2, 2, 256, 256]} ref={ref} />;
}
