/**
 * modifier-tessellation
 * "THREE.JS" in 3D text, chopped into thousands of small triangles by `TessellateModifier`,
 * each one breathing in and out along its normal with its own random colour.
 * Original: https://threejs.org/examples/#webgl_modifier_tessellation
 *
 * DEMONSTRATES
 * - `TessellateModifier(maxEdgeLength, maxIterations)` splitting a `TextGeometry` until no
 *   edge is longer than 8 units — a CPU pass, so the geometry is built once in `useMemo`
 *   off the loaded font, per-face attributes and all
 * - The original's GLSL `ShaderMaterial` rewritten as TSL on a `meshBasicNodeMaterial`:
 *   `attribute<'vec3'>()` reads the custom `customColor`/`displacement` attributes,
 *   `positionNode` is the vertex shader, `outputNode` is the fragment shader
 * - `outputNode` rather than `colorNode`: the GLSL writes `gl_FragColor` raw, with no
 *   colour-space conversion, and `outputNode` is the slot that skips the same steps
 * - The amplitude is `1 + sin(time * 0.5)` straight from TSL's `time` — no uniform, no
 *   `useFrame`, nothing to advance
 */
import { useMemo } from 'react';
import { BufferAttribute, Color, NoToneMapping } from 'three/webgpu';
import { attribute, float, max, normalLocal, positionLocal, sin, time, vec3, vec4 } from 'three/tsl';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { Canvas, useNodes } from '@react-three/fiber/webgpu';
import { useFont } from '@react-three/drei/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const FONT_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/fonts/helvetiker_bold.typeface.json';

function TessellatedText() {
  const font = useFont(FONT_URL);

  const geometry = useMemo(() => {
    const text = new TextGeometry('THREE.JS', {
      font,
      size: 40,
      depth: 5,
      curveSegments: 3,
      bevelThickness: 2,
      bevelSize: 1,
      bevelEnabled: true,
    });
    text.center();

    const tessellated = new TessellateModifier(8, 6).modify(text);

    // Tessellation leaves the geometry unindexed, so every three vertices are one face:
    // give each face a random colour and a random push distance, repeated per vertex.
    const numFaces = tessellated.attributes.position.count / 3;
    const colors = new Float32Array(numFaces * 9);
    const displacement = new Float32Array(numFaces * 9);
    const color = new Color();

    for (let f = 0; f < numFaces; f++) {
      color.setHSL(0.2 * Math.random(), 0.5 + 0.5 * Math.random(), 0.5 + 0.5 * Math.random());
      const d = 10 * (0.5 - Math.random());
      for (let i = 0; i < 3; i++) {
        color.toArray(colors, 9 * f + 3 * i);
        displacement.fill(d, 9 * f + 3 * i, 9 * f + 3 * i + 3);
      }
    }

    tessellated.setAttribute('customColor', new BufferAttribute(colors, 3));
    tessellated.setAttribute('displacement', new BufferAttribute(displacement, 3));
    return tessellated;
  }, [font]);

  const { positionNode, outputNode } = useNodes(() => {
    const amplitude = float(1).add(sin(time.mul(0.5)));
    const customColor = attribute<'vec3'>('customColor');
    const displacement = attribute<'vec3'>('displacement');

    // Vertex: push each face out along its (object-space) normal.
    const positionNode = positionLocal.add(normalLocal.mul(amplitude).mul(displacement));

    // Fragment: one fixed light direction dotted with the same object-space normal, so
    // the lighting turns with the text — just like the original's untransformed `normal`.
    const light = vec3(1).normalize();
    const directional = max(normalLocal.dot(light), 0);
    const outputNode = vec4(customColor.mul(directional.add(0.4)), 1);

    return { positionNode, outputNode };
  });

  return (
    <mesh geometry={geometry}>
      <meshBasicNodeMaterial positionNode={positionNode} outputNode={outputNode} />
    </mesh>
  );
}

export default function ModifierTessellation() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#050505"
      camera={{ position: [-100, 100, 200], fov: 40, near: 1, far: 10000 }}>
      <TessellatedText />
      {/* Grid off: the text is centred on the origin, a ground plane would cut it in half. */}
      <DemoHelpers grid={false} />
    </Canvas>
  );
}
