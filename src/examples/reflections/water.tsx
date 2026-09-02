/**
 * water
 * A pool of flowing water: two scrolling normal maps drive a planar reflection and a
 * refraction of everything behind the surface, under a moonless-night HDR.
 * Original: https://threejs.org/examples/#webgpu_water
 *
 * DEMONSTRATES
 * - `WaterMesh` (three's Water2Mesh addon) as a first-class JSX element — registered
 *   once in `src/assets/WaterMesh.ts` and typed in `src/types/r3f.d.ts`, so the water
 *   is `<waterMesh args={[geometry, options]} />` rather than an imperative `add()`
 * - The mutate-in-place half of AGENTS.md's post-processing dynamism rules, applied to
 *   a material: `WaterNode` builds its whole graph in the CONSTRUCTOR, closing over
 *   `this.color`/`this.scale`/`this.flowDirection` — so leva writes `.value` on those
 *   uniform nodes; replacing the fields would silently do nothing
 * - An MRT render pipeline: the scene pass writes `output` + `emissive`, bloom reads
 *   only the emissive target, and the sum goes through `renderOutput()` before FXAA,
 *   which needs its input already tone-mapped (`outputColorTransform = false`)
 * - Loading order that keeps a custom-node material lit: the HDR resolves through
 *   `useLoader` INSIDE the scene component and lands in a `useLayoutEffect`, so the
 *   water's first shader build already sees `scene.environment`
 *
 * DIVERGENCE from original
 * - The flow direction is normalised as a pair. The original's GUI normalises after
 *   each slider individually, which makes the resulting vector depend on which one you
 *   moved last.
 */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js';
import type { WaterNode } from 'three/addons/objects/Water2Mesh.js';
import { mrt, output, emissive, renderOutput } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import {
  ACESFilmicToneMapping,
  DoubleSide,
  EquirectangularReflectionMapping,
  PlaneGeometry,
  RepeatWrapping,
  Vector2,
} from 'three/webgpu';
import { Canvas, useLoader, useRenderPipeline, useThree } from '@react-three/fiber/webgpu';
import { useGLTF, useTexture } from '@react-three/drei/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../utils/DemoHelpers';
import { WaterMesh } from '../../assets/WaterMesh';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples';
const HDR_URL = `${ASSETS}/textures/equirectangular/moonless_golf_2k.hdr.jpg`;
const POOL_URL = `${ASSETS}/models/gltf/pool.glb`;
const NORMAL_MAP_0_URL = `${ASSETS}/textures/water/Water_1_M_Normal.jpg`;
const NORMAL_MAP_1_URL = `${ASSETS}/textures/water/Water_2_M_Normal.jpg`;

// The four slabs of ground around the pool: [position, scale].
const FLOORS: [[number, number, number], [number, number, number]][] = [
  [
    [20, 0, 0],
    [15, 1, 80],
  ],
  [
    [-20, 0, 0],
    [15, 1, 80],
  ],
  [
    [0, 0, 30],
    [30, 1, 20],
  ],
  [
    [0, 0, -30],
    [30, 1, 20],
  ],
];

//* Water surface ==================================================

