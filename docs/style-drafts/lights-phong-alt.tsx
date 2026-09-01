/* ============================================================================
 * NOT CANONICAL — DO NOT USE AS A REFERENCE.
 *
 * A scratch sketch, parked here so it stopped breaking the build. It does NOT
 * typecheck: `useLocalNodes<T extends Record<string, unknown>>` requires its creator
 * to return a NAMED-NODE OBJECT, and this file returns a bare node. It also carries
 * an unresolved inline author critique.
 *
 * The shipped, hand-tuned reference is src/examples/lights/lights-phong.tsx.
 * A restyle agent used this file as a model once; hence this banner.
 * ==========================================================================*/
/**
 * lights-phong
 * R3F port of three.js `webgpu_lights_phong`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_lights_phong (~150 lines of JS)
 *
 * DEMONSTRATES
 * - Selective lighting: `material.lightsNode = lights([someLight])` restricts a
 *   `MeshPhongNodeMaterial`'s shading to a chosen SUBSET of the scene's lights,
 *   independent of what else is in the scene — the left and right teapots each react
 *   to exactly one orbiting `PointLight`, while the center teapot (no `lightsNode`
 *   override) falls back to the builder's default and reacts to all four. A leva
 *   dropdown lets you re-point which light drives the left/right teapot at runtime.
 * - Three independent Phong node overrides on the same node material: a texture-driven
 *   `specularNode` (left teapot), tangent-space `normalNode = normalMap(texture(...))`
 *   (center teapot), and a procedural checkerboard-driven `specularNode =
 *   mix(color, color, checker(uv().mul(n)))` (right teapot) — plus plain `shininess`
 *   (an ordinary numeric property, not a node, inherited from `MeshPhongMaterial`)
 * - Scene-level TSL fog: `scene.fogNode = fog(color(...), rangeFogFactor(near, far))`
 * - `PointLight.power` (physically-based intensity) driving four orbiting lights that
 *   double as their own visible markers — a `mesh` mounted as a real scene-graph child
 *   of the light via `<primitive object={light}><mesh .../></primitive>`, the same
 *   "child inherits the light's transform for free" pattern as `lights-pointlights` /
 *   `lights-rectarealight` / `lights-spotlight`
 *
 * DIVERGENCE from original
 * - Light markers use a plain `meshBasicMaterial` instead of the original's
 *   `MeshPhongNodeMaterial` with `colorNode = color(hex)` and `lights = false` —
 *   functionally identical (an unlit colored sphere), simpler to express
 DS BUT LOSES THE POINT, THIS IS A PHONG DEMO.
 * - leva: fog color/near/far, center/right teapot `shininess`, and a dropdown per
 *   side teapot selecting WHICH of the four orbiting lights drives its `lightsNode`.
 *   The original hardcodes light1→left, light2→right with no UI; the dropdown exists
 *   to make the selective-lighting API's actual flexibility visible and pokeable
 * - `renderer.inspector = new Inspector()` dropped — this repo doesn't wire the
 *   Inspector RootState slot yet (same gap noted in `refraction` / `reflection` /
 *   `postprocessing-bloom-emissive`)
 * - OrbitControls -> this repo's CameraControls (via DemoHelpers), same min/max dolly
 *   distance (3/25) as the original. DemoHelpers grid disabled (`grid={false}`) — the
 *   original scene is a fogged void with no floor; an infinite ground grid would be
 *   pure invention
 * - `scene.fogNode` is set through a cast — `@types/three`'s `Scene` interface doesn't
 *   declare `fogNode` even though the WebGPU renderer's `NodeManager` reads it directly
 *   off the live scene instance (same documented gap as `sprites.tsx`, AGENTS.md B11)
 * - This feels like a mistake. If upstream scenes have fogNode our types should too
 */
