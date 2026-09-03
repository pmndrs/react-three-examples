/**
 * geometry-spline-editor
 * Drag the coloured boxes and three Catmull-Rom splines through them redraw live: uniform
 * (red), centripetal (green) and chordal (blue). Add or remove control points and export
 * their positions as code.
 * Original: https://threejs.org/examples/#webgl_geometry_spline_editor
 *
 * DEMONSTRATES
 * - drei's `<TransformControls>` attached to whichever box the pointer is over:
 *   `onPointerOver` IS the hover raycast, and the Canvas's `onPointerMissed` (a click
 *   that hit nothing) is the detach — replacing a `Raycaster`, three document listeners
 *   and the original's pointer-down/up distance test
 * - Three `CatmullRomCurve3`s over ONE shared array of control-point vectors, each drawn
 *   by a `<threeLine>` whose position attribute is refilled in place on every change
 * - Selection is derived, not synced: the gizmo only targets a box that is still in the
 *   handle list, so "remove point" cannot strand it on a mesh that is gone
 * - leva `button()`s for add / remove / export, next to the state they act on
 *
 * DIVERGENCE from original
 * - The spline lines' `opacity: 0.35` is dropped: without `transparent: true` it never
 *   took effect, so the original's lines are fully opaque too
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CatmullRomCurve3, Color, NoToneMapping, Vector3 } from 'three/webgpu';
import type { BufferAttribute, Object3D } from 'three/webgpu';
import type { TransformControls as TransformControlsImpl } from 'three/addons/controls/TransformControls.js';
import { Canvas } from '@react-three/fiber/webgpu';
import { TransformControls } from '@react-three/drei/webgpu';
import type CameraControlsImpl from 'camera-controls';
import { button, useControls } from 'leva';
import '../../assets/ThreeLine';
import { DemoHelpers } from '../../utils/DemoHelpers';

const ARC_SEGMENTS = 200;

const INITIAL_POSITIONS = [
  [289.76843686945404, 452.51481137238443, 56.10018915737797],
  [-53.56300074753207, 171.49711742836848, -14.495472686253045],
  [-91.40118730204415, 176.4306956436485, -6.958271935582161],
  [-383.785318791128, 491.1365363371675, 47.869296953772746],
];

interface Handle {
  id: number;
  color: Color;
  position: Vector3;
}

// A new control point: at a given spot, or somewhere random above the floor.
function makeHandle(id: number, at?: number[]): Handle {
  const position = at
    ? new Vector3(...at)
    : new Vector3(Math.random() * 1000 - 500, Math.random() * 600, Math.random() * 800 - 400);
  return { id, color: new Color(Math.random() * 0xffffff), position };
}

//* Spline lines ==================================================

interface SplineLineProps {
  curve: CatmullRomCurve3;
  color: string;
  visible: boolean;
  /** Only the uniform spline reads it. */
  tension?: number;
  /** Bumped on every drag tick — the curve's points are mutated in place. */
  revision: number;
}

function SplineLine({ curve, color, visible, tension, revision }: SplineLineProps) {
  const positions = useMemo(() => new Float32Array(ARC_SEGMENTS * 3), []);
  const attributeRef = useRef<BufferAttribute>(null);

  // Resample the curve into the SAME attribute — 200 points, no geometry rebuild.
  useLayoutEffect(() => {
    if (tension !== undefined) curve.tension = tension;
    const point = new Vector3();
    for (let i = 0; i < ARC_SEGMENTS; i++) {
      curve.getPoint(i / (ARC_SEGMENTS - 1), point).toArray(positions, i * 3);
    }
    if (attributeRef.current) attributeRef.current.needsUpdate = true;
  }, [curve, positions, tension, revision]);

  return (
    <threeLine visible={visible} castShadow frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute ref={attributeRef} attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicNodeMaterial color={color} />
    </threeLine>
  );
}

//* Editor ========================================================

interface SplineEditorProps {
  controlsRef: React.RefObject<CameraControlsImpl | null>;
  /** The box under the gizmo. Lives with the Canvas, whose `onPointerMissed` clears it. */
  selected: Object3D | null;
  onSelect: (object: Object3D) => void;
}

