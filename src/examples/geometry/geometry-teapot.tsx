/**
 * geometry-teapot
 * The Utah teapot, rebuilt live from the panel: tessellation level, which parts to draw,
 * and six shadings from wireframe to a Pisa cube-map reflection.
 * Original: https://threejs.org/examples/#webgl_geometry_teapot
 *
 * DEMONSTRATES
 * - `<teapotGeometry args={[…]}>`: every knob is a constructor argument, so changing one
 *   simply remounts the geometry — the original's dirty-flag comparison in `render()` and
 *   its dispose / remove / re-add cycle disappear
 * - Shading as a lookup from a name to a keyed JSX material element; re-rendering swaps
 *   the mesh's material
 * - `useCubeTexture` + `useTexture` (drei `/webgpu`) for the reflection and UV-grid maps,
 *   with `scene.background` following the reflective mode so the skybox shows only then
 */
import { Suspense, useLayoutEffect } from 'react';
import { Color, DoubleSide, NoToneMapping, RepeatWrapping, SRGBColorSpace } from 'three/webgpu';
import { Canvas, useThree } from '@react-three/fiber/webgpu';
import { useCubeTexture, useTexture } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import '../../assets/TeapotGeometry';
import { DemoHelpers } from '../../utils/DemoHelpers';

const TEXTURES = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/';
const CUBE_FILES = ['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png'];
const TEAPOT_SIZE = 300;

type Shading = 'wireframe' | 'flat' | 'smooth' | 'glossy' | 'textured' | 'reflective';
const SHADINGS: Shading[] = ['wireframe', 'flat', 'smooth', 'glossy', 'textured', 'reflective'];

function Teapot() {
  const { tessellation, lid, body, bottom, fitLid, nonBlinn, shading } = useControls('geometry-teapot', {
    tessellation: { value: 15, options: [2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 40, 50], label: 'tessellation level' },
    lid: { value: true, label: 'display lid' },
    body: { value: true, label: 'display body' },
    bottom: { value: true, label: 'display bottom' },
    fitLid: { value: false, label: 'snug lid' },
    nonBlinn: { value: false, label: 'original scale' },
    shading: { value: 'glossy' as Shading, options: SHADINGS },
  });
  const scene = useThree((s) => s.scene);
  const textureCube = useCubeTexture(CUBE_FILES, { path: `${TEXTURES}cube/pisa/` });
  const textureMap = useTexture(`${TEXTURES}uv_grid_opengl.jpg`);

  useLayoutEffect(() => {
    textureMap.wrapS = textureMap.wrapT = RepeatWrapping;
    textureMap.anisotropy = 16;
    textureMap.colorSpace = SRGBColorSpace;
  }, [textureMap]);

  // The skybox belongs to the reflective teapot only; every other shading gets flat grey.
  useLayoutEffect(() => {
    scene.background = shading === 'reflective' ? textureCube : new Color('#aaaaaa');
  }, [scene, shading, textureCube]);

  // Keyed so a shading change remounts the material — a map or envMap added to a live
  // node material would not rebuild its shader graph on its own.
  const material = {
    wireframe: <meshBasicNodeMaterial key="wireframe" wireframe />,
    flat: <meshPhongNodeMaterial key="flat" specular="#000000" flatShading side={DoubleSide} />,
    smooth: <meshLambertNodeMaterial key="smooth" side={DoubleSide} />,
    glossy: <meshPhongNodeMaterial key="glossy" color="#c0c0c0" specular="#404040" shininess={300} side={DoubleSide} />,
    textured: <meshPhongNodeMaterial key="textured" map={textureMap} side={DoubleSide} />,
    reflective: <meshPhongNodeMaterial key="reflective" envMap={textureCube} side={DoubleSide} />,
  }[shading];

  return (
    <mesh>
      <teapotGeometry args={[TEAPOT_SIZE, tessellation, bottom, lid, body, fitLid, !nonBlinn]} />
      {material}
    </mesh>
  );
}

export default function GeometryTeapot() {
  return (
    <Canvas
      // The original never sets a tone mapping — WebGPURenderer's default is none.
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [-600, 550, 1300], fov: 45, near: 1, far: 80000 }}>
      <ambientLight color="#7c7c7c" intensity={2} />
      <directionalLight color="#ffffff" intensity={2} position={[0.32, 0.39, 0.7]} />
      <Suspense fallback={null}>
        <Teapot />
      </Suspense>
      {/* Grid off: at teapot scale (300 units) the half-unit cells read as noise. */}
      <DemoHelpers grid={false} />
    </Canvas>
  );
}