import { Suspense, useEffect, useMemo, useRef } from "react";
import {
  Canvas,
  useFrame,
  useLocalNodes,
  useNodes,
  useThree,
  useUniforms,
} from "@react-three/fiber/webgpu";
import { useTexture } from "@react-three/drei/webgpu";
import { folder, useControls } from "leva";
import { TeapotGeometry } from "three/addons/geometries/TeapotGeometry.js";
import {
  checker,
  color,
  fog,
  lights,
  normalMap,
  mix,
  rangeFogFactor,
  texture,
  uv,
} from "three/tsl";
import {
  MeshPhongNodeMaterial,
  PointLight,
  RepeatWrapping,
  SphereGeometry,
} from "three/webgpu";
import type { Mesh, Node } from "three/webgpu";
import { DemoHelpers } from "../utils/DemoHelpers";

const TEXTURE_BASE =
  "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/";

// Shared static assets — constants, not mutable state, so module-scope THREE instances
// are the idiomatic call here (same rationale as lights-pointlights' markerGeometry).
const teapotGeometry = new TeapotGeometry(0.8, 18);
const markerGeometry = new SphereGeometry(0.1, 16, 8);

const LIGHT_DEFS = [
  { key: "light1", hex: 0x0040ff, label: "Blue" },
  { key: "light2", hex: 0xffffff, label: "White" },
  { key: "light3", hex: 0x80ff80, label: "Green" },
  { key: "light4", hex: 0xffaa00, label: "Orange" },
] as const;
type LightKey = (typeof LIGHT_DEFS)[number]["key"];
const LIGHT_OPTIONS = Object.fromEntries(
  LIGHT_DEFS.map(({ key, label }) => [label, key]),
) as Record<string, LightKey>;

// Scene-level TSL fog. Cast: `@types/three`'s `Scene` doesn't declare `fogNode` — see
// header DIVERGENCE.
function SceneFog() {
  const scene = useThree((s) => s.scene);
  const fogNode = useLocalNodes(({ uniforms }) => {
    return fog(
      color(uniforms.fogColor),
      rangeFogFactor(uniforms.fogNear, uniforms.fogFar),
    );
  });
  useEffect(() => {
    scene.fogNode = fogNode as unknown as Node;
  }, [scene, fogNode]);

  return null;
}



function MarkedLight({
  hex,
  power = 1700,
  distance = 100,
  index,
}: {
  hex: number;
  power?: number;
  distance?: number;
  index: number;
}) {
  const ref = useRef<PointLight>(null);

  useFrame((state) => {
    const lightTime = state.elapsed * 0.5;
    const transforms = [
      {
        x: Math.sin(lightTime * 0.7) * 3,
        y: Math.cos(lightTime * 0.5) * 4,
        z: Math.cos(lightTime * 0.3) * 3,
      },
      {
        x: Math.cos(lightTime * 0.3) * 3,
        y: Math.sin(lightTime * 0.5) * 4,
        z: Math.sin(lightTime * 0.7) * 3,
      },
      {
        x: Math.sin(lightTime * 0.7) * 3,
        y: Math.cos(lightTime * 0.3) * 4,
        z: Math.sin(lightTime * 0.5) * 3,
      },
      {
        x: Math.sin(lightTime * 0.3) * 3,
        y: Math.cos(lightTime * 0.7) * 4,
        z: Math.sin(lightTime * 0.5) * 3,
      },
    ];
    const transform = transforms[index];
    ref.current?.position.set(transform.x, transform.y, transform.z);
  });

  return (
    <pointLight power={power} distance={distance} color={hex} ref={ref}>
      <mesh>
        <sphereGeometry args={[0.1, 16, 8]} />
        <meshBasicMaterial color={hex} />
      </mesh>
    </pointLight>
  );
}