function SplineEditor({ controlsRef, selected, onSelect }: SplineEditorProps) {
  const [handles, setHandles] = useState(() => INITIAL_POSITIONS.map((at, id) => makeHandle(id, at)));
  const [revision, setRevision] = useState(0);
  const dragging = useRef(false);
  // The setter IS the ref: the gizmo's visible helper has to be rendered separately.
  const [gizmo, setGizmo] = useState<TransformControlsImpl | null>(null);

  // A removed box takes its selection with it.
  const selectedHandle = handles.find((h) => h.id === selected?.userData.id);

  // leva registers a button's callback once, so export reads the handles through a ref
  // that follows the state.
  const latestHandles = useRef(handles);
  useEffect(() => {
    latestHandles.current = handles;
  }, [handles]);

  const { uniform, tension, centripetal, chordal } = useControls('Spline', {
    uniform: true,
    tension: { value: 0.5, min: 0, max: 1, step: 0.01 },
    centripetal: true,
    chordal: true,
    addPoint: button(() => setHandles((h) => [...h, makeHandle(h[h.length - 1].id + 1)])),
    removePoint: button(() => setHandles((h) => (h.length > 4 ? h.slice(0, -1) : h))),
    exportSpline: button(() => {
      const code = latestHandles.current.map(({ position: p }) => `new THREE.Vector3(${p.x}, ${p.y}, ${p.z})`);
      console.log(code.join(',\n'));
      prompt('copy and paste code', `[${code.join(',\n\t')}]`);
    }),
  });

  // Three curves, one shared point list — dragging a box moves all three.
  const curves = useMemo(() => {
    const points = handles.map((h) => h.position);
    return (['catmullrom', 'centripetal', 'chordal'] as const).map((curveType) => {
      const curve = new CatmullRomCurve3(points);
      curve.curveType = curveType;
      return curve;
    });
  }, [handles]);

  const beginDrag = useCallback(() => {
    dragging.current = true;
    if (controlsRef.current) controlsRef.current.enabled = false;
  }, [controlsRef]);

  const endDrag = useCallback(() => {
    dragging.current = false;
    if (controlsRef.current) controlsRef.current.enabled = true;
  }, [controlsRef]);

  // The gizmo moves the mesh; copy that back into the shared point and resample.
  const syncSelected = useCallback(() => {
    if (selectedHandle && selected) selectedHandle.position.copy(selected.position);
    setRevision((n) => n + 1);
  }, [selectedHandle, selected]);

  return (
    <>
      {handles.map((handle) => (
        <mesh
          key={handle.id}
          userData={{ id: handle.id }}
          position={handle.position}
          castShadow
          receiveShadow
          onPointerOver={(event) => {
            if (!dragging.current) onSelect(event.object);
          }}>
          <boxGeometry args={[20, 20, 20]} />
          <meshLambertNodeMaterial color={handle.color} />
        </mesh>
      ))}

      <SplineLine curve={curves[0]} color="#ff0000" visible={uniform} tension={tension} revision={revision} />
      <SplineLine curve={curves[1]} color="#00ff00" visible={centripetal} revision={revision} />
      <SplineLine curve={curves[2]} color="#0000ff" visible={chordal} revision={revision} />

      {selectedHandle && selected && (
        <>
          <TransformControls
            ref={setGizmo}
            object={selected}
            onMouseDown={beginDrag}
            onMouseUp={endDrag}
            onObjectChange={syncSelected}
          />
          {/* TODO(drei-gap): since r169 `TransformControls` is a Controls, not an Object3D, and
              the arrows live in `getHelper()` — which drei's `<TransformControls>` never adds to
              the scene, so without this line there is no gizmo and nothing to drag. This is the
              original's `scene.add(transformControl.getHelper())`, declaratively. */}
          {gizmo && <primitive object={gizmo.getHelper()} />}
        </>
      )}
    </>
  );
}

export default function GeometrySplineEditor() {
  const controlsRef = useRef<CameraControlsImpl>(null);
  const [selected, setSelected] = useState<Object3D | null>(null);

  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      shadows
      background="#f0f0f0"
      camera={{ position: [0, 250, 1000], fov: 70, near: 1, far: 10000 }}
      // A click that lands on nothing (the gizmo included) drops the selection.
      onPointerMissed={() => setSelected(null)}>
      <ambientLight color="#f0f0f0" intensity={3} />
      <spotLight
        position={[0, 1500, 200]}
        intensity={4.5}
        angle={Math.PI * 0.2}
        decay={0}
        castShadow
        shadow-camera-near={200}
        shadow-camera-far={2000}
        shadow-bias={-0.000222}
        shadow-mapSize={[1024, 1024]}
      />

      {/* Shadow catcher and the original's own grid, both 200 units below the origin. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-200} receiveShadow>
        <planeGeometry args={[2000, 2000]} />
        <shadowNodeMaterial color="#000000" opacity={0.2} />
      </mesh>
      <gridHelper args={[2000, 100]} position-y={-199} material-opacity={0.25} material-transparent />

      <SplineEditor controlsRef={controlsRef} selected={selected} onSelect={setSelected} />
      <DemoHelpers grid={false} controlsRef={controlsRef} />
    </Canvas>
  );
}