function WaterSurface() {
  // The knobs the original's Water panel carries, next to the thing they drive.
  const { color, scale, flowX, flowY } = useControls('water', {
    color: '#99e0ff',
    scale: { value: 2, min: 1, max: 10, step: 0.1 },
    flowX: { value: 1, min: -1, max: 1, step: 0.01 },
    flowY: { value: 1, min: -1, max: 1, step: 0.01 },
  });

  const [normalMap0, normalMap1] = useTexture([NORMAL_MAP_0_URL, NORMAL_MAP_1_URL], (maps) => {
    for (const map of maps) {
      map.wrapS = RepeatWrapping;
      map.wrapT = RepeatWrapping;
    }
  });

  // Constructor options, so they can only set the INITIAL state — everything the panel
  // touches afterwards goes through the uniform nodes below.
  const waterOptions = useMemo(
    () => ({ color, scale, flowDirection: new Vector2(flowX, flowY), normalMap0, normalMap1 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial values only; live updates go through the uniforms
    [normalMap0, normalMap1],
  );
  const waterGeometry = useMemo(() => new PlaneGeometry(30, 40), []);

  const waterRef = useRef<WaterMesh>(null);
  useEffect(() => {
    if (!waterRef.current) return;
    // Cast: `material.colorNode` is declared as a plain Node. WaterMesh always puts a
    // WaterNode there, and @types/three exports the type for exactly this (B11 family).
    const waterNode = waterRef.current.material.colorNode as WaterNode;
    waterNode.color.value.set(color);
    waterNode.scale.value = scale;
    waterNode.flowDirection.value.set(flowX, flowY).normalize();
  }, [color, scale, flowX, flowY]);

  return (
    <waterMesh
      ref={waterRef}
      args={[waterGeometry, waterOptions]}
      position={[0, 0.2, -2]}
      rotation-x={-Math.PI * 0.5}
      // Drawn last: it samples the viewport for its refraction, so everything it
      // refracts has to already be in the frame.
      renderOrder={Infinity}
    />
  );
}

//* Scene ==========================================================

function Pool() {
  const scene = useThree((state) => state.scene);
  const { scene: poolScene } = useGLTF(POOL_URL, { draco: true });
  const hdrTexture = useLoader(UltraHDRLoader, HDR_URL);

  useLayoutEffect(() => {
    hdrTexture.mapping = EquirectangularReflectionMapping;
    scene.background = hdrTexture;
    scene.environment = hdrTexture;
    return () => {
      scene.background = null;
      scene.environment = null;
    };
  }, [scene, hdrTexture]);

  const floorGeometry = useMemo(() => {
    // Baked rotation, so each slab's scale stays in world axes.
    const geometry = new PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI * 0.5);
    return geometry;
  }, []);

  return (
    <>
      <primitive object={poolScene} position={[0, 0, 2]} scale={0.1} />

      {FLOORS.map(([position, scale]) => (
        <mesh key={position.join()} geometry={floorGeometry} position={position} scale={scale}>
          <meshStandardMaterial color="#444444" roughness={1} metalness={0} side={DoubleSide} />
        </mesh>
      ))}

      <WaterSurface />
    </>
  );
}

//* Post-processing ================================================

function WaterPipeline() {
  useRenderPipeline(
    ({ renderPipeline, passes }) => {
      const beautyPass = passes.scenePass.getTextureNode();
      const emissivePass = passes.scenePass.getTextureNode('emissive');

      // Bloom sees ONLY the emissive target, so the glow comes from the pool lights
      // rather than from anything merely bright.
      const bloomPass = bloom(emissivePass, 2);

      // FXAA wants sRGB input, so the pipeline's automatic transform is off and
      // renderOutput() runs before it (postprocessing-fxaa's contract).
      renderPipeline.outputColorTransform = false;
      renderPipeline.outputNode = fxaa(renderOutput(beautyPass.add(bloomPass)));
    },
    ({ passes }) => {
      passes.scenePass.setMRT(mrt({ output, emissive }));
    },
  );

  return null;
}

export default function Water() {
  return (
    <Canvas
      // Tone mapping matches the original's renderer setup exactly (parity rule).
      renderer={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 0.5 }}
      camera={{ position: [-20, 6, -30], fov: 45, near: 0.1, far: 200 }}>
      {/* Pipeline first: it is a creator hook, and mounting it after the suspending
          scene below is the B18 hazard (AGENTS.md § House style 1). */}
      <WaterPipeline />

      <Suspense fallback={null}>
        <Pool />
      </Suspense>

      {/* Grid off: the pool sits on its own ground slabs at y=0. */}
      <DemoHelpers grid={false} target={[0, 0, -5]} />
    </Canvas>
  );
}
