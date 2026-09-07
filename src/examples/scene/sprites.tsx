/**
 * sprites
 * R3F port of three.js `webgpu_sprites`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_sprites (~156 lines of JS)
 *
 * DEMONSTRATES
 * - One `SpriteNodeMaterial` shared by every sprite in the field: `rotationNode` reads
 *   `userData('rotation', 'float')` off whichever Sprite instance is currently being
 *   drawn, so a single node graph (one GPU program) drives independent per-sprite
 *   rotation from nothing but each object's own `userData` — no per-sprite material,
 *   no uniform array
 * - `colorNode`/`opacityNode` composed from a shared `texture()` node
 *   (`textureNode.mul(uv()).mul(2).saturate()` / `textureNode.a`), the same
 *   node-composition style used by the other node-material ports in this repo
 * - Scene-level TSL fog (`fog(color(...), rangeFogFactor(near, far))` assigned to
 *   `scene.fogNode`) in place of the legacy `Fog`/`FogExp2` objects. Leva values flow
 *   through stable `useUniforms` nodes, so control changes update the GPU values
 *   without rebuilding the fog graph
 *
 * DIVERGENCE from original
 * - Per-frame mutation loop (rotation increment, breathing scale, group spin) ported
 *   into a `useFrame` that walks `groupRef.current.children`, mirroring the original's
 *   own `group.children` loop almost verbatim — kept imperative on purpose, this IS the
 *   escape hatch Layer 1 asks to showcase, not something to make declarative
 * - `amount`, `radius`, and a `spinSpeed` multiplier (scales every per-frame rotation
 *   increment and the group spin together) plus fog color/near/far exposed via leva;
 *   the original hard-codes all of these with no UI
 * - Async `image.onload` width/height dance dropped: drei's `useTexture` suspends until
 *   the image has fully decoded, so `map.image.width/height` are available on first
 *   render. The original's `imageWidth`/`imageHeight` closure variables exist only
 *   because its bare `TextureLoader.load(url, onLoad)` call returns before the image
 *   resolves
 * - DemoHelpers added (camera-controls orbit); grid disabled (`grid={false}`) — the
 *   original scene is sprites floating in a fogged void with no ground plane, and a
 *   grid would cut across it. The original has zero user interaction (fixed camera);
 *   DemoHelpers' orbit is purely additive
 */
import { Suspense, useMemo, useRef } from 'react';
import { fog, rangeFogFactor, texture, userData, uv } from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import type { Group } from 'three/webgpu';
import { Canvas, useFrame, useLocalNodes, useNodes, useUniforms, useTexture, fromRef } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const SPRITE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/sprite1.png';

interface SpriteFieldProps {
  amount: number;
  radius: number;
  spinSpeed: number;
}

// One SpriteNodeMaterial shared by the whole field — see header DEMONSTRATES.
function SpriteField({ amount, radius, spinSpeed }: SpriteFieldProps) {
  const map = useTexture(SPRITE_URL);
  const groupRef = useRef<Group>(null);
  const { textureNode } = useLocalNodes(() => ({ textureNode: texture(map) }));

  // Positions drawn once on a unit sphere * radius (no THREE.Vector3 allocation, to
  // dodge @react-three/eslint-plugin's no-new-in-loop for this Array.from body);
  // regenerated only when the amount/radius controls change, matching the original's
  // one-time random layout.
  const positions = useMemo<[number, number, number][]>(
    () =>
      Array.from({ length: amount }, () => {
        const x = Math.random() - 0.5;
        const y = Math.random() - 0.5;
        const z = Math.random() - 0.5;
        const scale = radius / (Math.hypot(x, y, z) || 1);
        return [x * scale, y * scale, z * scale];
      }),
    [amount, radius],
  );

  // Texture.image types as `unknown` (@types/three's generic default, since the loader
  // could hand back canvases/video/bitmaps) — cast to the shape TextureLoader's decoded
  // HTMLImageElement actually has.
  const { width: imageWidth, height: imageHeight } = map.image as {
    width: number;
    height: number;
  };

  useFrame(({ elapsed }) => {
    const group = groupRef.current;
    if (!group) return;

    const children = group.children;

    for (let i = 0; i < children.length; i++) {
      const sprite = children[i];
      const data = sprite.userData as { rotation: number };
      const scale = Math.sin(elapsed + sprite.position.x * 0.01) * 0.3 + 1.0;
      data.rotation += 0.1 * spinSpeed * (i / children.length);
      sprite.scale.set(scale * imageWidth, scale * imageHeight, 1);
    }

    group.rotation.x = elapsed * 0.5 * spinSpeed;
    group.rotation.y = elapsed * 0.75 * spinSpeed;
    group.rotation.z = elapsed * 1.0 * spinSpeed;
  });

  const materialRef = useRef<SpriteNodeMaterial>(null);

  return (
    <group ref={groupRef}>
      <spriteNodeMaterial
        ref={materialRef}
        colorNode={textureNode.mul(uv()).mul(2).saturate()}
        opacityNode={textureNode.a}
        rotationNode={userData('rotation', 'float')} // reads sprite.userData.rotation
      />
      {positions.map((position, i) => (
        <sprite key={i} material={fromRef(materialRef)} position={position} userData={{ rotation: 0 }} />
      ))}
    </group>
  );
}

// Scene-level TSL fog. `@types/three` declares `fogNode` on `Scene` directly, so no
// cast is needed.
function SceneFog() {
  const fogValues = useControls('sprites fog', {
    fogColor: '#0000ff',
    near: { value: 1500, min: 500, max: 2000, step: 10 },
    far: { value: 2100, min: 1600, max: 3000, step: 10 },
  });
  useUniforms(fogValues);
  useNodes(({ scene, uniforms }) => {
    scene.fogNode = fog(uniforms.fogColor, rangeFogFactor(uniforms.near, uniforms.far));
    return { fogNode: scene.fogNode };
  });

  return null;
}

export default function Sprites() {
  const { amount, radius, spinSpeed } = useControls('sprites', {
    amount: { value: 200, min: 20, max: 400, step: 10 },
    radius: { value: 500, min: 100, max: 900, step: 10 },
    spinSpeed: { value: 1, min: 0, max: 2, step: 0.05 },
  });

  return (
    <Canvas renderer background="#000000" camera={{ position: [0, 0, 1500], fov: 60, near: 1, far: 2100 }}>
      <SceneFog />
      <Suspense fallback={null}>
        <SpriteField amount={amount} radius={radius} spinSpeed={spinSpeed} />
      </Suspense>
      <DemoHelpers grid={false} />
    </Canvas>
  );
}
