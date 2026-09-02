/**
 * lights-custom
 * A hand-rolled, unlit lighting model: three colored point lights add their color
 * straight into the diffuse term (no falloff, no Lambert cosine) over a
 * half-million-point cloud.
 * Original: https://threejs.org/examples/#webgpu_lights_custom
 *
 * DEMONSTRATES
 * - `class CustomLightingModel extends LightingModel`, overriding only `direct()` —
 *   the minimal hook TSL exposes into the per-light accumulation loop
 * - `lightsNode.context({ lightingModel })`: swapping the accumulation math for one
 *   material without touching its other TSL nodes
 * - Each light's own marker mesh takes `lightsNode={lights()}` (no args) — an empty
 *   `LightsNode` that ignores every scene light, so the marker is never re-lit by the
 *   very lights it represents
 * - A 500,000-point `PointsNodeMaterial` cloud lit entirely through the custom model
 *
 * DIVERGENCE from original
 * - OrbitControls -> this repo's CameraControls, same min/maxDistance
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { color, context, lights } from 'three/tsl';
import { BufferGeometry, Float32BufferAttribute, LightingModel, NoToneMapping } from 'three/webgpu';
import type { LightingModelDirectInput, Node, PointLight } from 'three/webgpu';

import { Canvas, useFrame, useNodes } from '@react-three/fiber/webgpu';

import { DemoHelpers } from '../../utils/DemoHelpers';

const POINT_COUNT = 500_000;
const ORBIT_SCALE = 0.5;

// The whole demo in one method: add the light's color to the diffuse term directly,
// skipping the Lambert cosine / falloff every built-in lighting model applies.
// A plain module-scope instance is fine — it carries no per-material state (same
// idiom as lights-rectarealight's one-time `RectAreaLightNode.setLTC` registration).
class CustomLightingModel extends LightingModel {
  override direct({ lightColor, reflectedLight }: LightingModelDirectInput) {
    // `LightingModelReflectedLight` fields are typed as bare `Node` — narrowing to
    // `Node<'vec3'>` recovers `.addAssign()` (untyped `Node`'s math-chain extensions
    // don't resolve; same typed-TSL gap class as AGENTS.md's known casts).
    (reflectedLight.directDiffuse as Node<'vec3'>).addAssign(lightColor as Node<'vec3'>);
  }
}
const customLightingModel = new CustomLightingModel();

//* Lights ========================================================

type Orbit = readonly ({ s: number } | { c: number })[];

interface OrbitLightProps {
  color: string;
  orbit: Orbit;
  ref: React.RefObject<PointLight | null>;
  /** Shared empty `LightsNode` so the marker sphere ignores every scene light. */
  markerLightsNode: ReturnType<typeof lights>;
}

// One orbiting point light carrying its own unlit marker sphere — see header
// DEMONSTRATES for the `lightsNode={lights()}` trick that keeps the marker dark.
function OrbitLight({ color: hexColor, orbit, ref, markerLightsNode }: OrbitLightProps) {
  useFrame(({ elapsed }) => {
    const position = orbit.map((a) => ('s' in a ? Math.sin(elapsed * a.s) : Math.cos(elapsed * a.c)));
    ref.current?.position.set(position[0] * ORBIT_SCALE, position[1] * ORBIT_SCALE, position[2] * ORBIT_SCALE);
  });

  return (
    <pointLight ref={ref} color={hexColor} intensity={0.1} distance={1}>
      <mesh>
        <sphereGeometry args={[0.02, 16, 8]} />
        <nodeMaterial colorNode={color(hexColor)} lightsNode={markerLightsNode} />
      </mesh>
    </pointLight>
  );
}

//* Point cloud ====================================================

// 500,000 random points in a 3-unit cube, lit ENTIRELY by the three orbiting lights
// through the custom lighting model above.
function PointCloud({ lightsNode }: { lightsNode: ReturnType<typeof lights> }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(POINT_COUNT * 3);
    for (let i = 0; i < positions.length; i++) positions[i] = (Math.random() - 0.5) * 3;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    return geo;
  }, []);

  // The lighting-context node is a distinct TSL graph from the raw LightsNode above,
  // so it's built once here (create-once via useNodes) rather than reassigned on the
  // material — the material reads `lightsNode` only at first shader build.
  const { pointsLightsNode } = useNodes(
    () => ({ pointsLightsNode: context(lightsNode, { lightingModel: customLightingModel }) }),
    'lights-custom',
  );

  return (
    <points geometry={geometry}>
      <pointsNodeMaterial lightsNode={pointsLightsNode} />
    </points>
  );
}

//* Scene ==========================================================

function Experience() {
  const light1Ref = useRef<PointLight>(null);
  const light2Ref = useRef<PointLight>(null);
  const light3Ref = useRef<PointLight>(null);

  // Empty LightsNode shared by all three marker spheres (see header DEMONSTRATES).
  const { markerLightsNode } = useNodes(() => ({ markerLightsNode: lights() }));

  // Selective lights node feeding the point cloud, filled once the three light refs
  // resolve (LightsNode holds its array by reference and reads it at first shader
  // build — same deferred-population pattern as lights-phong/lights-selective).
  const cloudLightsNode = useMemo(() => lights([]), []);
  useLayoutEffect(() => {
    const [l1, l2, l3] = [light1Ref.current, light2Ref.current, light3Ref.current];
    if (l1 && l2 && l3) cloudLightsNode.setLights([l1, l2, l3]);
  }, [cloudLightsNode]);

  return (
    <>
      <OrbitLight
        ref={light1Ref}
        color="#ffaa00"
        orbit={[{ s: 0.7 }, { c: 0.5 }, { c: 0.3 }]}
        markerLightsNode={markerLightsNode}
      />
      <OrbitLight
        ref={light2Ref}
        color="#0040ff"
        orbit={[{ c: 0.3 }, { s: 0.5 }, { s: 0.7 }]}
        markerLightsNode={markerLightsNode}
      />
      <OrbitLight
        ref={light3Ref}
        color="#80ff80"
        orbit={[{ s: 0.7 }, { c: 0.3 }, { s: 0.5 }]}
        markerLightsNode={markerLightsNode}
      />
      <PointCloud lightsNode={cloudLightsNode} />
    </>
  );
}

export default function LightsCustom() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 0, 1.5], fov: 70, near: 0.1, far: 10 }}>
      <Experience />
      <DemoHelpers grid={false} minDistance={0} maxDistance={4} />
    </Canvas>
  );
}
