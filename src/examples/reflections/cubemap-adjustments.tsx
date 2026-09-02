/**
 * cubemap-adjustments
 * R3F port of three.js `webgpu_cubemap_adjustments`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_cubemap_adjustments (~150 lines of JS)
 *
 * DEMONSTRATES
 * - One node-builder function (`buildEnvironment`) called TWICE with different
 *   `reflectNode`/`positionNode` pairs — `reflectVector`/`positionWorld` for
 *   `scene.environmentNode` (the IBL lighting), `positionWorldDirection`/`positionLocal`
 *   for `scene.backgroundNode` (the visible sky) — so lighting and sky share one
 *   mix/procedural/hue/saturation graph but sample it from different directions
 * - Two equirect HDRs blended with `mix(pmremTexture(a), pmremTexture(b), factor)`,
 *   each rotated independently by a live `uniform(Matrix4)` — `.makeRotationY()`
 *   mutates the SAME matrix instance the uniform wraps, zero sync code (the
 *   `uniform(object)` live-wrapper rule, matrix flavor)
 * - TSL `reference(name, type, object)` reading five adjustment scalars (mix,
 *   procedural, intensity, hue, saturation) straight off a plain mutable object every
 *   frame — the non-uniform alternative to `useUniforms` for values a shader graph
 *   only needs to read, not react to structurally
 * - The background gets its OWN independent PMREM blur level via
 *   `.context({ getTextureLevel: () => uBlurBackground })` — the sky can blur without
 *   touching the sharp reflection map the two debug spheres light from
 * - Classic (non-Node) `MeshStandardMaterial` spheres still pick up `environmentNode`/
 *   `backgroundNode` through the render pipeline — scene-level node overrides apply
 *   regardless of which material class reads them
 *
 * DIVERGENCE from original
 * - Inspector GUI -> leva, same 8 controls/ranges: `mix` (-1..2), `blurBackground`
 *   (0..1), `offsetHDR1`/`offsetHDR2` (0..2π, HDR rotation), `procedural` (0..1),
 *   `intensity` (0..5), `hue` (0..2π), `saturation` (0..2)
 * - DemoHelpers' CameraControls replaces `OrbitControls`; dolly limits (2/10) forwarded.
 *   Grid disabled — the HDR skybox fills the frame, same as `pmrem-equirectangular`
 */
import { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { EquirectangularReflectionMapping, LinearMipmapLinearFilter, LinearToneMapping, Matrix4 } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  hue,
  mix,
  normalWorld,
  pmremTexture,
  positionLocal,
  positionWorld,
  positionWorldDirection,
  reference,
  reflectVector,
  saturation,
  uniform,
} from 'three/tsl';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Canvas, useLoader, useNodes, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { useGLTF } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const TEXTURE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/';
const HDR1_URL = `${TEXTURE_BASE}pedestrian_overpass_1k.hdr`;
const HDR2_URL = `${TEXTURE_BASE}752-hdri-skies-com_1k.hdr`;
const HELMET_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf';

// Adjustable float scalars the shader graph reads live via `reference()` — a plain
// mutable object, not five separate `uniform()`s (see header DEMONSTRATES).
interface Adjustments {
  mix: number;
  procedural: number;
  intensity: number;
  hue: number;
  saturation: number;
}

