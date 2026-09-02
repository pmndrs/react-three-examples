// City — a few blocks of `CityGenerator` towers over a road grid. The generator
// instance and its layout are built ONCE (block/street counts don't depend on seed);
// only `city.build()` — the placement and per-tower geometry — reruns on a seed
// change, and `build()` disposes its own previous output internally (pattern:
// custom-fog/TerrainForest.tsx). The building material is also built once, from
// whatever seed was live at mount: the original never rebuilds it on later seed
// changes either, so a new seed reshuffles the skyline but keeps the same palette —
// preserved here rather than "fixed".
import { useMemo, useState } from 'react';
import { CityGenerator, createBuildingMaterial, createRoadMaterial } from 'three/addons/generators/CityGenerator.js';

export function City({ seed }: { seed: number }) {
  // Captured once — the generator's layout and the building material are both built
  // from whichever seed was live at mount (see header comment); later seed changes
  // flow only into `city.parameters.seed` below, never re-run these two.
  const [initialSeed] = useState(seed);
  const city = useMemo(() => new CityGenerator({ seed: initialSeed }), [initialSeed]); // layout is fixed at construction
  const buildingMaterial = useMemo(() => createBuildingMaterial(city.layout, initialSeed), [city, initialSeed]);
  const roadMaterial = useMemo(() => createRoadMaterial(city.layout), [city]);

  const cityGroup = useMemo(() => {
    city.parameters.seed = seed;
    return city.build({ building: buildingMaterial });
  }, [city, buildingMaterial, seed]);

  const floorW = city.layout.cityW + 2 * city.layout.street;
  const floorD = city.layout.cityD + 2 * city.layout.street;

  return (
    <>
      <primitive object={cityGroup} />
      <mesh rotation-x={-Math.PI / 2} material={roadMaterial} receiveShadow>
        <planeGeometry args={[floorW, floorD]} />
      </mesh>
    </>
  );
}
