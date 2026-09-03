import { Fragment, useEffect, useMemo } from 'react';
import { Color, CubeRefractionMapping, RepeatWrapping, SRGBColorSpace } from 'three/webgpu';
import {
  cameraPosition,
  float,
  Fn,
  If,
  max,
  mod,
  normalView,
  normalWorld,
  positionWorld,
  pow,
  refract,
  screenCoordinate,
  select,
  smoothstep,
  varying,
  vec3,
  vec4,
} from 'three/tsl';
import { useNodes } from '@react-three/fiber/webgpu';
import { useCubeTexture, useTexture } from '@react-three/drei/webgpu';

const CUBE_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/cube/SwedishRoyalCastle/';
const CUBE_FILES = ['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'];
const UV_GRID_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/uv_grid_opengl.jpg';

export const MATERIAL_NAMES = [
  'shiny',
  'chrome',
  'liquid',
  'matte',
  'flat',
  'textured',
  'colors',
  'multiColors',
  'plastic',
  'toon1',
  'toon2',
  'hatching',
  'dotted',
] as const;
export type MaterialName = (typeof MATERIAL_NAMES)[number];

/** The scene's lights, as the toon graphs read them: position UNnormalised, like the GLSL. */
export const DIR_LIGHT_POSITION: [number, number, number] = [0.5, 0.5, 1];
export const AMBIENT_COLOR = '#323232';

//* Toon shaders (ToonShader.js, in TSL) ===========================

// A hex colour as a plain vec3 — a `color()` node is its own TSL type and will not
// unify as a vec3 argument or take `mulAssign`.
function rgb(hex: string) {
  const { r, g, b } = new Color(hex);
  return vec3(r, g, b);
}

// The four `ShaderMaterial`s from three/addons/shaders/ToonShader.js. Each one is a
// `fragmentNode`: the whole fragment shader, with the renderer's colour-space step still
// applied afterwards — the GLSL ends in `#include <colorspace_fragment>` for the same job.
function makeToonNodes() {
  const dirLightPos = vec3(...DIR_LIGHT_POSITION);
  const dirLightColor = vec3(1); // the white directional light
  const ambientLightColor = rgb(AMBIENT_COLOR);
  const normal = normalView.normalize(); // `normalize(normalMatrix * normal)`

  // Ambient + directional, the term every toon variant thresholds on.
  const lightWeighting = ambientLightColor.add(dirLightColor.mul(max(normal.dot(dirLightPos), 0)));
  const lightLength = lightWeighting.length();
  const { x, y } = screenCoordinate; // gl_FragCoord

  const toon1 = Fn(() => {
    const baseColor = vec3(1);
    // Refracted view ray, computed per vertex and interpolated like the GLSL varying.
    const vRefract = varying(refract(positionWorld.sub(cameraPosition).normalize(), normalWorld, 1.02));

    const intensity = smoothstep(-0.5, 1, pow(lightLength, 20)).toVar();
    intensity.addAssign(lightLength.mul(0.2));
    intensity.addAssign(pow(float(1).sub(normal.dot(vRefract).length()), 6));
    intensity.assign(intensity.mul(0.2).add(0.3));

    const dark = intensity.mul(2).mul(baseColor);
    const light = float(1).sub(float(1).sub(intensity).mul(2).mul(float(1).sub(baseColor)));
    return vec4(select(intensity.lessThan(0.5), dark, light), 1);
  });

  const toon2 = Fn(() => {
    const camera = max(normal.dot(vec3(0, 0, 1)), 0.4);
    const cameraLength = ambientLightColor.add(dirLightColor.mul(camera)).length();

    const result = rgb('#eeeeee').toVar();
    If(lightLength.lessThan(1), () => {
      result.mulAssign(rgb('#808080'));
    });
    If(cameraLength.lessThan(0.5), () => {
      result.mulAssign(0);
    });
    return vec4(result, 1);
  });

  // Diagonal pencil strokes, one more family of lines per darkness band.
  const hatching = Fn(() => {
    const result = vec3(1).toVar();
    If(lightLength.lessThan(1).and(mod(x.add(y), 10).equal(0)), () => {
      result.assign(0);
    });
    If(lightLength.lessThan(0.75).and(mod(x.sub(y), 10).equal(0)), () => {
      result.assign(0);
    });
    If(lightLength.lessThan(0.5).and(mod(x.add(y).sub(5), 10).equal(0)), () => {
      result.assign(0);
    });
    If(lightLength.lessThan(0.3465).and(mod(x.sub(y).sub(5), 10).equal(0)), () => {
      result.assign(0);
    });
    return vec4(result, 1);
  });

  const dotted = Fn(() => {
    const result = vec3(1).toVar();
    const dot1 = mod(x, 4.001).add(mod(y, 4)).greaterThan(6);
    const dot2 = mod(x.add(2), 4.001)
      .add(mod(y.add(2), 4))
      .greaterThan(6);
    If(lightLength.lessThan(1).and(dot1), () => {
      result.assign(0);
    });
    If(lightLength.lessThan(0.5).and(dot2), () => {
      result.assign(0);
    });
    return vec4(result, 1);
  });

  return { toon1: toon1(), toon2: toon2(), hatching: hatching(), dotted: dotted() };
}

