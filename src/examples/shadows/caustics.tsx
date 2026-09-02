/**
 * caustics
 * A transmissive duck under a spot light throws coloured, refracted light onto the
 * floor instead of a flat shadow. Switch the model to see a textured pane do it too.
 * Original: https://threejs.org/examples/#webgpu_caustics
 *
 * DEMONSTRATES
 * - `castShadowNode`: a node material decides what colour it writes INTO the shadow
 *   map, so the "shadow" becomes a projection. The duck refracts the view ray against
 *   its IOR, samples a caustic photo with per-channel chromatic aberration, and casts
 *   that; the glass pane just casts its own colour map at 80% alpha
 * - `renderer.shadowMap.transmitted`, the renderer flag that makes non-opaque shadow
 *   maps possible at all — set in a `useLayoutEffect` because the first shadow render
 *   reads it
 * - Two caster materials sharing one spot light, toggled by a leva selector: each one
 *   owns its own texture, uniforms and node graph next to the mesh that uses them
 * - `useUniforms` colour values feeding a TSL graph directly — the material's `color`
 *   prop and the caustic tint come from the same leva swatch, with no sync code
 *
 * DIVERGENCE from original
 * - `castShadowPositionNode` dropped. The original assigns one that returns
 *   `positionLocal` — the default — under a comment saying distortion could be added
 *   there; as written it is a no-op.
 * - The duck renders as its own `<mesh>` built from the loaded geometry rather than by
 *   swapping the material on drei's Suspense-cached GLTF scene, which `volume-caustics`
 *   shares. The duck node carries no transform of its own, so nothing is lost.
 */