// Builds and wires the two-HDR environment/background graph, then hands the results
// to the scene. Owns every leva control that feeds it — see header DEMONSTRATES.
function EnvironmentAdjustments() {
  const {
    mix: mixAmount,
    blurBackground,
    offsetHDR1,
    offsetHDR2,
    procedural,
    intensity,
    hue: hueAmount,
    saturation: saturationAmount,
  } = useControls('cubemap-adjustments', {
    mix: { value: 0, min: -1, max: 2, step: 0.01 },
    blurBackground: { value: 0, min: 0, max: 1, step: 0.01 },
    offsetHDR1: { value: 0, min: 0, max: Math.PI * 2, step: 0.01 },
    offsetHDR2: { value: 0, min: 0, max: Math.PI * 2, step: 0.01 },
    procedural: { value: 0, min: 0, max: 1, step: 0.01 },
    intensity: { value: 1, min: 0, max: 5, step: 0.01 },
    hue: { value: 0, min: 0, max: Math.PI * 2, step: 0.01 },
    saturation: { value: 1, min: 0, max: 2, step: 0.01 },
  });

  const scene = useThree((s) => s.scene);

  // Identity-stable non-node instances (house rule): a Matrix4 mutated in place by
  // `uniform()`'s live-wrapper, and the reference()-backed adjustments object.
  const [rotateY1Matrix] = useState(() => new Matrix4());
  const [rotateY2Matrix] = useState(() => new Matrix4());
  const [adjustments] = useState<Adjustments>(() => ({
    mix: 0,
    procedural: 0,
    intensity: 1,
    hue: 0,
    saturation: 1,
  }));

  const [hdr1Texture, hdr2Texture] = useLoader(HDRLoader, [HDR1_URL, HDR2_URL]);

  // Mapping/mipmaps are read at PMREM build time — must land before the graph below
  // first builds (AGENTS.md imperative-setup rule).
  useLayoutEffect(() => {
    for (const map of [hdr1Texture, hdr2Texture]) {
      map.mapping = EquirectangularReflectionMapping;
      map.generateMipmaps = true;
      map.minFilter = LinearMipmapLinearFilter;
    }
  }, [hdr1Texture, hdr2Texture]);

  const { uBlurBackground } = useUniforms({ uBlurBackground: blurBackground });

  const { environmentNode, backgroundNode } = useNodes(() => {
    const rotateY1 = uniform(rotateY1Matrix);
    const rotateY2 = uniform(rotateY2Matrix);

    const mixNode = reference('mix', 'float', adjustments);
    const proceduralNode = reference('procedural', 'float', adjustments);
    const intensityNode = reference('intensity', 'float', adjustments);
    const hueNode = reference('hue', 'float', adjustments);
    const saturationNode = reference('saturation', 'float', adjustments);

    const buildEnvironment = (reflectNode: Node<'vec3'>, positionNode: Node<'vec3'>) => {
      const custom1UV = reflectNode.xyz.mul(rotateY1);
      const custom2UV = reflectNode.xyz.mul(rotateY2);
      const mixCubeMaps = mix(
        pmremTexture(hdr1Texture, custom1UV),
        pmremTexture(hdr2Texture, custom2UV),
        positionNode.y.add(mixNode).clamp(),
      );

      const proceduralEnv = mix(mixCubeMaps, normalWorld, proceduralNode);
      const intensityFilter = proceduralEnv.mul(intensityNode);
      const hueFilter = hue(intensityFilter, hueNode);
      return saturation(hueFilter, saturationNode);
    };

    return {
      environmentNode: buildEnvironment(reflectVector, positionWorld),
      backgroundNode: buildEnvironment(positionWorldDirection, positionLocal).context({
        getTextureLevel: () => uBlurBackground,
      }),
    };
  });

  // Cast: `@types/three`'s `Scene` doesn't declare `environmentNode`/`backgroundNode`
  // even though the WebGPU renderer reads both off the live scene (duck-typed *Node
  // gap, UPSTREAM B11 — same cast as `pmrem-equirectangular`).
  useLayoutEffect(() => {
    const withNodes = scene as unknown as { environmentNode: Node | null; backgroundNode: Node | null };
    withNodes.environmentNode = environmentNode;
    withNodes.backgroundNode = backgroundNode;
    return () => {
      withNodes.environmentNode = null;
      withNodes.backgroundNode = null;
    };
  }, [scene, environmentNode, backgroundNode]);

  useEffect(() => {
    adjustments.mix = mixAmount;
    adjustments.procedural = procedural;
    adjustments.intensity = intensity;
    adjustments.hue = hueAmount;
    adjustments.saturation = saturationAmount;
  }, [adjustments, mixAmount, procedural, intensity, hueAmount, saturationAmount]);

  useEffect(() => {
    rotateY1Matrix.makeRotationY(offsetHDR1);
  }, [rotateY1Matrix, offsetHDR1]);

  useEffect(() => {
    rotateY2Matrix.makeRotationY(offsetHDR2);
  }, [rotateY2Matrix, offsetHDR2]);

  return null;
}

function Helmet() {
  const { scene } = useGLTF(HELMET_URL);
  return <primitive object={scene} />;
}

// Two debug spheres reading the environment graph above through plain (non-Node)
// materials — one full metal/no-roughness mirror, one full metal/full-roughness matte.
function DebugSpheres() {
  return (
    <>
      <mesh position={[2, 0, 0]}>
        <sphereGeometry args={[0.5, 64, 32]} />
        <meshStandardMaterial roughness={0} metalness={1} />
      </mesh>
      <mesh position={[-2, 0, 0]}>
        <sphereGeometry args={[0.5, 64, 32]} />
        <meshStandardMaterial roughness={1} metalness={1} />
      </mesh>
    </>
  );
}

export default function CubemapAdjustments() {
  return (
    // Original sets LinearToneMapping explicitly — mirrored deliberately (parity rule).
    <Canvas
      renderer={{ toneMapping: LinearToneMapping }}
      camera={{ position: [-3.6, 1.2, 5.4], fov: 45, near: 0.25, far: 20 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <EnvironmentAdjustments />
        <Helmet />
      </Suspense>
      <DebugSpheres />
      <DemoHelpers grid={false} minDistance={2} maxDistance={10} />
    </Canvas>
  );
}
