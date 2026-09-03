// The scattered flowers: two InstancedMeshes (stem + blossom) whose transforms come
// from MeshSurfaceSampler, plus the per-instance grow/hold/shrink lifecycle that
// resamples a flower the instant it fully shrinks away.
import { useEffect, useMemo, useRef } from 'react';
import { Color, Matrix4, Object3D, Vector3 } from 'three/webgpu';
import type { BufferGeometry, InstancedMesh, Material, Mesh } from 'three/webgpu';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { useFrame } from '@react-three/fiber/webgpu';
import { useGLTF } from '@react-three/drei/webgpu';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples';
const FLOWER_URL = `${ASSETS}/models/gltf/Flower/Flower.glb`;

const COUNT = 2000;
const BLOSSOM_PALETTE = ['#f20587', '#f2d479', '#f2c879', '#f2b077', '#f24405'];

// Source: https://gist.github.com/gre/1650294
function easeOutCubic(t: number): number {
  const s = t - 1;
  return s * s * s + 1;
}

// Grows quickly, holds near full scale, then shrinks quickly — more of a flower's
// lifetime is spent visibly open than opening or closing.
function scaleCurve(t: number): number {
  return Math.abs(easeOutCubic((t > 0.5 ? 1 - t : t) * 2));
}

interface FlowersProps {
  surfaceMesh: Mesh | null;
  liveCount: number;
  distribution: 'random' | 'weighted';
  resampleNonce: number;
}

export function Flowers({ surfaceMesh, liveCount, distribution, resampleNonce }: FlowersProps) {
  const { scene } = useGLTF(FLOWER_URL);

  const { stemGeometry, blossomGeometry, stemMaterial, blossomMaterial } = useMemo(() => {
    const stem = scene.getObjectByName('Stem') as Mesh;
    const blossom = scene.getObjectByName('Blossom') as Mesh;

    // The original's baked transform: point the model the right way up and blow it up
    // to scatter-scale, applied once to the geometry rather than every instance.
    const bake = new Matrix4().makeRotationX(Math.PI).multiply(new Matrix4().makeScale(7, 7, 7));

    const stemGeo = (stem.geometry as BufferGeometry).clone().applyMatrix4(bake);
    const blossomGeo = (blossom.geometry as BufferGeometry).clone().applyMatrix4(bake);

    return {
      stemGeometry: stemGeo,
      blossomGeometry: blossomGeo,
      stemMaterial: stem.material as Material,
      blossomMaterial: blossom.material as Material,
    };
  }, [scene]);

  const stemRef = useRef<InstancedMesh>(null);
  const blossomRef = useRef<InstancedMesh>(null);

  // Per-instance lifecycle state — a plain typed array, not React state: 2000 values
  // updated every frame would make the render loop the bottleneck.
  const ages = useRef(new Float32Array(COUNT));
  const scales = useRef(new Float32Array(COUNT));
  const dummy = useRef(new Object3D());
  const samplerRef = useRef<MeshSurfaceSampler | null>(null);

  const resampleParticle = (i: number) => {
    const sampler = samplerRef.current;
    const stem = stemRef.current;
    const blossom = blossomRef.current;
    if (!sampler || !stem || !blossom) return;

    const position = new Vector3();
    const normal = new Vector3();
    sampler.sample(position, normal);
    normal.add(position);

    dummy.current.position.copy(position);
    dummy.current.scale.setScalar(scales.current[i]);
    dummy.current.lookAt(normal);
    dummy.current.updateMatrix();

    stem.setMatrixAt(i, dummy.current.matrix);
    blossom.setMatrixAt(i, dummy.current.matrix);
  };

  const resampleAll = () => {
    const stem = stemRef.current;
    const blossom = blossomRef.current;
    if (!stem || !blossom || !samplerRef.current) return;
    for (let i = 0; i < COUNT; i++) {
      ages.current[i] = Math.random();
      scales.current[i] = scaleCurve(ages.current[i]);
      resampleParticle(i);
    }
    stem.instanceMatrix.needsUpdate = true;
    blossom.instanceMatrix.needsUpdate = true;
  };

  // Rebuilds the sampler whenever the surface mesh or its weighting scheme changes,
  // then does a full resample — mirrors the original's `resample()`.
  useEffect(() => {
    if (!surfaceMesh || !stemRef.current || !blossomRef.current) return;
    const sampler = new MeshSurfaceSampler(surfaceMesh)
      .setWeightAttribute(distribution === 'weighted' ? 'uv' : null)
      .build();
    samplerRef.current = sampler;
    resampleAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resampleAll closes over refs only
  }, [surfaceMesh, distribution, resampleNonce]);

  // Blossom instance colours: assigned once at creation, a GPU attribute rather than
  // something JSX can express per-index.
  useEffect(() => {
    const blossom = blossomRef.current;
    if (!blossom) return;
    const color = new Color();
    for (let i = 0; i < COUNT; i++) {
      color.set(BLOSSOM_PALETTE[Math.floor(Math.random() * BLOSSOM_PALETTE.length)]);
      blossom.setColorAt(i, color);
    }
    if (blossom.instanceColor) blossom.instanceColor.needsUpdate = true;
  }, [blossomGeometry]);

  useEffect(() => {
    if (stemRef.current) stemRef.current.count = liveCount;
    if (blossomRef.current) blossomRef.current.count = liveCount;
  }, [liveCount]);

  const scaleScratch = useRef(new Vector3());
  useFrame(() => {
    const stem = stemRef.current;
    const blossom = blossomRef.current;
    if (!stem || !blossom || !samplerRef.current) return;

    for (let i = 0; i < liveCount; i++) {
      ages.current[i] += 0.005;

      if (ages.current[i] >= 1) {
        ages.current[i] = 0.001;
        scales.current[i] = scaleCurve(ages.current[i]);
        resampleParticle(i);
        continue;
      }

      const prevScale = scales.current[i];
      scales.current[i] = scaleCurve(ages.current[i]);
      const ratio = scales.current[i] / prevScale;
      scaleScratch.current.setScalar(ratio);

      stem.getMatrixAt(i, dummy.current.matrix);
      dummy.current.matrix.scale(scaleScratch.current);
      stem.setMatrixAt(i, dummy.current.matrix);
      blossom.setMatrixAt(i, dummy.current.matrix);
    }

    stem.instanceMatrix.needsUpdate = true;
    blossom.instanceMatrix.needsUpdate = true;
    stem.computeBoundingSphere();
    blossom.computeBoundingSphere();
  });

  return (
    <>
      <instancedMesh ref={stemRef} args={[stemGeometry, stemMaterial, COUNT]} />
      <instancedMesh ref={blossomRef} args={[blossomGeometry, blossomMaterial, COUNT]} />
    </>
  );
}
