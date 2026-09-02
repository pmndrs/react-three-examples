/**
 * materials
 * R3F port of three.js `webgpu_materials`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materials (~341 lines of JS)
 *
 * A gallery of 17 teapots, each showcasing one `MeshBasicNodeMaterial` `colorNode`
 * recipe — from raw varyings (`positionLocal`, `normalWorld`, …) through custom
 * `Fn()` shader nodes to raw WGSL via `wgslFn` (with an `Fn`-including-`wgslFn`
 * example) and a hand-rolled 4-tap blur `Loop`.
 *
 * DEMONSTRATES
 * - `useNodes` building all of the TSL node graphs ONCE, keyed by name, read back by
 *   a small `TEAPOTS` data array mapped into JSX — 17 near-identical mesh blocks
 *   become one `.map()` (house style §3) instead of 17 hand-written `<mesh>`s
 * - `wgslFn`: raw WGSL functions callable from a TSL graph, including one WGSL
 *   function calling ANOTHER via the include-array argument
 *   (`wgslFn(source, [otherWgslFn])`) — this repo's first port to exercise it
 * - `Fn()` in both its calling conventions: array-destructured positional args
 *   (`([a, b]) => …`) and a single named-inputs object (`(input) => input.color`)
 * - A `Loop` assigned directly to `colorNode` with no enclosing `Fn()` wrapper — legal
 *   because the material compiler itself supplies the active stack when building the
 *   root shader graph (contrast the `RaymarchingBox`-style helpers in AGENTS.md, which
 *   need a caller-supplied `Fn()`)
 * - The original's own `GridHelper` kept as a real scene object (not DemoHelpers'
 *   grid) since the camera orbit and object spacing are tuned around it
 *
 * DIVERGENCE from original
 * - Camera auto-orbit and per-teapot spin are delta-scaled instead of tied to
 *   rendered-frame count, so they run at the same apparent speed regardless of
 *   display refresh rate
 * - `renderer.inspector` dropped — the original wires no controls to it either
 * - DemoHelpers mounted with `grid={false} controls={false}`: the original's own
 *   `GridHelper` is already in the scene, and the camera is driven entirely by the
 *   auto-orbit (no user-navigable orbit target, same as `materials-basic`)
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  Fn,
  Loop,
  cameraProjectionMatrix,
  float,
  normalLocal,
  normalView,
  normalWorld,
  oscSine,
  positionLocal,
  positionWorld,
  screenUV,
  texture,
  triplanarTexture,
  uv,
  vec2,
  vec3,
  vec4,
  wgslFn,
} from 'three/tsl';
import { RepeatWrapping } from 'three/webgpu';
import type { Mesh, Node } from 'three/webgpu';
import { Canvas, useFrame, useNodes } from '@react-three/fiber/webgpu';
import { useTexture } from '@react-three/drei/webgpu';
import '../../assets/TeapotGeometry';
import { DemoHelpers } from '../../utils/DemoHelpers';

const UV_GRID_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/uv_grid_opengl.jpg';
const OPACITY_MAP_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/alphaMap.jpg';

// Raw WGSL, callable from TSL — `someWGSL` includes `desaturateWGSL` (the wgslFn
// include-array argument). Module scope: neither depends on React state.
const desaturateWGSL = wgslFn(`
  fn desaturate( color:vec3<f32> ) -> vec3<f32> {
    let lum = vec3<f32>( 0.299, 0.587, 0.114 );
    return vec3<f32>( dot( lum, color ) );
  }
`);
const someWGSL = wgslFn(
  `
  fn someFn( color:vec3<f32> ) -> vec3<f32> {
    return desaturate( color );
  }
`,
  // Cast: `wgslFn`'s return is a callable Proxy (call it like a function, read node
  // fields off the same object) — the typed surface only exposes the callable half,
  // not the `Node` half `includes` wants (typed-TSL gap, same family as B10/B11).
  [desaturateWGSL as unknown as Node],
);
const getWGSLTextureSample = wgslFn(`
  fn getWGSLTextureSample( tex: texture_2d<f32>, tex_sampler: sampler, uv:vec2<f32> ) -> vec4<f32> {
    return textureSample( tex, tex_sampler, uv ) * vec4<f32>( 0.0, 1.0, 0.0, 1.0 );
  }
`);

// Fn() called with a single OBJECT of named inputs (not array-destructured
// positional args) — TSL's other calling convention, used for readability when a
// shader node takes one logical input. Cast: object-call `Fn`s type their param as
// bare `ShaderNodeObject<Node>[]`, which has no `.color` member (AGENTS.md B10);
// re-wrapping through `vec3()` regains a properly swizzle-typed node afterwards.
const desaturate = Fn((input) => {
  const inputColor = (input as unknown as { color: Node<'vec4'> }).color;
  return vec3(0.299, 0.587, 0.114).dot(vec3(inputColor));
});

const LOOP_COUNT = 10;

interface TeapotEntry {
  label: string;
  colorNode?: Node;
  color?: string;
  opacityNode?: Node;
  alphaTestNode?: Node;
  transparent?: boolean;
  isNormalMaterial?: boolean;
}

// Random-but-fixed initial spin, computed once (matches the original's random
// `Math.random() * 200 - 100` rotations, baked at build time rather than per mount).
const SPINS = Array.from({ length: 17 }, () => ({
  x: Math.random() * 200 - 100,
  y: Math.random() * 200 - 100,
  z: Math.random() * 200 - 100,
}));

function TeapotGallery() {
  const uvTexture = useTexture(UV_GRID_URL);
  const opacityTexture = useTexture(OPACITY_MAP_URL);

  useEffect(() => {
    uvTexture.wrapS = uvTexture.wrapT = RepeatWrapping;
    opacityTexture.wrapS = opacityTexture.wrapT = RepeatWrapping;
  }, [uvTexture, opacityTexture]);

  // All node graphs, built once — see header DEMONSTRATES. Closes over the
  // (already-resolved, Suspense-cached) textures instead of taking them as args.
  const nodes = useNodes(() => {
    const sharedTextureNode = texture(uvTexture);

    return {
      textureColor: texture(uvTexture),
      opacityAlpha: texture(uvTexture),
      alphaTestColor: texture(uvTexture),
      alphaTestAlpha: texture(opacityTexture),
      cameraProjection: cameraProjectionMatrix.mul(positionLocal),
      desaturate: desaturate({ color: texture(uvTexture) }),
      // Approach 2: no Fn inputs at all — closes over `texture(uvTexture)` directly.
      desaturateNoInputs: Fn(() => vec3(0.299, 0.587, 0.114).dot(texture(uvTexture).xyz))(),
      wgslDesaturate: someWGSL({ color: texture(uvTexture) }),
      wgslTextureSample: getWGSLTextureSample({ tex: sharedTextureNode, tex_sampler: sharedTextureNode, uv: uv() }),
      triplanar: triplanarTexture(texture(uvTexture), null, null, float(0.01)),
      screenProjection: texture(uvTexture, screenUV.flipY()),
      // 4-tap directional blur, offset increasing per loop step and oscillating over
      // time — assigned directly to colorNode (see header DEMONSTRATES).
      loop: Loop(LOOP_COUNT, ({ i }) => {
        const output = vec4().toVar();
        const scale = oscSine().mul(0.09);
        const scaleI = scale.mul(i);
        const scaleINeg = scaleI.negate();

        const leftUV = uv().add(vec2(scaleI, 0));
        const rightUV = uv().add(vec2(scaleINeg, 0));
        const topUV = uv().add(vec2(0, scaleI));
        const bottomUV = uv().add(vec2(0, scaleINeg));

        output.assign(output.add(texture(uvTexture, leftUV)));
        output.assign(output.add(texture(uvTexture, rightUV)));
        output.assign(output.add(texture(uvTexture, topUV)));
        output.assign(output.add(texture(uvTexture, bottomUV)));

        return output.div(LOOP_COUNT * 4);
      }),
    };
  }, 'materials');

  const teapots: TeapotEntry[] = useMemo(
    () => [
      { label: 'PositionLocal', colorNode: positionLocal },
      { label: 'PositionWorld', colorNode: positionWorld },
      { label: 'NormalLocal', colorNode: normalLocal },
      { label: 'NormalWorld', colorNode: normalWorld },
      { label: 'NormalView', colorNode: normalView },
      { label: 'Texture', colorNode: nodes.textureColor },
      { label: 'Opacity', color: '#0099ff', opacityNode: nodes.opacityAlpha, transparent: true },
      {
        label: 'AlphaTest',
        colorNode: nodes.alphaTestColor,
        opacityNode: nodes.alphaTestAlpha,
        alphaTestNode: float(0.5),
      },
      { label: 'Camera', colorNode: nodes.cameraProjection },
      { label: 'Normal', isNormalMaterial: true },
      { label: 'Desaturate', colorNode: nodes.desaturate },
      { label: 'DesaturateNoInputs', colorNode: nodes.desaturateNoInputs },
      { label: 'WGSL Desaturate', colorNode: nodes.wgslDesaturate },
      { label: 'WGSL Texture Sample', colorNode: nodes.wgslTextureSample },
      { label: 'Triplanar', colorNode: nodes.triplanar },
      { label: 'Screen Projection', colorNode: nodes.screenProjection },
      { label: 'Loop', colorNode: nodes.loop },
    ],
    [nodes],
  );

  const meshRefs = useRef<(Mesh | null)[]>([]);
  useFrame(({ delta }) => {
    for (const mesh of meshRefs.current) {
      if (!mesh) continue;
      mesh.rotation.x += 0.6 * delta;
      mesh.rotation.y += 0.3 * delta;
    }
  });

  return (
    <>
      {teapots.map((teapot, i) => {
        const x = (i % 4) * 200 - 400;
        const z = Math.floor(i / 4) * 200 - 200;
        const spin = SPINS[i];
        return (
          <mesh
            key={teapot.label}
            position={[x, 0, z]}
            rotation={[spin.x, spin.y, spin.z]}
            ref={(mesh) => {
              meshRefs.current[i] = mesh;
            }}>
            <teapotGeometry args={[50, 18]} />
            {teapot.isNormalMaterial ? (
              <meshNormalMaterial opacity={0.5} transparent />
            ) : (
              <meshBasicNodeMaterial
                color={teapot.color}
                colorNode={teapot.colorNode}
                opacityNode={teapot.opacityNode}
                alphaTestNode={teapot.alphaTestNode}
                transparent={teapot.transparent}
              />
            )}
          </mesh>
        );
      })}
    </>
  );
}

// Auto-orbiting camera, always looking at the origin — no user orbit control in the
// original (see header DIVERGENCE).
function OrbitCamera() {
  useFrame(({ camera, elapsed }) => {
    const timer = elapsed * 0.1;
    camera.position.set(Math.cos(timer) * 1000, 200, Math.sin(timer) * 1000);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function Materials() {
  return (
    <Canvas background="#000000" camera={{ position: [0, 200, 800], fov: 45, near: 1, far: 2000 }}>
      <gridHelper args={[1000, 40, '#303030', '#303030']} position={[0, -75, 0]} />
      <TeapotGallery />
      <OrbitCamera />
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  );
}
