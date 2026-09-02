// MultiViewport — the render-takeover loop this example is about: forty independent
// vanilla scenes, ONE real canvas, each scene drawn into the viewport/scissor rect of
// its own DOM placeholder (an ordinary list item scrolling in the overlay above the
// canvas). None of this can be expressed as a normal R3F scene graph — there is no
// single "the scene", just forty of them sharing a device — so it stays fully
// imperative on purpose (Layer 1's documented escape hatch), one `phase: 'render'`
// takeover owning the whole loop (pattern: `lines-fat/InsetView.tsx`).
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { useFrame, useThree } from '@react-three/fiber/webgpu';

interface SceneEntry {
  scene: Scene;
  camera: PerspectiveCamera;
  mesh: Mesh;
}

function buildScenes(count: number): SceneEntry[] {
  // Four geometries, built once and shared by reference across every scene that picks
  // them (never cloned) — same shared-instance choice as the original.
  const geometries = [
    new BoxGeometry(1, 1, 1),
    new SphereGeometry(0.5, 12, 8),
    new DodecahedronGeometry(0.5),
    new CylinderGeometry(0.5, 0.5, 1, 12),
  ];

  return Array.from({ length: count }, () => {
    const scene = new Scene();
    scene.background = new Color(0xeeeeee);

    const camera = new PerspectiveCamera(50, 1, 1, 10);
    camera.position.z = 2;

    const geometry = geometries[(geometries.length * Math.random()) | 0];
    const material = new MeshStandardMaterial({
      color: new Color().setHSL(Math.random(), 1, 0.75),
      roughness: 0.5,
      metalness: 0,
      flatShading: true,
    });
    const mesh = new Mesh(geometry, material);
    scene.add(mesh);

    scene.add(new HemisphereLight(0xaaaaaa, 0x444444, 3));
    const light = new DirectionalLight(0xffffff, 1.5);
    light.position.set(1, 1, 1);
    scene.add(light);

    return { scene, camera, mesh };
  });
}

export interface MultiViewportProps {
  /** One DOM placeholder per scene — populated by the overlay list before this
   * component's effects run (refs across a committed tree attach before any effect
   * runs, regardless of nesting). */
  itemRefs: RefObject<(HTMLDivElement | null)[]>;
  count: number;
}

export function MultiViewport({ itemRefs, count }: MultiViewportProps) {
  const renderer = useThree((state) => state.renderer);
  const [entries] = useState(() => buildScenes(count));

  // Rotate-only orbit per scene, bound to that scene's OWN placeholder div — not the
  // shared canvas, which every scene draws into (same reasoning as multiple-canvas's
  // ThumbnailOrbit, one canvas instead of forty).
  useEffect(() => {
    const controls = entries.map(({ camera }, i) => {
      const element = itemRefs.current[i];
      if (!element) return null;
      const orbit = new OrbitControls(camera, element);
      orbit.minDistance = 2;
      orbit.maxDistance = 5;
      orbit.enablePan = false;
      orbit.enableZoom = false;
      return orbit;
    });
    return () => {
      for (const orbit of controls) orbit?.dispose();
    };
  }, [entries, itemRefs]);

  useFrame(
    (state) => {
      const canvasRect = renderer.domElement.getBoundingClientRect();

      renderer.setClearColor(0xffffff);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, state.size.width, state.size.height);
      renderer.clear();
      renderer.setScissorTest(true);

      for (let i = 0; i < entries.length; i++) {
        const { scene, camera, mesh } = entries[i];
        mesh.rotation.y = state.elapsed * 0.5; // so something moves, matching the original

        const element = itemRefs.current[i];
        if (!element) continue;
        const rect = element.getBoundingClientRect();

        // Off-screen relative to the CANVAS's own bounds (not the document viewport —
        // this canvas doesn't necessarily start at (0, 0), unlike the original's).
        if (
          rect.bottom < canvasRect.top ||
          rect.top > canvasRect.bottom ||
          rect.right < canvasRect.left ||
          rect.left > canvasRect.right
        ) {
          continue;
        }

        const left = rect.left - canvasRect.left;
        const top = rect.top - canvasRect.top; // WebGPU's setViewport/setScissor is TOP-origin — no flip needed
        const width = rect.right - rect.left;
        const height = rect.bottom - rect.top;

        renderer.setViewport(left, top, width, height);
        renderer.setScissor(left, top, width, height);
        renderer.render(scene, camera);
      }
    },
    { phase: 'render' },
  );

  return null;
}
