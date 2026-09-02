// Raycasting — the manual per-frame hit test against whichever fat line is currently
// visible (handed off via `activeLineRef`), plus the two marker spheres it drives.
// This is a DELIBERATE imperative escape hatch, not a discrete `onPointerMove`
// handler: the line keeps rotating under a stationary cursor when `animate` is on,
// so the hit test must re-run every frame regardless of whether the pointer itself
// moved — R3F's built-in hover events only fire on pointer motion and would leave
// the markers stuck between rotations. The pointer position itself starts
// off-screen (`Vector2(Infinity, Infinity)`, tracked from a raw `pointermove`
// listener) rather than reading `state.pointer`, which defaults to (0,0) — the
// canvas center — before any real input (AGENTS.md).
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { Color, Vector2 } from 'three/webgpu';
import type { Intersection, Mesh, MeshBasicMaterial } from 'three/webgpu';
import type { Line2 } from 'three/addons/lines/webgpu/Line2.js';
import type { LineSegments2 } from 'three/addons/lines/webgpu/LineSegments2.js';
import { useFrame, useThree } from '@react-three/fiber/webgpu';

// LineSegments2's raycast() adds a `pointOnLine` field beyond the standard
// Intersection shape (the closest point ON the line's centerline, vs. `point`, the
// closest point on the RAY) — not declared on @types/three's `Intersection`.
type LineIntersection = Intersection & { pointOnLine: { x: number; y: number; z: number } };

// Scratch color reused across the per-frame hit-color lookup (no per-frame allocation).
const hitColor = new Color();

export interface RaycastingProps {
  activeLineRef: RefObject<Line2 | LineSegments2 | null>;
  threshold: number;
}

export function Raycasting({ activeLineRef, threshold }: RaycastingProps) {
  const raycaster = useThree((state) => state.raycaster);

  const sphereInterRef = useRef<Mesh>(null);
  const sphereOnLineRef = useRef<Mesh>(null);
  const pointer = useRef(new Vector2(Infinity, Infinity));

  useEffect(() => {
    raycaster.params.Line2 = { threshold };
  }, [raycaster, threshold]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };
    document.addEventListener('pointermove', onPointerMove);
    return () => document.removeEventListener('pointermove', onPointerMove);
  }, []);

  useFrame(
    ({ camera, gl }) => {
      const obj = activeLineRef.current;
      const sphereInter = sphereInterRef.current;
      const sphereOnLine = sphereOnLineRef.current;
      if (!obj || !sphereInter || !sphereOnLine) return;

      raycaster.setFromCamera(pointer.current, camera);
      const intersects = raycaster.intersectObject(obj) as LineIntersection[];

      if (intersects.length > 0) {
        const hit = intersects[0];

        sphereInter.visible = true;
        sphereOnLine.visible = true;
        sphereInter.position.copy(hit.point);
        sphereOnLine.position.copy(hit.pointOnLine);

        const colors = obj.geometry.getAttribute('instanceColorStart');
        if (colors && hit.faceIndex != null) hitColor.fromBufferAttribute(colors, hit.faceIndex);

        (sphereInter.material as MeshBasicMaterial).color.copy(hitColor).offsetHSL(0.3, 0, 0);
        (sphereOnLine.material as MeshBasicMaterial).color.copy(hitColor).offsetHSL(0.7, 0, 0);

        gl.domElement.style.cursor = 'crosshair';
      } else {
        sphereInter.visible = false;
        sphereOnLine.visible = false;
        gl.domElement.style.cursor = '';
      }
    },
    { phase: 'update' },
  );

  return (
    <>
      <mesh ref={sphereInterRef} visible={false} renderOrder={10}>
        <sphereGeometry args={[0.25, 8, 4]} />
        <meshBasicMaterial color="#ff0000" depthTest={false} />
      </mesh>
      <mesh ref={sphereOnLineRef} visible={false} renderOrder={10}>
        <sphereGeometry args={[0.25, 8, 4]} />
        <meshBasicMaterial color="#00ff00" depthTest={false} />
      </mesh>
    </>
  );
}
