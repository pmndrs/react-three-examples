// The animated column of smoke above the mug: one transparent plane whose vertices are
// twisted and blown about entirely in TSL, sampling a tiling perlin texture for both
// the motion and the alpha pattern.
import {
  Fn,
  mix,
  mul,
  oneMinus,
  positionLocal,
  rotateUV,
  smoothstep,
  texture,
  time,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { DoubleSide, RepeatWrapping } from 'three/webgpu';
import { useNodes } from '@react-three/fiber/webgpu';
import { useTexture } from '@react-three/drei/webgpu';

const NOISE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/noises/perlin/128x128.png';

export function Smoke() {
  const noise = useTexture(NOISE_URL, (map) => {
    map.wrapS = RepeatWrapping;
    map.wrapT = RepeatWrapping;
  });

  const { positionNode, colorNode } = useNodes(() => ({
    // Fn() is load-bearing: rotateUV/assign/addAssign need an active TSL stack.
    positionNode: Fn(() => {
      // Twist — one noise column scrolling down the plane rotates each ring of
      // vertices about the local Y axis.
      const twistNoiseUv = vec2(0.5, uv().y.mul(0.2).sub(time.mul(0.005)).mod(1));
      const twist = texture(noise, twistNoiseUv).r.mul(10);
      positionLocal.xz.assign(rotateUV(positionLocal.xz, twist, vec2(0)));

      // Wind — two more noise samples push the whole column sideways, weighted by
      // height so the base stays anchored to the cup.
      const windOffset = vec2(
        texture(noise, vec2(0.25, time.mul(0.01)).mod(1)).r.sub(0.5),
        texture(noise, vec2(0.75, time.mul(0.01)).mod(1)).r.sub(0.5),
      ).mul(uv().y.pow(2).mul(10));
      positionLocal.addAssign(windOffset);

      return positionLocal;
    })(),

    colorNode: Fn(() => {
      // Alpha = a scrolling noise pattern times a soft border fade on all four edges.
      const alphaNoiseUv = uv()
        .mul(vec2(0.5, 0.3))
        .add(vec2(0, time.mul(0.03).negate()));
      const alpha = mul(
        texture(noise, alphaNoiseUv).r.smoothstep(0.4, 1),
        smoothstep(0, 0.1, uv().x),
        smoothstep(0, 0.1, oneMinus(uv().x)),
        smoothstep(0, 0.1, uv().y),
        smoothstep(0, 0.1, oneMinus(uv().y)),
      );

      return vec4(mix(vec3(0.6, 0.3, 0.2), vec3(1, 1, 1), alpha.pow(3)), alpha);
    })(),
  }));

  return (
    // The original bakes the pivot into the geometry (translate + scale); a plain
    // 1.5 x 6 plane lifted to the same place is the same thing, and the shader only
    // ever ADDS to positionLocal so the recentring is invisible to it.
    // positionNode moves the vertices far outside that box — hence frustumCulled off.
    <mesh position={[0, 4.83, 0]} frustumCulled={false}>
      <planeGeometry args={[1.5, 6, 16, 64]} />
      <meshBasicNodeMaterial
        transparent
        depthWrite={false}
        side={DoubleSide}
        positionNode={positionNode}
        colorNode={colorNode}
      />
    </mesh>
  );
}
