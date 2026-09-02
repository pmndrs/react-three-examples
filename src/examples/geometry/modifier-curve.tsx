/**
 * modifier-curve
 * A 3D text mesh flows endlessly around a closed spline. Drag any of the four white
 * boxes and the text re-wraps onto the new curve shape.
 * Original: https://threejs.org/examples/#webgpu_modifier_curve
 *
 * DEMONSTRATES
 * - `Flow` (`three/addons/modifiers/CurveModifierGPU.js`) driving a node material: the
 *   spline's points/tangents/normals/binormals are baked into a half-float DataTexture
 *   and the material's `positionNode` re-bases every vertex onto the curve on the GPU
 * - Picking with R3F events instead of a Raycaster: `onPointerDown` on each handle mesh
 *   IS the hit test, so the original's mouse-NDC + `intersectObjects` bookkeeping and
 *   its deferred ACTION_SELECT state machine both disappear
 * - drei's `<TransformControls object={…}>` on the selected handle, with camera-controls
 *   suspended for the drag's duration via `DemoHelpers`' `controlsRef` escape hatch
 * - The curve reads the handle meshes' own `position` vectors, so a drag mutates it in
 *   place — only the derived data (spline texture, polyline) is rebuilt, on drag end
 *
 * DIVERGENCE from original
 * - drei ships `<CurveModifier>`, but it imports the WebGL `CurveModifier.js` `Flow`,
 *   which patches a `ShaderMaterial` through `onBeforeCompile` and cannot touch a node
 *   material. The GPU `Flow` is used directly here — its API takes a `Mesh` and hands
 *   back a clone, so that one object is imperative and rendered via `<primitive>`
 * - `frustumCulled={false}` on the flowed mesh: its `positionNode` moves the geometry
 *   onto the curve, so three's CPU-side bounding sphere (still around the flat text at
 *   the origin) culls it from most angles. The original carries this latent bug
 */
import { Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CatmullRomCurve3, Mesh, MeshStandardNodeMaterial, NoToneMapping } from 'three/webgpu';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { Flow } from 'three/addons/modifiers/CurveModifierGPU.js';
import { Canvas, useFrame } from '@react-three/fiber/webgpu';
import { TransformControls, useFont } from '@react-three/drei/webgpu';
import type CameraControlsImpl from 'camera-controls';
import { DemoHelpers } from '../../utils/DemoHelpers';

const FONT_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/fonts/helvetiker_regular.typeface.json';

const HANDLE_POSITIONS: [number, number, number][] = [
  [1, 0, -1],
  [1, 0, 1],
  [-1, 0, 1],
  [-1, 0, -1],
];

//* Flowed text ===================================================

interface FlowingTextProps {
  curve: CatmullRomCurve3;
  /** Bumped when a handle drag ends — re-bakes the spline texture. */
  revision: number;
}

// `Flow` clones the mesh it is handed and rewrites the clone's material with a
// curve-sampling `positionNode`, so there is no JSX surface for it: build the source
// mesh, keep the clone, render it as a primitive (House style rule 3's escape hatch).
function FlowingText({ curve, revision }: FlowingTextProps) {
  const font = useFont(FONT_URL);

  const flow = useMemo(() => {
    const geometry = new TextGeometry('Hello three.js!', {
      font,
      size: 0.2,
      depth: 0.05,
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.01,
      bevelOffset: 0,
      bevelSegments: 5,
    });
    geometry.rotateX(Math.PI); // the curve's normal frame points down along the text
    return new Flow(new Mesh(geometry, new MeshStandardNodeMaterial({ color: '#99ffff' })));
  }, [font]);

  // Baking the spline into the DataTexture is imperative work the modifier owns; a
  // layout effect gets it in before the first render reads the texture.
  useLayoutEffect(() => {
    flow.updateCurve(0, curve);
  }, [flow, curve, revision]);

  useFrame(() => flow.moveAlongCurve(0.001));

  return <primitive object={flow.object3D} frustumCulled={false} />;
}

//* Scene =========================================================

interface CurveSceneProps {
  controlsRef: React.RefObject<CameraControlsImpl | null>;
}

// Owns the four draggable handles and the CatmullRomCurve3 built from their live
// position vectors — everything downstream (polyline, flowed text) is derived.
function CurveScene({ controlsRef }: CurveSceneProps) {
  const handleRefs = useRef<(Mesh | null)[]>([]);
  const [curve, setCurve] = useState<CatmullRomCurve3 | null>(null);
  const [selected, setSelected] = useState<Mesh | null>(null);
  const [revision, setRevision] = useState(0);

  // The curve holds the handle meshes' own Vector3s, so dragging a handle moves the
  // curve with no sync code — exactly what the original does with its `curveHandles`.
  useLayoutEffect(() => {
    const points = handleRefs.current.filter((mesh) => mesh !== null).map((mesh) => mesh.position);
    const catmull = new CatmullRomCurve3(points);
    catmull.curveType = 'centripetal';
    catmull.closed = true;
    setCurve(catmull);
  }, []);

  // 50 segments of the closed spline, rebuilt on drag end. Changing `args` remounts
  // the attribute, which is how the polyline follows the handles.
  const linePositions = useMemo(() => {
    if (!curve) return new Float32Array(0);
    const points = curve.getPoints(50);
    const array = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) points[i].toArray(array, i * 3);
    return array;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` is the drag-end signal; the curve object itself is mutated in place
  }, [curve, revision]);

  const beginDrag = useCallback(() => {
    if (controlsRef.current) controlsRef.current.enabled = false;
  }, [controlsRef]);

  const endDrag = useCallback(() => {
    if (controlsRef.current) controlsRef.current.enabled = true;
    setRevision((n) => n + 1);
  }, [controlsRef]);

  return (
    <>
      <directionalLight color="#ffaa33" intensity={3} position={[-10, 10, 10]} />
      <ambientLight color="#003973" intensity={3} />

      {HANDLE_POSITIONS.map((position, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            handleRefs.current[i] = mesh;
          }}
          position={position}
          onPointerDown={(event) => {
            event.stopPropagation();
            setSelected(handleRefs.current[i]);
          }}>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshBasicNodeMaterial />
        </mesh>
      ))}

      {curve && (
        <>
          <threeLine frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
            </bufferGeometry>
            <lineBasicNodeMaterial color="#00ff00" />
          </threeLine>

          {/* Its own boundary: the font fetch must not blank the handles it is built from. */}
          <Suspense fallback={null}>
            <FlowingText curve={curve} revision={revision} />
          </Suspense>
        </>
      )}

      {selected && <TransformControls object={selected} onMouseDown={beginDrag} onMouseUp={endDrag} />}
    </>
  );
}

export default function ModifierCurve() {
  const controlsRef = useRef<CameraControlsImpl>(null);

  return (
    <Canvas
      // The original never sets a tone mapping — WebGPURenderer's default is none.
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [2, 2, 4], fov: 40, near: 1, far: 1000 }}>
      <CurveScene controlsRef={controlsRef} />
      {/* Grid off: the curve lies flat on y = 0 and would z-fight the ground grid. */}
      <DemoHelpers grid={false} controlsRef={controlsRef} />
    </Canvas>
  );
}
