/**
 * label
 * Earth with an orbiting Moon; each body carries two screen-space HTML labels (its name and
 * its mass) that stay pinned to it as it moves and as the camera orbits.
 * Original: https://threejs.org/examples/#css2d_label
 *
 * DEMONSTRATES
 * - drei's `<Html>` as a CHILD of the mesh it labels: the Moon's labels follow its orbit with
 *   zero sync code. The original runs a second renderer (`CSS2DRenderer`) by hand every frame
 *   and hangs a hand-built `CSS2DObject` off each mesh; here a label is one JSX element
 * - Anchoring in screen space: `CSS2DObject.center` becomes a CSS transform on the label
 * - Label visibility as plain React state — a hidden label is simply not rendered
 * - `useTexture`'s object form feeding a `<meshPhongNodeMaterial>` map / specularMap / normalMap
 *
 * DIVERGENCE from original
 * - The original hides labels by toggling CAMERA LAYERS (name labels on layer 0, mass labels on
 *   layer 1, four GUI buttons). drei's `<Html>` does not consult `layers`, so the two toggles
 *   are leva checkboxes and the labels render conditionally — same behaviour, no layer masks
 */
import { Suspense, useMemo, useRef } from 'react';
import { NoToneMapping, SRGBColorSpace } from 'three/webgpu';
import type { Mesh } from 'three/webgpu';
import { Canvas, useFrame, useTexture } from '@react-three/fiber/webgpu';
import { Html } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const PLANETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/planets';

const EARTH_RADIUS = 1;
const MOON_RADIUS = 0.27;

const labelStyle = { color: '#fff', fontFamily: 'sans-serif', padding: 2, whiteSpace: 'nowrap' } as const;

interface LabelsProps {
  name: string;
  mass: string;
  radius: number;
  showName: boolean;
  showMass: boolean;
}

// Both labels anchor 1.5 radii to the right of the body's centre. The original puts the
// name ABOVE that point (`center.set(0, 1)`: the element's bottom-left corner sits on it)
// and the mass BELOW (`center.set(0, 0)`: top-left corner). `<Html>` anchors top-left by
// default, so only the name needs a lift of its own height.
//
// REVIEW(drei-html-eps): `eps={-1}` forces the screen-position write every frame. drei skips
// it while the projected position is within `eps` of the last one, and StrictMode's effect
// re-run (dev only) parks the element off-screen WITHOUT clearing that cache — so a label on
// a body that never moves (Earth) stays hidden until the camera moves. Four labels, so the
// per-frame write is free. Upstream drei bug; drop this once it is fixed.
function Labels({ name, mass, radius, showName, showMass }: LabelsProps) {
  const position: [number, number, number] = [1.5 * radius, 0, 0];
  return (
    <>
      {showName && (
        <Html position={position} eps={-1} style={{ ...labelStyle, transform: 'translateY(-100%)' }}>
          {name}
        </Html>
      )}
      {showMass && (
        <Html position={position} eps={-1} style={labelStyle}>
          {mass}
        </Html>
      )}
    </>
  );
}

function Planets() {
  // Shared by both bodies' labels, so the checkboxes live at their common parent.
  const labels = useControls('Labels', {
    showName: { value: true, label: 'Name' },
    showMass: { value: true, label: 'Mass' },
  });

  const textures = useTexture({
    earthMap: `${PLANETS}/earth_atmos_2048.jpg`,
    earthSpecular: `${PLANETS}/earth_specular_2048.jpg`,
    earthNormal: `${PLANETS}/earth_normal_2048.jpg`,
    moonMap: `${PLANETS}/moon_1024.jpg`,
  });
  const { earthMap, earthSpecular, earthNormal, moonMap } = useMemo(() => {
    // Colour textures decode as sRGB; the specular and normal maps are data.
    textures.earthMap.colorSpace = SRGBColorSpace;
    textures.moonMap.colorSpace = SRGBColorSpace;
    return textures;
  }, [textures]);

  const moonRef = useRef<Mesh>(null);
  useFrame(({ elapsed }) => {
    moonRef.current?.position.set(Math.sin(elapsed) * 5, 0, Math.cos(elapsed) * 5);
  });

  return (
    <>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, 16, 16]} />
        <meshPhongNodeMaterial
          map={earthMap}
          specularMap={earthSpecular}
          normalMap={earthNormal}
          normalScale={[0.85, 0.85]}
          specular="#333333"
          shininess={5}
        />
        <Labels name="Earth" mass="5.97237e24 kg" radius={EARTH_RADIUS} {...labels} />
      </mesh>
      <mesh ref={moonRef}>
        <sphereGeometry args={[MOON_RADIUS, 16, 16]} />
        <meshPhongNodeMaterial map={moonMap} shininess={5} />
        <Labels name="Moon" mass="7.342e22 kg" radius={MOON_RADIUS} {...labels} />
      </mesh>
    </>
  );
}

export default function Label() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [10, 5, 20], fov: 45, near: 0.1, far: 200 }}>
      <directionalLight position={[0, 0, 1]} intensity={3} />
      <axesHelper args={[5]} />
      <Suspense fallback={null}>
        <Planets />
      </Suspense>
      <DemoHelpers grid={false} minDistance={5} maxDistance={100} />
    </Canvas>
  );
}
