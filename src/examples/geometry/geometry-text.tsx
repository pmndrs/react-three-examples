/**
 * geometry-text
 * Extruded 3D text over its own reflection. Type to replace it; the panel buttons cycle
 * the font, weight, bevel and light color.
 * Original: https://threejs.org/examples/#webgl_geometry_text
 *
 * DEMONSTRATES
 * - drei `<Text3D>`: font URL, size, depth and bevel are props and the text is its child.
 *   Changing any of them rebuilds the `TextGeometry`, so the original's `refreshText()`
 *   remove / rebuild / re-add cycle is just a re-render
 * - `attach="material-0"` / `"material-1"`: different materials for the front faces and the
 *   extruded sides — the JSX form of a material array
 * - drei `<Center disableY disableZ>` doing the horizontal centering the original derives
 *   from the bounding box by hand
 * - The mirrored copy is the same component flipped (`rotation={[Math.PI, 0, 0]}`)
 * - Typing is one `document` keydown listener in an effect; the four one-shot actions are
 *   leva buttons driving React state
 *
 * DIVERGENCE from original
 * - The original's drag-to-spin pointer code is replaced by camera-controls (orbit)
 */
import { Suspense, useEffect, useState } from 'react';
import { Color, NoToneMapping } from 'three/webgpu';
import { Canvas, type ThreeElements } from '@react-three/fiber/webgpu';
import { Center, Text3D } from '@react-three/drei/webgpu';
import { button, useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const FONTS_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/fonts/';
const FONTS = ['helvetiker', 'optimer', 'gentilis', 'droid/droid_sans', 'droid/droid_serif'];
const HOVER = 30;
const DEPTH = 20;

const randomColor = () => new Color().setHSL(Math.random(), 1, 0.5);

type ExtrudedTextProps = Omit<ThreeElements['group'], 'ref' | 'children'> & {
  font: string;
  bevel: boolean;
  text: string;
};

function ExtrudedText({ font, bevel, text, ...props }: ExtrudedTextProps) {
  return (
    // cacheKey: Center measures once and only re-measures when told the geometry changed.
    <Center disableY disableZ cacheKey={`${font}|${bevel}|${text}`} {...props}>
      <Text3D
        font={font}
        size={70}
        height={DEPTH}
        curveSegments={4}
        bevelEnabled={bevel}
        bevelThickness={2}
        bevelSize={1.5}
        bevelSegments={3}>
        {text}
        <meshPhongNodeMaterial attach="material-0" color="#ffffff" flatShading />
        <meshPhongNodeMaterial attach="material-1" color="#ffffff" />
      </Text3D>
    </Center>
  );
}

function TextScene() {
  const [text, setText] = useState('three.js');
  const [fontIndex, setFontIndex] = useState(1); // optimer
  const [weight, setWeight] = useState<'bold' | 'regular'>('bold');
  const [bevel, setBevel] = useState(true);
  const [lightColor, setLightColor] = useState(randomColor);

  useControls('geometry-text', {
    'change color': button(() => setLightColor(randomColor())),
    'change font': button(() => setFontIndex((i) => i + 1)),
    'change weight': button(() => setWeight((w) => (w === 'bold' ? 'regular' : 'bold'))),
    'change bevel': button(() => setBevel((b) => !b)),
  });

  // Typing edits the text: the first key replaces the default, Backspace deletes.
  useEffect(() => {
    let firstKey = true;
    const onKeyDown = (event: KeyboardEvent) => {
      // Leave shortcuts and the shell's own inputs alone — this page shares a document.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const isBackspace = event.key === 'Backspace';
      if (!isBackspace && event.key.length !== 1) return; // arrows, shift, …
      if (isBackspace) event.preventDefault();
      setText((current) => {
        const base = firstKey ? '' : current;
        return isBackspace ? base.slice(0, -1) : base + event.key;
      });
      firstKey = false;
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const font = `${FONTS_URL}${FONTS[fontIndex % FONTS.length]}_${weight}.typeface.json`;

  return (
    <>
      <directionalLight color="#ffffff" intensity={0.4} position={[0, 0, 1]} />
      <pointLight color={lightColor} intensity={4.5} decay={0} position={[0, 100, 90]} />
      <group position-y={100}>
        <Suspense fallback={null}>
          {text && (
            <>
              <ExtrudedText font={font} bevel={bevel} text={text} position={[0, HOVER, 0]} />
              <ExtrudedText
                font={font}
                bevel={bevel}
                text={text}
                position={[0, -HOVER, DEPTH]}
                rotation={[Math.PI, 0, 0]}
              />
            </>
          )}
        </Suspense>
        {/* The translucent floor the flipped copy reads as a reflection in. */}
        <mesh rotation-x={-Math.PI / 2}>
          <planeGeometry args={[10000, 10000]} />
          <meshBasicNodeMaterial color="#ffffff" opacity={0.5} transparent />
        </mesh>
      </group>
    </>
  );
}

export default function GeometryText() {
  return (
    <Canvas
      // The original never sets a tone mapping — WebGPURenderer's default is none.
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 400, 700], fov: 30, near: 1, far: 1500 }}>
      <fog attach="fog" args={['#000000', 250, 1400]} />
      <TextScene />
      {/* Grid off: the translucent plane at y = 100 is the floor. */}
      <DemoHelpers grid={false} target={[0, 150, 0]} />
    </Canvas>
  );
}
