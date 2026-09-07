/**
 * instance-path
 * R3F port of three.js `webgpu_instance_path`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_instance_path (~110 lines of JS)
 *
 * DEMONSTRATES
 * - Rendering 1000 instances of ONE mesh via `mesh.count` — three.js's generic
 *   GPU-instancing escape hatch that works on a plain `Mesh`, no `InstancedMesh`
 *   class required (same technique as `instance-mesh` and `reflection/Tree.tsx`)
 * - Four raw `InstancedBufferAttribute`s (position/color/time/seed), read back with
 *   `instancedBufferAttribute()` and driven ENTIRELY inside the TSL graph: instances
 *   travel along a heart-shaped `Path` by looping `instanceTime + time` through
 *   `mod(..., 1)` on the GPU — no per-frame JS loop, no `setMatrixAt`
 * - A `select()`-driven pulse: instances near the animated "leader" point on the
 *   path scale up momentarily, entirely from `remap`/`select`/`toConst` node math
 * - A custom `scene.backgroundNode` radial vignette (`screenUV.distance(0.5)`)
 * - RoomEnvironment -> `PMREMGenerator.fromScene` IBL as the sole light source
 *
 * DIVERGENCE from original
 * - OrbitControls -> DemoHelpers CameraControls; grid disabled (the original is a
 *   dark radial-gradient void with no ground plane)
 */
import { useEffect, useMemo } from 'react';
import {
  abs,
  add,
  color,
  float,
  instancedBufferAttribute,
  mod,
  positionLocal,
  screenUV,
  select,
  sin,
  time,
  vec3,
} from 'three/tsl';
import {
  Color,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  Mesh,
  MeshStandardNodeMaterial,
  NeutralToneMapping,
  PMREMGenerator,
  Path,
  Vector2,
  Vector3,
} from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Canvas, useThree } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const COUNT = 1000;

// Radial vignette from magenta core to black edge, ported verbatim from the
// original's init(). @types/three declares `backgroundNode` on `Scene` directly
// (0.185.1), so no cast is needed.
function SceneBackground() {
  const scene = useThree((s) => s.scene);

  useMemo(() => {
    const withBackgroundNode = scene;
    withBackgroundNode.backgroundNode = screenUV.distance(0.5).remap(0, 0.65).mix(color(0x94254c), color(0x000000));
  }, [scene]);

  return null;
}

// RoomEnvironment -> PMREM -> scene.environment: the scene's only light source
// (matches the original — no analytical lights).
function RoomEnv() {
  const renderer = useThree((s) => s.renderer);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const environment = new RoomEnvironment();
    const pmremGenerator = new PMREMGenerator(renderer);
    const envRT = pmremGenerator.fromScene(environment, 0.04);
    scene.environment = envRT.texture;
    environment.dispose();
    pmremGenerator.dispose();
    return () => {
      scene.environment = null;
      envRT.dispose();
    };
  }, [renderer, scene]);

  return null;
}

// Heart-shaped Path -> COUNT points sampled along it, one instance per point. Pure
// CPU data prep, ported near-verbatim from the original's init().
function buildPathInstances() {
  const path = new Path()
    .moveTo(-2.5, -2.5)
    .bezierCurveTo(-2.5, -2.5, -2, 0, 0, 0)
    .bezierCurveTo(3, 0, 3, -3.5, 3, -3.5)
    .bezierCurveTo(3, -5.5, 1, -7.7, -2.5, -9.5)
    .bezierCurveTo(-6, -7.7, -8, -5.5, -8, -3.5)
    .bezierCurveTo(-8, -3.5, -8, 0, -5, 0)
    .bezierCurveTo(-3.5, 0, -2.5, -2.5, -2.5, -2.5);

  // Path (and its getPointAt) is a 2D (Vector2) curve API — sample into a scratch
  // Vector2, then carry it into the Vector3 the instance data actually needs.
  const v2 = new Vector2();
  const v = new Vector3();
  const c = new Color();

  const positions: number[] = [];
  const times: number[] = [];
  const seeds: number[] = [];
  const colors: number[] = [];

  for (let i = 0; i < COUNT; i++) {
    const t = i / COUNT;
    path.getPointAt(t, v2);
    v.set(v2.x, v2.y, 0);

    v.x += 0.5 - Math.random();
    v.y += 0.5 - Math.random();
    v.z = 0.5 - Math.random();

    positions.push(v.x, v.y, v.z);
    times.push(t);
    seeds.push(Math.random());

    c.setHSL(0.75 + Math.random() * 0.25, 1, 0.4);
    colors.push(c.r, c.g, c.b);
  }

  return {
    position: new InstancedBufferAttribute(new Float32Array(positions), 3),
    color: new InstancedBufferAttribute(new Float32Array(colors), 3),
    time: new InstancedBufferAttribute(new Float32Array(times), 1),
    seed: new InstancedBufferAttribute(new Float32Array(seeds), 1),
  };
}

// One Mesh drawn COUNT times via `mesh.count` (see header DEMONSTRATES). Instance
// data lives only in raw buffer attributes read back through the TSL graph — nothing
// here is touched again per frame in JS.
function PathInstances() {
  const mesh = useMemo(() => {
    const attributes = buildPathInstances();

    const instancePosition = instancedBufferAttribute<'vec3'>(attributes.position, 'vec3');
    const instanceColor = instancedBufferAttribute<'vec3'>(attributes.color, 'vec3');
    const instanceSeed = instancedBufferAttribute<'float'>(attributes.seed, 'float');
    const instanceTime = instancedBufferAttribute<'float'>(attributes.time, 'float');

    const localTime = instanceTime.add(time);
    const modTime = mod(time.mul(0.4), 1);

    // Bobbing offset, unique per instance via its random seed.
    const bob = sin(localTime.add(instanceSeed)).mul(0.25);

    // Distance (wrapped around the 0/1 seam) from this instance's position on the
    // path to the animated "leader" point — instances near it pulse larger.
    const dist = abs(instanceTime.sub(modTime)).toConst();
    const wrapDist = select(dist.greaterThan(0.5), dist.oneMinus(), dist).toConst();
    const pulse = select(wrapDist.greaterThan(0.1), float(1), wrapDist.remap(0, 0.1, 3, 1));

    const offset = vec3(instancePosition.x, instancePosition.y.add(bob), instancePosition.z).toConst('offset');

    const material = new MeshStandardNodeMaterial();
    material.positionNode = add(positionLocal.mul(pulse), offset);
    material.colorNode = instanceColor;

    const mesh = new Mesh(new IcosahedronGeometry(0.1), material);
    mesh.count = COUNT;
    mesh.frustumCulled = false;

    return mesh;
  }, []);

  useEffect(() => {
    return () => {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardNodeMaterial).dispose();
    };
  }, [mesh]);

  return <primitive object={mesh} position={[2.5, 5, 0]} />;
}

export default function InstancePath() {
  return (
    <Canvas
      // Original sets this explicitly (not the WebGPURenderer default).
      renderer={{ toneMapping: NeutralToneMapping }}
      camera={{ position: [0, 0, 15], fov: 60, near: 0.01, far: 100 }}>
      <SceneBackground />
      <RoomEnv />
      <PathInstances />
      <DemoHelpers grid={false} />
    </Canvas>
  );
}