// The four orbiting lights (each doubling as its own visible marker) and the three
// Phong teapots they illuminate — see header DEMONSTRATES.
function Teapots({
  leftLightKey,
  rightLightKey,
  centerShininess,
  rightShininess,
}: TeapotsProps) {
  const teapotLeft = useMemo(() => {
    const material = new MeshPhongNodeMaterial({ color: 0x555555 });
    material.lightsNode = lights([leftLight]);
    material.specularNode = texture(roughness);
    return material;
  }, [leftLight, roughness]);

  const teapotCenter = useMemo(() => {
    const material = new MeshPhongNodeMaterial({ color: 0x555555 });
    material.normalNode = normalMap(texture(waterNormal));
    material.shininess = centerShininess;
    return material;
  }, [waterNormal, centerShininess]);

  const teapotRight = useMemo(() => {
    const material = new MeshPhongNodeMaterial({ color: 0x555555 });
    material.lightsNode = lights([rightLight]);
    material.specularNode = mix(
      color(0x0000ff),
      color(0xff0000),
      checker(uv().mul(5)),
    );
    material.shininess = rightShininess;
    return material;
  }, [rightLight, rightShininess]);

  return (
    <>
      <mesh
        geometry={teapotGeometry}
        material={teapotLeft}
        position={[-3, -1, 0]}
      />
      <mesh
        geometry={teapotGeometry}
        material={teapotCenter}
        rotation-y={-Math.PI * 0.5}
        position={[0, -1, 0]}
      />
      <mesh
        geometry={teapotGeometry}
        material={teapotRight}
        rotation-y={-Math.PI * 0.5}
        position={[3, -1, 0]}
      />
      <Teapot shininess={80} specular={0x0000ff} lightsNode={lights([leftLight])} position={[-3, -1, 0]} />
      <Teapot shininess={80} specular={0x0000ff}   />
      <Teapot shininess={80} specular={0x0000ff} lightsNode={lights([rightLight])}  position={[-3, -1, 0]} />
    </>
  );
}

//* Single Teapot
type TeapotProps = {
  color: number;
  shininess: number;
  specular: number;
  lightsNode: Node<"lights">;
  ref: React.RefObject<Mesh>;
  position?: [number, number, number];
};
function Teapot({
  color = 0x555555,
  shininess,
  specular,
  lightsNode,
  ref,
  position,
}: TeapotProps) {
  return (
    <mesh
      ref={ref}
      geometry={teapotGeometry}
      rotation-y={-Math.PI * 0.5}
      position={position || [-3, -1, 0]}
    >
      <meshPhongNodeMaterial
        color={color}
        shininess={shininess}
        specular={specular}
        lightsNode={lightsNode}
      />
    </mesh>
  );
}

export default function LightsPhong() {
    const { fogColor, fogNear, fogFar, leftLightKey, rightLightKey, centerShininess, rightShininess } = useControls(
        'lights-phong',
        {
          fog: folder({
            fogColor: { value: '#ff00ff', label: 'color' },
            fogNear: { value: 12, min: 1, max: 25, step: 0.5, label: 'near' },
            fogFar: { value: 30, min: 15, max: 60, step: 0.5, label: 'far' },
          }),
          leftTeapot: folder({
            leftLightKey: { value: 'light1' as LightKey, options: LIGHT_OPTIONS, label: 'lit by' },
          }),
          centerTeapot: folder({
            centerShininess: { value: 80, min: 1, max: 200, step: 1, label: 'shininess' },
          }),
          rightTeapot: folder({
            rightLightKey: { value: 'light2' as LightKey, options: LIGHT_OPTIONS, label: 'lit by' },
            rightShininess: { value: 90, min: 1, max: 200, step: 1, label: 'shininess' },
          }),
        },
      )
  // casts all controls to uniforms
  useUniforms(levaUniforms);

  const { waterNormal, roughness } = useTexture({
    waterNormal: `${TEXTURE_BASE}water/Water_1_M_Normal.jpg`,
    roughness: `${TEXTURE_BASE}roughness_map.jpg`,
  });

  const matNodes = useNodes(({ uniforms }) => {
    return {
      rightSpecular: mix(
        color(0x0000ff),
        color(0xff0000),
        checker(uv().mul(5)),
      ),
      shininess: uniforms.shininess,
      specular: uniforms.specular,
    };
  });

  return (
    <Canvas
      renderer
      background="#000000"
      camera={{ position: [0, 0, 7], fov: 50, near: 0.01, far: 100 }}
    >
      <SceneFog />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
      {LIGHT_DEFS.map(({ key, hex }, index) => (
        <MarkedLight key={key} hex={hex} index={index} />
      ))}
      </Suspense>
      <DemoHelpers grid={false} minDistance={3} maxDistance={25} />
    </Canvas>
  );
}
