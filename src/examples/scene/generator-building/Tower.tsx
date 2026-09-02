// Tower — the procedural skyscraper itself. `SkyscraperGenerator` builds a fresh mesh
// on every committed parameter, so the previous geometry is disposed on the way out
// (the generator doesn't reuse or self-dispose the way TerrainGenerator does — see
// custom-fog/TerrainForest.tsx for that contrasting case). The facade material is
// built ONCE and shared across rebuilds: `baseColor` is a live `uniform(Color)`, so a
// seed change repicks the masonry tint with zero shader recompile.
import { useEffect, useMemo } from 'react';
import { Color } from 'three/webgpu';
import {
  createSkyscraperMaterial,
  pickBuildingColor,
  SkyscraperGenerator,
} from 'three/addons/generators/city/SkyscraperGenerator.js';

import { useUniforms } from '@react-three/fiber/webgpu';

export interface TowerProps {
  seed: number;
  height: number;
  width: number;
  depth: number;
  floorHeight: number;
  bayWidth: number;
  chamfer: number;
  setback: number;
}

export function Tower({ seed, height, width, depth, floorHeight, bayWidth, chamfer, setback }: TowerProps) {
  const { baseColor } = useUniforms({ baseColor: new Color(pickBuildingColor(seed)) });

  // `baseColor` is create-if-not-exists (stable identity, `.value` mutated in place) —
  // listed for the lint rule, not because this rebuilds when it "changes".
  const material = useMemo(() => createSkyscraperMaterial(baseColor), [baseColor]);

  const building = useMemo(() => {
    const generator = new SkyscraperGenerator(
      {
        seed,
        totalHeight: height,
        footprint: { width, depth },
        floorHeight,
        bayWidth,
        chamferWidth: chamfer,
        setbackDepth: setback,
      },
      material,
    );
    const mesh = generator.build();
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }, [material, seed, height, width, depth, floorHeight, bayWidth, chamfer, setback]);

  // Each rebuild makes a fresh generator/mesh — the old geometry needs disposing by
  // hand (pattern: reflection/Tree.tsx).
  useEffect(() => () => building.geometry.dispose(), [building]);

  return <primitive object={building} />;
}
