// Forest — the fogged pine stand: six seeded `TreeGenerator` variants, instanced
// across a jittered 13x12 grid, two "hero" trunks close to the camera to anchor the
// depth, and a ground plane. Every mesh shares ONE unlit black material — the fog and
// the post-processing scattering blur do all the shading, so nothing here is lit.
// Built once (no controls the original doesn't have) — same imperative-subtree
// pattern as custom-fog/TerrainForest.tsx.
import { useMemo } from 'react';
import { TreeGenerator } from 'three/addons/generators/TreeGenerator.js';
import { Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry } from 'three/webgpu';

const COLS = 13;
const ROWS = 12;
const SPACING = 1.9;
const VARIANT_COUNT = 6;

function buildForest() {
  // Everything is a flat black silhouette — see header comment.
  const material = new MeshBasicMaterial({ color: 0x000000 });
  const generator = new TreeGenerator(material);

  // Six seeded variants of a tall scots pine: a clean bole rising into a high, open
  // crown of fine bare branches.
  const geometries = Array.from(
    { length: VARIANT_COUNT },
    (_, v) =>
      generator
        .setSeed(v + 1)
        .setTrunkLength(2.6 + v * 0.3) // the crowns ride high in the fog
        .setTrunkRadius(0.06)
        .setTaper(0.28) // slender, tapers slowly
        .setLevels(4)
        .setChildren([7, 5, 4]) // a wide whorl of limbs ramifying into many fine twigs
        .setBranchAngle([55, 50, 46]) // a rounded crown that turns up
        .setAngleVariance(22)
        .setLengthRatio(0.46) // short crown limbs (a modest pine crown)
        .setMinLength(0.04)
        .setDroop(0.05)
        .setUpPull(0.42) // crown branches reach up toward the light
        .setGnarl([0, 0.14, 0.24, 0.34]) // dead-straight trunk, wispier twigs
        .setSectionLength(0.34)
        .setRadialSegments(7)
        .setRadiusExponent(2.5) // slender bole, whippy thin twigs
        .setMinRadius(0.0023) // very fine twigs
        .setTrunkClear(0.72) // tall clean bole; the crown sits only at the top
        .build().geometry,
  );

  // Scatter each variant across a jittered grid, one Matrix4 per placement.
  const placements: Matrix4[][] = geometries.map(() => []);
  const dummy = new Object3D();

  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      const v = Math.floor(Math.random() * geometries.length);

      const x = (i - COLS / 2) * SPACING + (Math.random() - 0.5) * SPACING * 0.8;
      const z = j * SPACING - ROWS * SPACING + 4.2 + (Math.random() - 0.5) * SPACING * 0.8;
      dummy.position.set(x, 0, z);

      const scale = 0.85 + Math.random() * 0.4;
      dummy.rotation.set((Math.random() - 0.5) * 0.05, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.05); // slight lean
      dummy.scale.set(scale, scale * (0.9 + Math.random() * 0.3), scale);
      dummy.updateMatrix();

      placements[v].push(dummy.matrix.clone());
    }
  }

  const group = new Group();

  geometries.forEach((geometry, v) => {
    const list = placements[v];
    const mesh = new InstancedMesh(geometry, material, list.length);
    for (let k = 0; k < list.length; k++) mesh.setMatrixAt(k, list[k]);
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  });

  // A couple of dominant trunks close to the camera to anchor the depth.
  const lastGeometry = geometries[geometries.length - 1];
  for (const [x, z, s, ry] of [
    [-1.1, 4.9, 1.5, 1.1],
    [1.5, 4, 1.2, 0.3],
  ]) {
    const hero = new Mesh(lastGeometry, material);
    hero.position.set(x, 0, z);
    hero.rotation.y = ry;
    hero.scale.setScalar(s);
    group.add(hero);
  }

  const ground = new Mesh(new PlaneGeometry(600, 600).rotateX(-Math.PI / 2), material);
  group.add(ground);

  return group;
}

export function Forest() {
  const forestGroup = useMemo(() => buildForest(), []);
  return <primitive object={forestGroup} />;
}
