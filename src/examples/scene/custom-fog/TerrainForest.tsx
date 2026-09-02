// TerrainForest — the procedural alpine valley and the 500,000-tree instanced forest
// carpeting it (one draw call). Both generator instances are memoized once; a
// committed parameter change re-runs the bake — generator.build() disposes its own
// previous geometry, so rebuilds (and StrictMode double-invocation) don't leak.
import { useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { ForestGenerator } from 'three/addons/generators/ForestGenerator.js';
import { TerrainGenerator } from 'three/addons/generators/TerrainGenerator.js';
import type { DirectionalLight } from 'three/webgpu';

import { useFrame } from '@react-three/fiber/webgpu';
import { folder, useControls } from 'leva';

export interface TerrainForestProps {
  /** The key light — rebuilt geometry means its on-demand shadow map needs one refresh. */
  sunRef: RefObject<DirectionalLight | null>;
}

export function TerrainForest({ sunRef }: TerrainForestProps) {
  // The full bake is ~0.8s of synchronous CPU — seed/erosion/valleyBias commit on
  // slider RELEASE (`onEditEnd`) into this staged state, never on every drag tick.
  const [baked, setBaked] = useState({ seed: 1, erosion: 0.7, valleyBias: 1.2 });

  const { cullFrom, cullTo } = useControls('custom-fog', {
    forest: folder({
      cullFrom: { value: 300, min: 50, max: 1000, step: 10 }, // distance within which every tree is drawn
      cullTo: { value: 620, min: 100, max: 1400, step: 10 }, // distance past which no tree is drawn
    }),
    terrain: folder({
      seed: {
        value: 1,
        min: 1,
        max: 50,
        step: 1,
        onEditEnd: (v: number) => setBaked((s) => ({ ...s, seed: v })),
      },
      erosion: {
        value: 0.7,
        min: 0,
        max: 1.5,
        step: 0.05,
        onEditEnd: (v: number) => setBaked((s) => ({ ...s, erosion: v })),
      },
      valleyBias: {
        value: 1.2,
        min: 1,
        max: 3,
        step: 0.1,
        onEditEnd: (v: number) => setBaked((s) => ({ ...s, valleyBias: v })),
      },
    }),
  });

  const terrain = useMemo(
    () =>
      new TerrainGenerator({
        seed: 1,
        size: 900,
        segments: 512,
        frequency: 0.0065,
        heightScale: 150,
        erosion: 0.7,
        valleyBias: 1.2,
      }),
    [],
  );
  const forest = useMemo(() => new ForestGenerator({ count: 500000, castShadow: true }), []);

  // The bake: ~0.8s of synchronous CPU work, keyed on values the page commits only on
  // slider release. The forest sits on the terrain, so a new terrain means a new forest.
  const { terrainGroup, forestGroup } = useMemo(() => {
    terrain.parameters.seed = baked.seed;
    terrain.parameters.erosion = baked.erosion;
    terrain.parameters.valleyBias = baked.valleyBias;
    const terrainGroup = terrain.build();
    const forestGroup = forest.build(terrain);
    return { terrainGroup, forestGroup };
  }, [terrain, forest, baked]);

  // Rebuilt geometry ⇒ re-render the on-demand shadow map. On first mount the light
  // may not have attached yet — SunSky's own updateSun effect covers that one (the
  // original skips the first build the same way).
  useEffect(() => {
    if (sunRef.current) sunRef.current.shadow.needsUpdate = true;
  }, [sunRef, terrainGroup]);

  // Live cull band — uniform()-backed fields on the generator, mutated with no rebuild.
  useEffect(() => {
    forest.from.value = cullFrom;
    forest.to.value = cullTo;
  }, [forest, cullFrom, cullTo]);

  // Drive the stochastic distance cull from the real camera each frame. The addon
  // deliberately takes a plain uniform rather than the TSL cameraPosition built-in:
  // in the shadow pass that node resolves to the light, which would cull the wrong trees.
  useFrame((state) => {
    forest.setCameraPosition(state.camera.position);
  });

  return (
    <>
      <primitive object={terrainGroup} />
      <primitive object={forestGroup} />
    </>
  );
}
