/**
 * display-stereo
 * R3F port of three.js `webgpu_display_stereo`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_display_stereo (~255 lines of JS)
 *
 * DEMONSTRATES
 * - Three self-contained TSL stereo pass factories — `stereoPass`, `anaglyphPass`,
 *   `parallaxBarrierPass` (`three/addons/tsl/display/*PassNode.js`) — swapped in as
 *   `useRenderPipeline`'s `outputNode`. Each pass renders the scene twice (once per
 *   eye camera) and composites internally; no manual scissor/viewport code is needed
 *   here (contrast `textures-anisotropy`'s hand-rolled split-screen render takeover —
 *   that example IS about the scissor mechanism, this one is about the stereo maths)
 * - The pipeline-dynamism split from AGENTS.md, on ONE pipeline: which pass is
 *   `outputNode` is a STRUCTURAL choice — swapping it needs `rebuild()` (a graph
 *   rebuild, same trigger the original's `renderPipeline.needsUpdate = true` used).
 *   `eyeSep`/`algorithm`/`colorMode`/`planeDistance`, by contrast, are plain JS
 *   properties each pass re-reads from its own instance every frame at CPU time
 *   (verified in the pass source — never baked into the shader graph as a Const), so
 *   they're mutated directly on the registered pass instances, no uniform needed
 * - `useRenderPipeline`'s return-to-register pattern: all three passes are built once
 *   in `mainCB` and returned as `{ stereo, anaglyph, parallaxBarrier }`, making them
 *   reachable from the controls effect below via the hook's own `passes`
 * - `InstancedMesh` of 500 env-mapped spheres orbiting in a Lissajous-ish loop, the
 *   scene the stereo effect is actually applied to
 *
 * DIVERGENCE from original
 * - The Inspector GUI (`renderer.inspector.createParameters`) becomes leva controls;
 *   the "Anaglyph Options" folder's show/hide (`paramList.domElement.style.display`)
 *   becomes leva's `render: (get) => …` conditional visibility on the same folder
 * - Per-instance sphere Z and scale are rolled once into plain JS arrays instead of
 *   the original's per-frame `getMatrixAt`/`setMatrixAt` round trip to preserve them
 *   — same result (only X/Y orbit), no matrix read-back needed every frame for 500
 *   instances
 * - `renderer={{ toneMapping: NoToneMapping }}` explicit: the original renders with
 *   the WebGPURenderer default (none)
 */
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { anaglyphPass, AnaglyphAlgorithm, AnaglyphColorMode } from 'three/addons/tsl/display/AnaglyphPassNode.js';
import type AnaglyphPassNode from 'three/addons/tsl/display/AnaglyphPassNode.js';
import { parallaxBarrierPass } from 'three/addons/tsl/display/ParallaxBarrierPassNode.js';
import type ParallaxBarrierPassNode from 'three/addons/tsl/display/ParallaxBarrierPassNode.js';
import { stereoPass } from 'three/addons/tsl/display/StereoPassNode.js';
import type StereoPassNode from 'three/addons/tsl/display/StereoPassNode.js';
import { CubeTextureLoader, NoToneMapping, Object3D } from 'three/webgpu';
import type { CubeTexture, InstancedMesh } from 'three/webgpu';
import { Canvas, useFrame, useLoader, useRenderPipeline } from '@react-three/fiber/webgpu';
import { folder, useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const CUBE_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/cube/Park3Med/';
const CUBE_URLS = ['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'].map((f) => `${CUBE_PATH}${f}`);

const SPHERE_COUNT = 500;

type EffectName = 'stereo' | 'anaglyph' | 'parallaxBarrier';

// One env-mapped, unlit InstancedMesh: 500 spheres orbiting the origin in X/Y, each
// frozen at its own random depth and scale (see DIVERGENCE). Loads its own envMap
// (a fiber hook, so it has to live inside <Canvas> — suspends, gated below).
function OrbitingSpheres() {
  const [envMap] = useLoader(CubeTextureLoader, [CUBE_URLS]) as CubeTexture[];
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  // Rolled once: depth and scale never change after this, only X/Y orbit per frame.
  const { depths, scales } = useMemo(() => {
    const depths: number[] = [];
    const scales: number[] = [];
    for (let i = 0; i < SPHERE_COUNT; i++) {
      depths.push(Math.random() * 10 - 5);
      scales.push(Math.random() * 3 + 1);
    }
    return { depths, scales };
  }, []);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = state.elapsed * 0.1;
    for (let i = 0; i < SPHERE_COUNT; i++) {
      dummy.position.set(5 * Math.cos(t + i), 5 * Math.sin(t + i * 1.1), depths[i]);
      dummy.scale.setScalar(scales[i]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, SPHERE_COUNT]}>
      <sphereGeometry args={[0.1, 32, 16]} />
      <meshBasicNodeMaterial color="#ffffff" envMap={envMap} />
    </instancedMesh>
  );
}

