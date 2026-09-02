// React wiring for the linked-particle system: leva knobs, the storage buffers, the
// per-frame dispatch, and the two meshes that draw the buffers (instanced sprites for
// the particles, one indexed BufferGeometry for the links).
import { useEffect, useState } from 'react';
import { instancedArray, storage } from 'three/tsl';
import {
  AdditiveBlending,
  BufferAttribute,
  DoubleSide,
  Plane,
  Raycaster,
  StorageBufferAttribute,
  Vector3,
} from 'three/webgpu';
import { useBuffers, useFrame, useNodes, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';
import { createLinkIndices, createParticleGraph, LINK_VERTEX_COUNT, PARTICLE_COUNT } from './particleGraph';

export function LinkedParticles() {
  const renderer = useThree((state) => state.renderer);

  //* Controls =====================================================
  const { timeScale, colorRotationSpeed, ...particle } = useControls('particles', {
    timeScale: { value: 1, min: 0, max: 4, step: 0.01 },
    spawnRate: { value: 5, min: 1, max: 100, step: 1 },
    particleSize: { value: 1, min: 0.01, max: 3, step: 0.01, label: 'size' },
    particleLifetime: { value: 0.5, min: 0.01, max: 2, step: 0.01, label: 'lifetime' },
    linksWidth: { value: 0.005, min: 0.001, max: 0.1, step: 0.001, label: 'links width' },
    colorVariance: { value: 2, min: 0, max: 10, step: 0.01, label: 'color variance' },
    colorRotationSpeed: { value: 1, min: 0, max: 5, step: 0.01, label: 'color rotation' },
  });

  const turbulence = useControls('turbulence', {
    turbFriction: { value: 0.01, min: 0, max: 0.3, step: 0.01, label: 'friction' },
    turbFrequency: { value: 0.5, min: 0, max: 1, step: 0.01, label: 'frequency' },
    turbAmplitude: { value: 0.5, min: 0, max: 10, step: 0.01, label: 'amplitude' },
    turbOctaves: { value: 2, min: 1, max: 9, step: 1, label: 'octaves' },
    turbLacunarity: { value: 2, min: 1, max: 5, step: 0.01, label: 'lacunarity' },
    turbGain: { value: 0.5, min: 0, max: 1, step: 0.01, label: 'gain' },
  });

  const uniforms = useUniforms({ timeScale, ...particle, ...turbulence });

  //* GPU state ====================================================
  // Root-level (unscoped) keys: a scoped useBuffers name is `${scope}.${name}` and the
  // dot ends up in the WGSL struct name (UPSTREAM B16) — prefix instead.
  // The link attributes are real BufferAttributes the geometry below binds, so they
  // live here too rather than in a lazy useState: a create-once hook would keep
  // StrictMode's FIRST instance while the JSX committed the SECOND.
  const { linkedPositions, linkedVelocities, linkedLinkVertices, linkedLinkColors, linkedLinkIndices } = useBuffers(
    () => ({
      linkedPositions: instancedArray(PARTICLE_COUNT, 'vec4'),
      linkedVelocities: instancedArray(PARTICLE_COUNT, 'vec4'),
      linkedLinkVertices: new StorageBufferAttribute(LINK_VERTEX_COUNT, 4),
      linkedLinkColors: new StorageBufferAttribute(LINK_VERTEX_COUNT, 4),
      linkedLinkIndices: new BufferAttribute(createLinkIndices(), 1),
    }),
  );

  const graph = useNodes(() =>
    createParticleGraph(
      {
        positions: linkedPositions,
        velocities: linkedVelocities,
        linkPositions: storage(linkedLinkVertices, 'vec4', LINK_VERTEX_COUNT),
        linkColors: storage(linkedLinkColors, 'vec4', LINK_VERTEX_COUNT),
      },
      uniforms,
    ),
  );

  // Cursor tracking: the emitter sits where the camera ray meets a plane through the
  // origin that always faces the camera.
  const [pointerRig] = useState(() => ({
    raycaster: new Raycaster(),
    plane: new Plane(new Vector3(0, 0, 1), 0),
    scenePointer: new Vector3(),
  }));

  // Seed every slot dead, once. Idempotent, so StrictMode's double-run is harmless.
  useEffect(() => {
    renderer.compute(graph.computeInit);
  }, [renderer, graph.computeInit]);

  useFrame(
    ({ camera, pointer, delta }) => {
      renderer.compute(graph.computeUpdate);
      renderer.compute(graph.computeSpawn);
      graph.spawnIndex.value = (graph.spawnIndex.value + particle.spawnRate) % PARTICLE_COUNT;

      const { raycaster, plane, scenePointer } = pointerRig;
      plane.normal.set(0, 0, 1).applyEuler(camera.rotation);
      raycaster.setFromCamera(pointer, camera);
      raycaster.ray.intersectPlane(plane, scenePointer);

      // Lerped so the emitter trails the cursor; the spawn kernel interpolates
      // between the two positions to fill the gap.
      graph.previousSpawnPosition.value.copy(graph.spawnPosition.value);
      graph.spawnPosition.value.lerp(scenePointer, 0.1);

      graph.colorOffset.value += delta * colorRotationSpeed * timeScale;
    },
    { phase: 'update' },
  );

  return (
    <>
      {/* Positions live only in the storage buffer, so three's culling sphere (built
          from the unit quad at the origin) knows nothing — culling must be off. */}
      <sprite count={PARTICLE_COUNT} frustumCulled={false}>
        <spriteNodeMaterial
          positionNode={graph.spritePositionNode}
          scaleNode={graph.spriteScaleNode}
          rotationNode={graph.spriteRotationNode}
          colorNode={graph.spriteColorNode}
          opacityNode={graph.spriteOpacityNode}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </sprite>

      {/* The link ribbons: a static index buffer over vertices the compute kernel
          rewrites every frame. RGB rides the vertex colours, alpha the storage read. */}
      <mesh frustumCulled={false}>
        <bufferGeometry>
          <primitive object={linkedLinkVertices} attach="attributes-position" />
          <primitive object={linkedLinkColors} attach="attributes-color" />
          <primitive object={linkedLinkIndices} attach="index" />
        </bufferGeometry>
        <meshBasicNodeMaterial
          vertexColors
          side={DoubleSide}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={AdditiveBlending}
          opacityNode={graph.linkOpacityNode}
        />
      </mesh>
    </>
  );
}