import { Suspense, useLayoutEffect, useRef } from 'react';
import { div, Fn, normalView, positionViewDirection, refract, texture, vec2, vec3, vec4 } from 'three/tsl';
import {
  DoubleSide,
  HalfFloatType,
  NoToneMapping,
  RepeatWrapping,
  SRGBColorSpace,
  type Mesh,
  type Node,
  type Texture,
} from 'three/webgpu';
import { Canvas, useFrame, useNodes, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { useGLTF, useTexture } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const DUCK_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/duck.glb';
const CAUSTIC_MAP_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/opengameart/Caustic_Free.jpg';
const COLORS_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/colors.png';
const WOOD_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/hardwood2_diffuse.jpg';

const IOR = 1.5;

//* Caustic shader graph ==========================================

// Refract the view ray through the shell, use the refracted direction as a UV into a
// caustic photo, and fetch each channel at a slightly different offset for a prismatic
// fringe. `viewZ` fades the whole thing out on faces turned away from the viewer.
function createCausticNode(causticMap: Texture, occlusion: Node<'float'>, tint: Node<'color'>) {
  return Fn(() => {
    const refractionVector = refract(positionViewDirection.negate(), normalView, div(1.0, IOR)).normalize();
    const viewZ = normalView.z.pow(occlusion);
    const textureUV = refractionVector.xy.mul(0.6);
    const chromaticAberrationOffset = normalView.z.pow(-0.9).mul(0.004);

    const causticProjection = vec3(
      texture(causticMap, textureUV.add(vec2(chromaticAberrationOffset.negate(), 0))).r,
      texture(causticMap, textureUV.add(vec2(0, chromaticAberrationOffset.negate()))).g,
      texture(causticMap, textureUV.add(vec2(chromaticAberrationOffset, chromaticAberrationOffset))).b,
    );

    return causticProjection.mul(viewZ.mul(25)).add(viewZ).mul(tint);
  })();
}

//* Casters =======================================================

function CausticDuck({ visible }: { visible: boolean }) {
  const { scene } = useGLTF(DUCK_URL, { draco: true });
  const causticMap = useTexture(CAUSTIC_MAP_URL, (map) => {
    map.wrapS = map.wrapT = RepeatWrapping;
    map.colorSpace = SRGBColorSpace;
  });

  const { causticOcclusion, materialColor } = useControls('caustics', {
    causticOcclusion: { value: 20, min: 0, max: 20, step: 0.1 },
    materialColor: '#ffd700',
  });
  const { uOcclusion, uTint } = useUniforms({ uOcclusion: causticOcclusion, uTint: materialColor }, 'caustics');

  const { duckCausticNode } = useNodes(() => ({
    duckCausticNode: createCausticNode(causticMap, uOcclusion, uTint),
  }));

  const duckRef = useRef<Mesh>(null);
  useFrame(() => {
    if (duckRef.current) duckRef.current.rotation.y -= 0.01;
  });

  // The GLB is one untransformed mesh node, so its geometry is all we need.
  const duckGeometry = (scene.children[0] as Mesh).geometry;

  return (
    <mesh ref={duckRef} geometry={duckGeometry} scale={0.5} castShadow visible={visible}>
      <meshPhysicalNodeMaterial
        side={DoubleSide}
        transparent
        color={materialColor}
        transmission={1}
        thickness={0.25}
        ior={IOR}
        metalness={0}
        roughness={0.1}
        castShadowNode={duckCausticNode}
      />
    </mesh>
  );
}

// The simplest possible castShadowNode: the pane's own colour map, cast at 80% alpha.
function CausticGlass({ visible }: { visible: boolean }) {
  const colorMap = useTexture(COLORS_URL, (map) => {
    map.wrapS = map.wrapT = RepeatWrapping;
    map.colorSpace = SRGBColorSpace;
  });

  const { glassShadowNode } = useNodes(() => ({ glassShadowNode: vec4(texture(colorMap).rgb, 0.8) }));

  return (
    <mesh position={[0, 0.1, 0]} castShadow visible={visible}>
      <planeGeometry args={[0.2, 0.2]} />
      <meshPhysicalNodeMaterial
        map={colorMap}
        side={DoubleSide}
        transparent
        transmission={1}
        ior={IOR}
        metalness={0}
        roughness={0.1}
        castShadowNode={glassShadowNode}
      />
    </mesh>
  );
}

//* Scene =========================================================

function CausticsScene() {
  const { model } = useControls('caustics', { model: { value: 'duck', options: ['duck', 'glass'] } });

  // Non-opaque shadow maps: a WebGPU-only renderer flag with no Canvas prop, and the
  // first shadow render reads it — hence layout effect, not effect.
  const renderer = useThree((state) => state.renderer);
  useLayoutEffect(() => {
    renderer.shadowMap.transmitted = true;
  }, [renderer]);

  const woodMap = useTexture(WOOD_URL, (map) => {
    map.wrapS = map.wrapT = RepeatWrapping;
    map.repeat.set(10, 10);
  });

  return (
    <>
      <CausticDuck visible={model === 'duck'} />
      <CausticGlass visible={model === 'glass'} />

      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[2, 2]} />
        <meshStandardNodeMaterial color="#999999" map={woodMap} />
      </mesh>

      {/* HalfFloat shadow map so the caustic projection keeps its HDR range. */}
      <spotLight
        position={[0.2, 0.3, 0.2]}
        intensity={1}
        castShadow
        angle={Math.PI / 6}
        penumbra={1}
        decay={2}
        distance={0}
        shadow-mapType={HalfFloatType}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.1}
        shadow-camera-far={1}
        shadow-intensity={0.95}
      />
    </>
  );
}

export default function Caustics() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      shadows
      background="#000000"
      camera={{ position: [-0.5, 0.35, 0.2], fov: 25, near: 0.025, far: 5 }}>
      {/* One boundary for all four assets: first render waits for the whole set, so
          no material builds its graph against a half-loaded scene. */}
      <Suspense fallback={null}>
        <CausticsScene />
      </Suspense>
      <DemoHelpers grid={false} maxDistance={3} maxPolarAngle={Math.PI / 2} />
    </Canvas>
  );
}