// Owns the render pipeline: builds all three stereo passes once, points outputNode
// at whichever one is selected, and keeps their live JS properties in sync with leva.
function StereoPipeline() {
  const { effect, eyeSep } = useControls('display-stereo', {
    effect: {
      value: 'stereo' as EffectName,
      options: { Stereo: 'stereo', Anaglyph: 'anaglyph', ParallaxBarrier: 'parallaxBarrier' } as Record<
        string,
        EffectName
      >,
    },
    eyeSep: { value: 0.064, min: 0.001, max: 0.15, step: 0.001, label: 'eye separation' },
  });

  const { anaglyphAlgorithm, anaglyphColorMode, planeDistance } = useControls('display-stereo', {
    'Anaglyph Options': folder(
      {
        anaglyphAlgorithm: {
          value: AnaglyphAlgorithm.DUBOIS,
          label: 'algorithm',
          options: {
            True: AnaglyphAlgorithm.TRUE,
            Grey: AnaglyphAlgorithm.GREY,
            Colour: AnaglyphAlgorithm.COLOUR,
            'Half-Colour': AnaglyphAlgorithm.HALF_COLOUR,
            Dubois: AnaglyphAlgorithm.DUBOIS,
            Optimised: AnaglyphAlgorithm.OPTIMISED,
            Compromise: AnaglyphAlgorithm.COMPROMISE,
          },
        },
        anaglyphColorMode: {
          value: AnaglyphColorMode.RED_CYAN,
          label: 'color mode',
          options: {
            'Red / Cyan': AnaglyphColorMode.RED_CYAN,
            'Magenta / Cyan': AnaglyphColorMode.MAGENTA_CYAN,
            'Magenta / Green': AnaglyphColorMode.MAGENTA_GREEN,
          },
        },
        planeDistance: { value: 3, min: 0.5, max: 10, step: 0.1, label: 'plane distance' },
      },
      // Same show/hide as the original's Anaglyph-only dat.gui folder.
      { render: (get) => get('display-stereo.effect') === 'anaglyph' },
    ),
  });

  const { passes, rebuild } = useRenderPipeline(({ renderPipeline, scene, camera }) => {
    const stereo = stereoPass(scene, camera);
    const anaglyph = anaglyphPass(scene, camera);
    const parallaxBarrier = parallaxBarrierPass(scene, camera);

    renderPipeline.outputNode =
      effect === 'anaglyph' ? anaglyph : effect === 'parallaxBarrier' ? parallaxBarrier : stereo;

    return { stereo, anaglyph, parallaxBarrier };
  });

  // Structural: which pass IS the output can't be changed by mutating a value, it
  // needs the graph rebuilt (mirrors the original's `renderPipeline.needsUpdate`).
  useEffect(() => {
    rebuild();
  }, [effect, rebuild]);

  // `PassRecord` types as `Record<string, any>` (fiber); the concrete pass classes
  // are cast back on read, same shape as the untyped-`any` gap documented in
  // AGENTS.md for other loosely-typed fiber return values.
  const stereoPassNode = passes.stereo as StereoPassNode | undefined;
  const anaglyphPassNode = passes.anaglyph as AnaglyphPassNode | undefined;
  const parallaxBarrierPassNode = passes.parallaxBarrier as ParallaxBarrierPassNode | undefined;

  // Plain instance properties, re-read every frame at CPU time by each pass's own
  // `updateBefore()` — mutate directly, exactly like the original's dat.gui
  // `.onChange` handlers. No rebuild, no uniform.
  useEffect(() => {
    if (!stereoPassNode || !anaglyphPassNode || !parallaxBarrierPassNode) return;
    stereoPassNode.stereo.eyeSep = eyeSep;
    anaglyphPassNode.eyeSep = eyeSep;
    parallaxBarrierPassNode.stereo.eyeSep = eyeSep;
  }, [stereoPassNode, anaglyphPassNode, parallaxBarrierPassNode, eyeSep]);

  useEffect(() => {
    if (!anaglyphPassNode) return;
    anaglyphPassNode.algorithm = anaglyphAlgorithm;
    anaglyphPassNode.colorMode = anaglyphColorMode;
    anaglyphPassNode.planeDistance = planeDistance;
  }, [anaglyphPassNode, anaglyphAlgorithm, anaglyphColorMode, planeDistance]);

  return null;
}

export default function DisplayStereo() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background={{ files: CUBE_URLS }}
      camera={{ position: [0, 0, 3], fov: 60, near: 0.1, far: 100 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <OrbitingSpheres />
      </Suspense>
      <StereoPipeline />
      <DemoHelpers grid={false} minDistance={1} maxDistance={25} />
    </Canvas>
  );
}
