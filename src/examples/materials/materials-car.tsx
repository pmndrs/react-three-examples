/**
 * materials-car
 * The classic car configurator: a Draco-compressed Ferrari under a Venice-sunset HDR,
 * with live colour pickers for the body, the details (rims + trim) and the glass.
 * Original: https://threejs.org/examples/#webgl_materials_car
 *
 * DEMONSTRATES
 * - Re-skinning NAMED nodes of a loaded glTF declaratively: fiber's function-form
 *   `attach` receives the parent object and the material, so a JSX
 *   `<meshPhysicalNodeMaterial attach={onto('body')}>` swaps itself onto the right
 *   meshes and restores the originals on unmount — no traverse, no effect, and leva
 *   colours bind straight to the `color` prop
 * - One material shared by five meshes (rims + trim) as ONE JSX element, because the
 *   attach function hands the same instance to every target
 * - `useGLTF(url, { draco: true })` + drei `<Environment>` IBL, tone-mapped with
 *   ACESFilmic at 0.85 exposure via the `renderer` prop, and a plain `<fog>` that the
 *   WebGPU renderer auto-wraps into a fog node
 * - A baked AO "shadow catcher" plane: `MultiplyBlending`, `premultipliedAlpha`,
 *   `toneMapped={false}` — parented to the car so it rides with it
 * - The original's scrolling `GridHelper` is the demo's road, so DemoHelpers' grid is
 *   off and the helper's own `position.z` is driven from `useFrame`
 */
import { Suspense, useRef } from 'react';
import { ACESFilmicToneMapping, MathUtils, MultiplyBlending } from 'three/webgpu';
import type { GridHelper, Material, Mesh, Object3D } from 'three/webgpu';
import { Canvas, useFrame } from '@react-three/fiber/webgpu';
import { Environment, useGLTF, useTexture } from '@react-three/drei/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../utils/DemoHelpers';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples';
const CAR_URL = `${ASSETS}/models/gltf/ferrari.glb`;
const SHADOW_URL = `${ASSETS}/models/gltf/ferrari_ao.png`;
const HDR_URL = `${ASSETS}/textures/equirectangular/venice_sunset_1k.hdr`;

// Function-form attach: put this material on every named mesh under the parent, and
// hand back the cleanup that restores what was there (symmetric under StrictMode).
const onto =
  (...names: string[]) =>
  (parent: Object3D, material: Material) => {
    const targets = names.map((name) => parent.getObjectByName(name) as Mesh);
    const previous = targets.map((mesh) => mesh.material);
    targets.forEach((mesh) => (mesh.material = material));
    return () => targets.forEach((mesh, i) => (mesh.material = previous[i]));
  };

//* Scene =========================================================

function Car() {
  const { body, details, glass } = useControls('Car paint', {
    body: '#ff0000',
    details: '#ffffff',
    glass: '#ffffff',
  });
  const { scene, nodes } = useGLTF(CAR_URL, { draco: true });
  const shadow = useTexture(SHADOW_URL);
  const wheels = [nodes.wheel_fl, nodes.wheel_fr, nodes.wheel_rl, nodes.wheel_rr];

  useFrame(({ elapsed }) => {
    for (const wheel of wheels) wheel.rotation.x = -elapsed * Math.PI * 2;
  });

  return (
    <primitive object={scene.children[0]}>
      <meshPhysicalNodeMaterial
        attach={onto('body')}
        color={body}
        metalness={1}
        roughness={0.5}
        clearcoat={1}
        clearcoatRoughness={0.03}
      />
      <meshStandardNodeMaterial
        attach={onto('rim_fl', 'rim_fr', 'rim_rr', 'rim_rl', 'trim')}
        color={details}
        metalness={1}
        roughness={0.5}
      />
      <meshPhysicalNodeMaterial attach={onto('glass')} color={glass} metalness={0.25} roughness={0} transmission={1} />

      {/* Baked AO under the car, multiplied over whatever is beneath it. */}
      <mesh rotation-x={-Math.PI / 2} renderOrder={2}>
        <planeGeometry args={[0.655 * 4, 1.3 * 4]} />
        <meshBasicNodeMaterial
          map={shadow}
          blending={MultiplyBlending}
          toneMapped={false}
          transparent
          premultipliedAlpha
        />
      </mesh>
    </primitive>
  );
}

// The road: a translucent GridHelper scrolling one cell per second.
function Road() {
  const gridRef = useRef<GridHelper>(null);
  useFrame(({ elapsed }) => {
    gridRef.current!.position.z = elapsed % 1;
  });
  return (
    <gridHelper
      ref={gridRef}
      args={[20, 40, '#ffffff', '#ffffff']}
      material-opacity={0.2}
      material-depthWrite={false}
      material-transparent
    />
  );
}

export default function MaterialsCar() {
  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 0.85 }}
      background="#333333"
      camera={{ position: [4.25, 1.4, -4.5], fov: 40, near: 0.1, far: 100 }}>
      <fog attach="fog" args={['#333333', 10, 15]} />
      <Road />
      {/* Environment and car share one boundary so the IBL exists before the
          physical materials build their graphs (B15). */}
      <Suspense fallback={null}>
        <Environment files={HDR_URL} />
        <Car />
      </Suspense>
      <DemoHelpers grid={false} target={[0, 0.5, 0]} maxDistance={9} maxPolarAngle={MathUtils.degToRad(90)} />
    </Canvas>
  );
}
