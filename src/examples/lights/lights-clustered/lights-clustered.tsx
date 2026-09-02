/**
 * lights-clustered
 * Forward+ clustered lighting: the view frustum is chopped into a 3D grid of clusters
 * so ~800 point lights stay cheap — a debug overlay tints each screen tile by how many
 * lights its cluster actually holds.
 * Original: https://threejs.org/examples/#webgpu_lights_clustered
 *
 * DEMONSTRATES
 * - `renderer.lighting = new ClusteredLighting()`, installed from the Canvas's
 *   `onCreated`: an opt-in lighting backend replacing the default per-fragment light
 *   loop. It has to be in place before the FIRST render list is built — three caches
 *   the scene's lights node in a module-level WeakMap at that moment, and a Canvas
 *   child's layout effect runs after it
 * - `lighting.getNode(scene).getClusterLightCount(zSliceNode)`: reading the cluster
 *   grid's own light count back into a TSL expression for a heatmap overlay, blended
 *   over the beauty pass by a leva-driven `useRenderPipeline` (AGENTS.md pattern (a) —
 *   plain uniforms we introduce, no cast)
 * - One `InstancedMesh` of ~800 unlit, per-instance-colored spheres (BallField.tsx)
 *   standing in for ~800 REAL `PointLight`s — exactly the light count clustered
 *   shading exists to make cheap
 * - A physical sky (`SkyMesh`) baked into `scene.environment` via `PMREMGenerator`
 *   from an isolated one-mesh scene (Environment.tsx), same idiom as `custom-fog`
 *
 * DIVERGENCE from original
 * - `renderer.inspector` dat.gui-style panel -> leva, same three knobs (light
 *   intensity, animate, lights-per-tile) plus the z-slice picker
 * - `lighting.getNode(scene)` is typed to return the BASE `LightsNode` (inherited,
 *   unnarrowed by TS even though the runtime instance is `ClusteredLightsNode`) — a
 *   narrowing cast recovers `.setSize()`/`.getClusterLightCount()`, both real methods
 *   `ClusteredLightsNode`'s own `.d.ts` declares
 */
import { useCallback, useState } from 'react';
import { NeutralToneMapping, WebGPURenderer } from 'three/webgpu';
import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';

import { Canvas } from '@react-three/fiber/webgpu';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { BallField } from './BallField';
import { ClusteredPipeline } from './ClusteredPipeline';
import { Environment } from './Environment';

export default function LightsClustered() {
  // three caches a scene's lights node in a MODULE-level WeakMap the first time a render
  // list is built (`Lighting.getNode`), and whichever manager is installed at that moment
  // owns it permanently. That happens before ANY React code here: measured, a Canvas
  // child's layout effect runs before `onCreated`, and both are already too late — the
  // default `Lighting` has cached a plain `LightsNode`, so `getNode()` keeps handing that
  // one back and clustered shading never engages (UPSTREAM B41).
  // The renderer FACTORY is the only hook that runs first, so the manager goes on at
  // construction, exactly as the vanilla original does it.
  const [lighting] = useState(() => new ClusteredLighting());
  const createRenderer = useCallback(
    (props: object) => {
      const renderer = new WebGPURenderer(props);
      renderer.toneMapping = NeutralToneMapping; // an instance field, not a ctor parameter
      renderer.lighting = lighting;
      return renderer;
    },
    [lighting],
  );

  return (
    <Canvas renderer={createRenderer} camera={{ position: [36, 18, 36], fov: 50, near: 1, far: 20000 }}>
      <Environment />
      <BallField />
      <ClusteredPipeline lighting={lighting} />
      <DemoHelpers grid={false} target={[0, 6, 0]} minDistance={4} maxDistance={400} maxPolarAngle={Math.PI * 0.49} />
    </Canvas>
  );
}
