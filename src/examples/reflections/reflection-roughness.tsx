/**
 * reflection-roughness
 * R3F port of three.js `webgpu_reflection_roughness`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_reflection_roughness (~120 lines of JS)
 *
 * DEMONSTRATES
 * - A `reflector()` planar mirror whose BLUR varies per-pixel: a Perlin noise texture,
 *   animated by scrolling its sample UV with `time`, drives a live roughness value fed
 *   into `textureBicubic(reflection, roughness)` — rougher noise regions blur the
 *   reflection more, all inside one `MeshStandardNodeMaterial.colorNode`
 * - The SAME roughness node reused twice: once (scaled 0.9) as the bicubic blur
 *   strength inside `colorNode`, once (scaled 0.2) as the material's own
 *   `roughnessNode` — a single noise-driven value shading and blurring the floor in
 *   sync, both typed props (no cast) on `MeshStandardNodeMaterial`
 * - `rangeFogFactor(7, 25).oneMinus()` as a distance-falloff OPACITY on the
 *   transparent floor, same fog-as-alpha trick as `reflection-blurred`'s cousin
 * - Classic (non-Node) `scene.background`/`scene.environment` assignment — genuinely
 *   typed `Scene` properties, no B11 cast needed, unlike the `*Node` overrides used
 *   elsewhere in this category
 *
 * DIVERGENCE from original
 * - No leva controls — the original has none either; every value (blur strength,
 *   roughness scale, fog range) is a fixed constant in both versions
 * - `OrbitControls` -> DemoHelpers' CameraControls: target (0, 0.75, 0), dolly limits
 *   1/10, polar limit π/2, `autoRotate` at the original's speed (-0.1) all forwarded
 */
import { Suspense, useLayoutEffect } from 'react';
import { EquirectangularReflectionMapping, NeutralToneMapping, RepeatWrapping, SRGBColorSpace } from 'three/webgpu';
import { Fn, rangeFogFactor, reflector, textureBicubic, time, texture, uv, vec2, vec4 } from 'three/tsl';
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js';
import { Canvas, useLoader, useNodes, useThree } from '@react-three/fiber/webgpu';
import { useTexture } from '@react-three/drei/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const TEXTURE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/';
const HDR_URL = `${TEXTURE_BASE}equirectangular/spruit_sunrise_2k.hdr.jpg`;
const UV_GRID_URL = `${TEXTURE_BASE}uv_grid_directx.jpg`;
const PERLIN_URL = `${TEXTURE_BASE}noises/perlin/rgb-256x256.png`;

// Equirect HDR as both background and IBL environment — classic Scene properties, no
// backgroundNode/environmentNode override needed for this example (see header
// DEMONSTRATES). Layout effect: `.mapping` is read at shader-graph build time.
function HdrEnvironment() {
  const scene = useThree((s) => s.scene);
  const map = useLoader(UltraHDRLoader, HDR_URL);

  useLayoutEffect(() => {
    map.mapping = EquirectangularReflectionMapping;
    scene.background = map;
    scene.environment = map;
    return () => {
      scene.background = null;
      scene.environment = null;
    };
  }, [scene, map]);

  return null;
}

// The original's debug UV box floating above the floor — handy for judging how the
// floor's reflection distorts a high-frequency texture.
function UvBox() {
  const uvMap = useTexture(UV_GRID_URL);

  useLayoutEffect(() => {
    uvMap.colorSpace = SRGBColorSpace;
  }, [uvMap]);

  return (
    <mesh position={[0, 1.25, 0]} scale={2}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardNodeMaterial map={uvMap} roughnessMap={uvMap} emissiveMap={uvMap} emissive="#ffffff" />
    </mesh>
  );
}

// The rough mirror floor: a reflector() blurred by a live, noise-driven roughness
// value, faded to transparent by distance — see header DEMONSTRATES.
function ReflectiveFloor() {
  const perlinMap = useTexture(PERLIN_URL);

  useLayoutEffect(() => {
    perlinMap.wrapS = RepeatWrapping;
    perlinMap.wrapT = RepeatWrapping;
    perlinMap.colorSpace = SRGBColorSpace;
  }, [perlinMap]);

  const { colorNode, roughnessNode, reflectionTarget } = useNodes(() => {
    const reflection = reflector({ resolutionScale: 0.5, bounces: false, generateMipmaps: true });
    reflection.target.rotateX(-Math.PI / 2);

    const animatedUV = uv()
      .mul(10)
      .add(vec2(time.mul(0.1), 0));
    const roughness = texture(perlinMap, animatedUV).r.mul(2).saturate();

    const colorNode = Fn(() => {
      const dirtyReflection = textureBicubic(reflection, roughness.mul(0.9));
      const opacity = rangeFogFactor(7, 25).oneMinus();
      return vec4(dirtyReflection.rgb, opacity);
    })();

    return { colorNode, roughnessNode: roughness.mul(0.2), reflectionTarget: reflection.target };
  });

  return (
    <>
      <mesh>
        <boxGeometry args={[50, 0.001, 50]} />
        <meshStandardNodeMaterial transparent metalness={1} colorNode={colorNode} roughnessNode={roughnessNode} />
      </mesh>
      <primitive object={reflectionTarget} />
    </>
  );
}

export default function ReflectionRoughness() {
  return (
    <Canvas
      renderer={{ toneMapping: NeutralToneMapping, toneMappingExposure: 1.5 }}
      camera={{ position: [-4, 1, 4], fov: 50, near: 0.25, far: 30 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <HdrEnvironment />
        <UvBox />
        <ReflectiveFloor />
      </Suspense>
      <DemoHelpers
        grid={false}
        target={[0, 0.75, 0]}
        minDistance={1}
        maxDistance={10}
        maxPolarAngle={Math.PI / 2}
        autoRotate
        autoRotateSpeed={-0.1}
      />
    </Canvas>
  );
}
