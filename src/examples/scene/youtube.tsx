/**
 * youtube
 * Four live YouTube players standing on the four sides of a square, in perspective. Orbit
 * around them; the players stay fully interactive.
 * Original: https://threejs.org/examples/#css3d_youtube
 *
 * DEMONSTRATES
 * - drei's `<Html transform>` carrying a real `<iframe>`: an embedded player positioned and
 *   rotated by three.js, still clickable. The original runs a `CSS3DRenderer` beside the scene
 *   and builds each `CSS3DObject` by hand
 * - Keeping the camera drag alive over iframes: a cross-origin iframe swallows pointer events,
 *   so the original shows a full-page "blocker" div between `controls` `start` and `end`. Here
 *   the same two camera-controls events flip `pointerEvents` on the players — React state,
 *   no extra DOM
 * - The WebGPU canvas draws nothing; the page is DOM (`static` in the manifest)
 *
 * DIVERGENCE from original
 * - Hotlinked YouTube embeds, as the original. In a harness that blocks them the players are
 *   black frames; the readiness signal does not depend on them
 */
import { useEffect, useRef, useState } from 'react';
import { NoToneMapping } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import { Html } from '@react-three/drei/webgpu';
import type CameraControlsImpl from 'camera-controls';
import { DemoHelpers } from '../../utils/DemoHelpers';

const VIDEOS = [
  { id: 'SJOz3qjfQXU', position: [0, 0, 240], rotationY: 0 },
  { id: 'Y2-xZ-1HE-Q', position: [240, 0, 0], rotationY: Math.PI / 2 },
  { id: 'IrydklNpcFI', position: [0, 0, -240], rotationY: Math.PI },
  { id: '9ubytEsCaS0', position: [-240, 0, 0], rotationY: -Math.PI / 2 },
] as const;

interface PlayersProps {
  controlsRef: React.RefObject<CameraControlsImpl | null>;
}

function Players({ controlsRef }: PlayersProps) {
  // While the camera is being dragged the players let the pointer through to the canvas —
  // otherwise the first iframe the pointer crosses eats the drag.
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const start = () => setDragging(true);
    const end = () => setDragging(false);
    controls.addEventListener('controlstart', start);
    controls.addEventListener('controlend', end);
    return () => {
      controls.removeEventListener('controlstart', start);
      controls.removeEventListener('controlend', end);
    };
  }, [controlsRef]);

  return (
    <group>
      {VIDEOS.map(({ id, position, rotationY }) => (
        <Html
          key={id}
          transform
          distanceFactor={400}
          position={position}
          rotation={[0, rotationY, 0]}
          pointerEvents={dragging ? 'none' : 'auto'}>
          <div style={{ width: 480, height: 360, backgroundColor: '#000' }}>
            <iframe src={`https://www.youtube.com/embed/${id}?rel=0`} style={{ width: 480, height: 360, border: 0 }} />
          </div>
        </Html>
      ))}
    </group>
  );
}

export default function Youtube() {
  const controlsRef = useRef<CameraControlsImpl>(null);
  return (
    <Canvas
      // No renderer at all in the original, so no tone mapping: keep the page white, not ACES grey.
      renderer={{ toneMapping: NoToneMapping }}
      background="#ffffff"
      camera={{ position: [500, 350, 750], fov: 50, near: 1, far: 5000 }}>
      <Players controlsRef={controlsRef} />
      <DemoHelpers grid={false} controlsRef={controlsRef} />
    </Canvas>
  );
}