//* Material picker ================================================

// Rendered as the `<marchingCubes>` child, so whichever element this returns IS the
// blob's material — picking one is a re-render, not an `effect.material = …`.
export function BlobMaterial({ name }: { name: MaterialName }) {
  const reflectionCube = useCubeTexture(CUBE_FILES, { path: CUBE_PATH });
  const map = useTexture(UV_GRID_URL);

  // The original loads the cube map twice; a derived clone is the same texture data
  // with the refraction mapping, memoised off the loader's stable result.
  const refractionCube = useMemo(() => {
    const cube = reflectionCube.clone();
    cube.mapping = CubeRefractionMapping;
    return cube;
  }, [reflectionCube]);

  useEffect(() => {
    map.wrapS = map.wrapT = RepeatWrapping;
    map.colorSpace = SRGBColorSpace;
  }, [map]);

  const toon = useNodes(makeToonNodes);

  const materials: Record<MaterialName, React.ReactElement> = {
    shiny: <meshStandardNodeMaterial color="#9c0000" envMap={reflectionCube} roughness={0.1} metalness={1} />,
    chrome: <meshLambertNodeMaterial color="#ffffff" envMap={reflectionCube} />,
    liquid: <meshLambertNodeMaterial color="#ffffff" envMap={refractionCube} refractionRatio={0.85} />,
    matte: <meshPhongNodeMaterial specular="#494949" shininess={1} />,
    flat: <meshLambertNodeMaterial flatShading />,
    textured: <meshPhongNodeMaterial color="#ffffff" specular="#111111" shininess={1} map={map} />,
    colors: <meshPhongNodeMaterial color="#ffffff" specular="#ffffff" shininess={2} vertexColors />,
    multiColors: <meshPhongNodeMaterial shininess={2} vertexColors />,
    plastic: <meshPhongNodeMaterial specular="#c1c1c1" shininess={250} />,
    toon1: <meshBasicNodeMaterial fragmentNode={toon.toon1} />,
    toon2: <meshBasicNodeMaterial fragmentNode={toon.toon2} />,
    hatching: <meshBasicNodeMaterial fragmentNode={toon.hatching} />,
    dotted: <meshBasicNodeMaterial fragmentNode={toon.dotted} />,
  };

  // Keyed on the name so every switch mounts a FRESH material, as the original's thirteen
  // instances do. Updating one in place would leave the previous pick's props behind:
  // fiber resets a prop that leaves the JSX to `0` on classes whose constructor takes
  // arguments (node materials do), which turns `color` black and `map` into a number.
  return <Fragment key={name}>{materials[name]}</Fragment>;
}
