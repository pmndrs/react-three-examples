// Two independent `WebGPURenderer` instances (two `<Canvas>`, one per depth-buffer
// mode — see the entry file) can't share a single `THREE.Camera` the way the
// original's two-renderer setup copies one pose into the other. `CameraDriver`
// (mounted in the "normal" pane) computes the dolly-zoom + mouse-sway pose and
// writes it into a plain `Vector3`; `CameraFollower` (mounted in the "logzbuf"
// pane) copies it every frame. Both panes always look at the origin, so position
// alone is enough — no quaternion to keep in sync.
import { useEffect, useRef } from 'react';
import { MathUtils } from 'three/webgpu';
import type { Vector3 } from 'three/webgpu';
import { useFrame } from '@react-three/fiber/webgpu';
import { MAX_ZOOM, MIN_ZOOM } from './LogDepthScene';

interface ZoomState {
  pos: number;
  speed: number;
  minSpeed: number;
}

interface CameraRigProps {
  pose: Vector3;
}

// Pointer/wheel are tracked at the WINDOW level, not fiber's per-canvas
// `state.pointer` — the drag spans two independent canvases side by side, exactly
// the multi-canvas case AGENTS.md calls out as needing a manual event listener.
export function CameraDriver({ pose }: CameraRigProps) {
  const mouse = useRef<[number, number]>([0.5, 0.5]);
  const zoom = useRef<ZoomState>({ pos: -100, speed: 0.015, minSpeed: 0.015 });

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      mouse.current = [event.clientX / window.innerWidth, event.clientY / window.innerHeight];
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      zoom.current.speed = Math.sign(event.deltaY) / 10;
      // Slow down the default pace once the user takes over — same as the original.
      zoom.current.minSpeed = 0.001;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('wheel', onWheel);
    };
  }, []);

  useFrame(({ camera }) => {
    const z = zoom.current;
    let damping = Math.abs(z.speed) > z.minSpeed ? 0.95 : 1.0;

    // Zoom out faster the further out you go: exponential position, logged back.
    const distance = MathUtils.clamp(Math.pow(Math.E, z.pos), MIN_ZOOM, MAX_ZOOM);
    z.pos = Math.log(distance);

    // Slow down hard right at either zoom limit.
    if ((distance === MIN_ZOOM && z.speed < 0) || (distance === MAX_ZOOM && z.speed > 0)) damping = 0.85;

    z.pos += z.speed;
    z.speed *= damping;

    const [mouseX, mouseY] = mouse.current;
    camera.position.x = Math.sin(0.5 * Math.PI * (mouseX - 0.5)) * distance;
    camera.position.y = Math.sin(0.25 * Math.PI * (mouseY - 0.5)) * distance;
    camera.position.z = Math.cos(0.5 * Math.PI * (mouseX - 0.5)) * distance;
    camera.lookAt(0, 0, 0);

    pose.copy(camera.position);
  });

  return null;
}

// Mounted in the second pane: just mirrors the driver's pose every frame.
export function CameraFollower({ pose }: CameraRigProps) {
  useFrame(({ camera }) => {
    camera.position.copy(pose);
    camera.lookAt(0, 0, 0);
  });
  return null;
}
