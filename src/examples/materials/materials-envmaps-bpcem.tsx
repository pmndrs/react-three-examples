/**
 * materials-envmaps-bpcem
 * R3F port of three.js `webgpu_materials_envmaps_bpcem`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materials_envmaps_bpcem
 * (~244 lines of JS)
 *
 * Box-projected cube environment mapping (BPCEM): a small brick room lit by two
 * RectAreaLights, baked once into a cube render target, then reflected off a lava-
 * textured floor — with and without the parallax correction that keeps the
 * reflection's walls lining up with the room's actual walls.
 *
 * DEMONSTRATES
 * - `getParallaxCorrectNormal(reflectVector, boxSize, boxCenter)` (TSL) reprojecting
 *   the reflection vector against a box before sampling `pmremTexture` — the fix for
 *   cube-mapped reflections sliding off-model near a flat floor
 * - A `useCubeCamera` bake that runs ONCE (a `useEffect`, not `useFrame`) — the
 *   original's own `updateCubeMap()` is a one-shot capture, not a live per-frame
 *   reflection (contrast `cubemap-dynamic`, which re-bakes every frame)
 * - Two node-material variants (default vs. box-projected) built once via `useNodes`
 *   and swapped by reference on a leva toggle — no `needsUpdate` dance needed, since
 *   switching which material OBJECT is assigned doesn't touch a live graph the way
 *   toggling a property on one shared material would
 * - `RectAreaLightNode.setLTC` (module-scope one-time registration) + real
 *   `RectAreaLightHelper` children — the `lights-rectarealight` pattern
 *
 * DIVERGENCE from original
 * - `renderer.inspector.createParameters` dat.gui-style panel replaced with leva:
 *   the same two knobs (box projected toggle, roughness)
 * - `renderer.toneMapping` set explicitly to `NoToneMapping` — the original never
 *   sets it, so its effective tone mapping is the WebGPURenderer default, which
 *   fiber's own default (ACESFilmic) would otherwise silently override
 * - DemoHelpers' camera-controls orbit replaces `OrbitControls`; target/min/max
 *   distance match the original's `controls` settings exactly
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { bumpMap, float, getParallaxCorrectNormal, pmremTexture, reflectVector, texture, vec3 } from 'three/tsl';
import {
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoToneMapping,
  RectAreaLightNode,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three/webgpu';
import type { Mesh, RectAreaLight } from 'three/webgpu';
import { RectAreaLightHelper } from 'three/addons/helpers/RectAreaLightHelper.js';
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js';
import { Canvas, useNodes, useUniforms } from '@react-three/fiber/webgpu';
import { useCubeCamera, useTexture } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const TEXTURE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/';
const LAVA_URL = `${TEXTURE_BASE}lava/lavatile.jpg`;
const BRICK_DIFFUSE_URL = `${TEXTURE_BASE}brick_diffuse.jpg`;
const BRICK_BUMP_URL = `${TEXTURE_BASE}brick_bump.jpg`;

const GROUND_POSITION: [number, number, number] = [0, -49, 0];
// TSL constant vectors (not THREE.Vector3) — getParallaxCorrectNormal reads its box
// size/center as nodes, matching the original's `vec3(200, 100, 100)` call.
const BOX_SIZE = vec3(200, 100, 100);
const BOX_CENTER = vec3(0, -50, 0);

// One-time, global BRDF texture registration for RectAreaLight on the WebGPU backend
// (lights-rectarealight pattern) — safe at module load, no React-owned state involved.
RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init());

// The brick room: two facing pairs of walls + two side walls, sharing one material.
const WALLS: { position: [number, number, number]; rotationY: number }[] = [
  { position: [-50, 0, -50], rotationY: 0 },
  { position: [50, 0, -50], rotationY: 0 },
  { position: [-50, 0, 50], rotationY: Math.PI },
  { position: [50, 0, 50], rotationY: Math.PI },
  { position: [100, 0, 0], rotationY: -Math.PI / 2 },
  { position: [-100, 0, 0], rotationY: Math.PI / 2 },
];

function BrickWalls() {
  const diffuseTex = useTexture(BRICK_DIFFUSE_URL);
  const bumpTex = useTexture(BRICK_BUMP_URL);

  useEffect(() => {
    diffuseTex.colorSpace = SRGBColorSpace;
  }, [diffuseTex]);

  const { colorNode, normalNode } = useNodes(() => ({
    colorNode: texture(diffuseTex),
    normalNode: bumpMap(texture(bumpTex), float(5)),
  }));

  return (
    <>
      {WALLS.map(({ position, rotationY }, i) => (
        <mesh key={i} position={position} rotation-y={rotationY}>
          <planeGeometry args={[100, 100]} />
          <meshStandardNodeMaterial colorNode={colorNode} normalNode={normalNode} />
        </mesh>
      ))}
    </>
  );
}

// The lava-textured floor, reflecting the room via a cube camera baked ONCE — see
// header DEMONSTRATES.
function BpcemGround() {
  const { boxProjected, roughness } = useControls('materials-envmaps-bpcem', {
    boxProjected: true,
    roughness: { value: 0.25, min: 0, max: 1, step: 0.01 },
  });

  const rMap = useTexture(LAVA_URL);
  useEffect(() => {
    rMap.wrapS = rMap.wrapT = RepeatWrapping;
    rMap.repeat.set(2, 1);
  }, [rMap]);

  const { fbo, camera, update } = useCubeCamera({ resolution: 512, near: 1, far: 1000 });
  const groundRef = useRef<Mesh>(null);

  // Mipmapped HalfFloat filtering, matching the original's explicit texture setup —
  // must land before the one-shot capture below.
  useLayoutEffect(() => {
    fbo.texture.type = HalfFloatType;
    fbo.texture.minFilter = LinearMipmapLinearFilter;
    fbo.texture.magFilter = LinearFilter;
    fbo.texture.generateMipmaps = true;
  }, [fbo]);

  // ONE-SHOT bake (the original's `updateCubeMap()`, called once after `renderer.init()`)
  // — not a per-frame `useFrame` re-render like `cubemap-dynamic`'s live reflection.
  useEffect(() => {
    const ground = groundRef.current;
    if (!ground) return;
    ground.visible = false;
    update();
    ground.visible = true;
  }, [update]);

  const { roughness: roughnessUniform } = useUniforms({ roughness });

  const { defaultEnv, boxProjectedEnv, roughnessNode } = useNodes(() => ({
    defaultEnv: pmremTexture(fbo.texture),
    boxProjectedEnv: pmremTexture(fbo.texture, getParallaxCorrectNormal(reflectVector, BOX_SIZE, BOX_CENTER)),
    roughnessNode: texture(rMap).mul(roughnessUniform),
  }));

  return (
    <>
      <primitive object={camera} position={GROUND_POSITION} />
      <mesh ref={groundRef} rotation-x={-Math.PI / 2} position={GROUND_POSITION}>
        <planeGeometry args={[200, 100, 100]} />
        <meshStandardNodeMaterial
          envNode={boxProjected ? boxProjectedEnv : defaultEnv}
          roughnessNode={roughnessNode}
          metalness={1}
        />
      </mesh>
    </>
  );
}

const RECT_LIGHT_WIDTH = 50;
const RECT_LIGHT_HEIGHT = 50;
const RECT_LIGHT_INTENSITY = 5;

// A RectAreaLight with a real RectAreaLightHelper child, always looking at the room's
// center — the original always shows the helpers (no GUI toggle for them).
function RectLight({ color, position }: { color: string; position: [number, number, number] }) {
  const lightRef = useRef<RectAreaLight>(null);

  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    light.lookAt(0, 5, 0);
    const helper = new RectAreaLightHelper(light, 0xffffff);
    light.add(helper);
    return () => {
      light.remove(helper);
      helper.dispose();
    };
  }, []);

  return (
    <rectAreaLight
      ref={lightRef}
      color={color}
      intensity={RECT_LIGHT_INTENSITY}
      width={RECT_LIGHT_WIDTH}
      height={RECT_LIGHT_HEIGHT}
      position={position}
    />
  );
}

export default function MaterialsEnvmapsBpcem() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [0, 200, -200], fov: 45, near: 0.1, far: 1000 }}>
      <BrickWalls />
      <BpcemGround />
      <RectLight color="#9aaeff" position={[-99, 5, 0]} />
      <RectLight color="#f3aaaa" position={[99, 5, 0]} />
      <DemoHelpers grid={false} target={[0, -10, 0]} minDistance={10} maxDistance={400} />
    </Canvas>
  );
}
