/**
 * modifier-edgesplit
 * The Cerberus gun with `EdgeSplitModifier`: vertices are split wherever neighbouring
 * faces meet at more than the cut-off angle, so smooth shading keeps its hard edges.
 * Toggle it off to see the whole gun blur into one smooth blob.
 * Original: https://threejs.org/examples/#webgl_modifier_edgesplit
 *
 * DEMONSTRATES
 * - A CPU-side modifier that returns a NEW `BufferGeometry` each time its inputs change,
 *   held in a `useMemo` keyed on the leva values and handed to `<mesh geometry>` — the
 *   original's `mesh.geometry = getGeometry()` + manual `render()` calls, collapsed
 * - `mergeVertices` first: the OBJ is unindexed (every triangle owns its vertices), and
 *   the modifier can only find shared edges in an indexed geometry
 * - `flatShading` and `map` toggled as plain material props — the WebGPU renderer hashes
 *   material state into its pipeline cache key, so there is no `needsUpdate` to set
 * - Controls next to the mesh that consumes them, so no page-level state
 */
import { Suspense, useEffect, useMemo } from 'react';
import { NoToneMapping, SRGBColorSpace } from 'three/webgpu';
import type { Mesh } from 'three/webgpu';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { EdgeSplitModifier } from 'three/addons/modifiers/EdgeSplitModifier.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Canvas, useLoader } from '@react-three/fiber/webgpu';
import { useTexture } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/obj/cerberus/Cerberus.obj';
const MAP_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/obj/cerberus/Cerberus_A.jpg';

function Cerberus() {
  const { showMap, smoothShading, edgeSplit, cutOffAngle, tryKeepNormals } = useControls('Edge split modifier', {
    showMap: false,
    smoothShading: true,
    edgeSplit: true,
    cutOffAngle: { value: 20, min: 0, max: 180 },
    tryKeepNormals: true,
  });

  const group = useLoader(OBJLoader, MODEL_URL);
  const map = useTexture(MAP_URL);

  useEffect(() => {
    map.colorSpace = SRGBColorSpace;
  }, [map]);

  // The OBJ is a Group around one Mesh. Index it once so the modifier can see which
  // triangles share a vertex — that adjacency is what "edge" means to it.
  const baseGeometry = useMemo(() => mergeVertices((group.children[0] as Mesh).geometry), [group]);

  // Each change produces a fresh geometry; `useMemo` on the inputs is the right tool for
  // a runtime instance that has to be rebuilt, not just updated.
  const geometry = useMemo(
    () =>
      edgeSplit
        ? new EdgeSplitModifier().modify(baseGeometry, (cutOffAngle * Math.PI) / 180, tryKeepNormals)
        : baseGeometry,
    [baseGeometry, edgeSplit, cutOffAngle, tryKeepNormals],
  );

  // `rotateY(-π/2)` then `translateZ(1.5)` in the original: local +z is world -x by then.
  return (
    <mesh geometry={geometry} rotation-y={-Math.PI / 2} scale={3.5} position-x={-1.5}>
      <meshStandardNodeMaterial map={showMap ? map : null} flatShading={!smoothShading} />
    </mesh>
  );
}

export default function ModifierEdgesplit() {
  return (
    <Canvas renderer={{ toneMapping: NoToneMapping }} camera={{ position: [0, 0, 4], fov: 75 }}>
      <hemisphereLight color="#ffffff" groundColor="#444444" intensity={3} />
      <Suspense fallback={null}>
        <Cerberus />
      </Suspense>
      {/* Grid off: the gun sits on the origin and a ground plane would slice through it. */}
      <DemoHelpers grid={false} minDistance={1} />
    </Canvas>
  );
}
