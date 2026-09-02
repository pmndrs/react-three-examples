// The whole fire system: storage 3D textures + uniforms + compute kernels (fiber
// stores), the raymarched volume meshes, the emitting teapot (draggable), the fire
// point light, and the layered render pipeline (main pass + half-res volumetric pass
// -> denoise -> compose -> bloom). Controls and fiber hooks live together here,
// inside <Canvas>.
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { pass, saturation, storage, storageTexture, texture3D, vec4 } from 'three/tsl';
import {
  ClampToEdgeWrapping,
  HalfFloatType,
  Layers,
  LinearFilter,
  MathUtils,
  Matrix4,
  RepeatWrapping,
  RGBAFormat,
  Storage3DTexture,
  Vector3,
  type BufferAttribute,
  type Mesh,
  type Node,
  type PassNode,
  type PointLight,
  type SpotLight,
  type StorageTexture,
  type Wrapping,
} from 'three/webgpu';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { useFrame, useGPUStorage, useNodes, useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { DragControls } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import type CameraControlsImpl from 'camera-controls';
import { TeapotGeometry } from '../../../assets/TeapotGeometry';
import {
  FIRE_INTENSITY,
  FLOOR_Y,
  GRID_SIZE_X,
  GRID_SIZE_Y,
  GRID_SIZE_Z,
  KEY_LIGHT_POS,
  LAYER_VOLUMETRIC_LIGHTING,
  MAX_SUBSTEPS,
  PRESSURE_ITERATIONS,
  SIM_STEP,
  VOLUME_MESH_Y,
  VOLUME_WORLD_SIZE_X,
  VOLUME_WORLD_SIZE_Y,
  VOLUME_WORLD_SIZE_Z,
} from './constants';
import { createFireUniforms } from './fireUniforms';
import { createFluidKernels } from './fluidKernels';
import { createFireShading } from './fireShading';

// rgba16float 3D storage texture: storage-writable AND linearly filterable.
// Cast at the boundary: fiber's `StorageLike` union misses `Storage3DTexture`
// even though the compute docs show one being stored (fiber typing gap — the
// runtime handles it fine, it only needs `.dispose()`).
function createStorage3D(wrap: Wrapping = ClampToEdgeWrapping): StorageTexture {
  const texture = new Storage3DTexture(GRID_SIZE_X, GRID_SIZE_Y, GRID_SIZE_Z);
  texture.format = RGBAFormat;
  texture.type = HalfFloatType;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = wrap;
  texture.wrapT = wrap;
  texture.wrapR = wrap;
  return texture as unknown as StorageTexture;
}

export function VolumeFire({ cameraControlsRef }: { cameraControlsRef: RefObject<CameraControlsImpl | null> }) {
  //* Controls =====================================================
  const { simulate, simSpeed, turbulence, buoyancy, fireLifespan, smokeLifespan } = useControls(
    'volume-fire simulation',
    {
      simulate: true,
      simSpeed: { value: 1.2, min: 0, max: 2, step: 0.01 },
      turbulence: { value: 3.2, min: 0, max: 5, step: 0.05 },
      buoyancy: { value: 3.0, min: 0, max: 10, step: 0.1 },
      fireLifespan: { value: 1.3, min: 0.5, max: 10, step: 0.1 },
      smokeLifespan: { value: 3.5, min: 1, max: 100, step: 0.5 },
    },
  );
  const { temperature, density, teapotEmissive } = useControls('volume-fire emitter', {
    temperature: { value: 5.5, min: 0, max: 8, step: 0.05 },
    density: { value: 7.0, min: 0, max: 20, step: 0.1 },
    teapotEmissive: { value: 0.2, min: 0, max: 1, step: 0.001 },
  });
  const { fireHue, glowSpread, fireSaturation, startColor, midColor, endColor } = useControls('volume-fire look', {
    fireHue: { value: 0, min: 0, max: 360, step: 1 },
    glowSpread: { value: 5.0, min: 1, max: 5, step: 0.1 },
    fireSaturation: { value: 1.1, min: 0, max: 2, step: 0.05 },
    startColor: '#ffe68c',
    midColor: '#ff7305',
    endColor: '#ff0000',
  });
  const { steps, resolution, denoise, bloomStrength, bloomRadius, bloomThreshold } = useControls(
    'volume-fire quality',
    {
      steps: { value: 16, min: 4, max: 42, step: 1 },
      resolution: { value: 0.5, min: 0.1, max: 1, step: 0.05 },
      denoise: { value: 0.5, min: 0, max: 1, step: 0.01 },
      bloomStrength: { value: 0.1, min: 0, max: 3, step: 0.01 },
      bloomRadius: { value: 1.0, min: 0, max: 1, step: 0.01 },
      bloomThreshold: { value: 0.5, min: 0, max: 1, step: 0.01 },
    },
  );

  //* Uniforms =====================================================
  // Register every canonical uniform once, then let the Leva-backed call update
  // only its controlled subset. Frame-driven values retain their imperative state.
  const fireUniforms = useUniforms(() => createFireUniforms(), 'volumeFire');
  useUniforms(
    {
      uBuoyancy: buoyancy,
      uEmitDensity: density,
      uEmitTemperature: temperature,
      uFireGlowSpread: glowSpread,
      uFireStartColor: startColor,
      uFireMidColor: midColor,
      uFireEndColor: endColor,
      uFireHue: MathUtils.degToRad(fireHue),
      uSaturation: fireSaturation,
      uTeapotEmissiveIntensity: teapotEmissive,
      uShadowSteps: steps,
      uDenoise: denoise,
      uBloomStrength: bloomStrength,
      uBloomRadius: bloomRadius,
      uBloomThreshold: bloomThreshold,
    },
    'volumeFire',
  );

  const renderer = useThree((state) => state.renderer);

  const teapotRef = useRef<Mesh>(null);
  const volumeMeshRef = useRef<Mesh>(null);
  const keyLightRef = useRef<SpotLight>(null);
  const pointLightRef = useRef<PointLight>(null);

  // Teapot geometry: rendered mesh AND (via a storage buffer below) the GPU emitter.
  const { teapotGeometry, teapotMinY, vertexCount } = useMemo(() => {
    const geometry = new TeapotGeometry(0.8, 28);
    geometry.computeBoundingBox();
    return {
      teapotGeometry: geometry,
      teapotMinY: geometry.boundingBox!.min.y,
      vertexCount: geometry.attributes.position.count,
    };
  }, []);

  //* GPU State ====================================================
  // The simulation's voxel fields. useGPUStorage is create-once, StrictMode-safe,
  // and owns disposal.
  const { fireVelTexA, fireVelTexB, fireDyeTexA, fireDyeTexB, fireDivTex, firePressTexA, firePressTexB, fireCurlTex } =
    useGPUStorage(
      () => ({
        fireVelTexA: createStorage3D(), // velocity field (xyz)
        fireVelTexB: createStorage3D(),
        fireDyeTexA: createStorage3D(), // r = density, g = temperature, b = age
        fireDyeTexB: createStorage3D(),
        fireDivTex: createStorage3D(), // divergence
        firePressTexA: createStorage3D(), // pressure (Jacobi ping-pong)
        firePressTexB: createStorage3D(),
        fireCurlTex: createStorage3D(RepeatWrapping), // precomputed curl noise
      }),
      'volumeFire',
    );

  //* Compute Graph =================================================
  const nodes = useNodes(() => {
    const dyeTexNode = texture3D(fireDyeTexA);
    const dyeTexWriteNode = storageTexture(fireDyeTexB).toWriteOnly();
    const curlNoiseTexNode = texture3D(fireCurlTex);

    // Teapot vertices as a read-only storage buffer for the emitter kernel.
    const teapotVerts = storage(
      teapotGeometry.attributes.position as BufferAttribute,
      'vec3',
      vertexCount,
    ).toReadOnly();

    const kernels = createFluidKernels({
      u: fireUniforms,
      velTexA: fireVelTexA,
      velTexB: fireVelTexB,
      divTex: fireDivTex,
      pressTexA: firePressTexA,
      pressTexB: firePressTexB,
      curlNoiseTex: fireCurlTex,
      dyeTexNode,
      dyeTexWriteNode,
      curlNoiseTexNode,
      teapotVerts,
      vertexCount,
    });

    return { ...kernels, dyeTexNode, dyeTexWriteNode };
  }, 'volumeFire');

  const { dyeTexNode, dyeTexWriteNode, computeCurlNoise } = nodes;

  // Materials + light/emissive node graphs. Rebuilt only if the store-stable inputs
  // change (never in practice); every dynamic value flows through the uniforms.
  const { volumetricMaterial, shadowMaterial, pointLightColorNode, teapotEmissiveNode } = useMemo(
    () =>
      createFireShading({
        u: fireUniforms,
        velTexA: fireVelTexA,
        dyeTexA: fireDyeTexA,
        dyeTexNode,
      }),
    // The individual uniforms/nodes are store-stable singletons; the `nodes` wrapper
    // object gets a fresh identity every render and must NOT be a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dyeTexNode, fireVelTexA, fireDyeTexA],
  );

  // ONCE: precompute the curl-noise force field on the GPU. Sync compute() is safe in
  // an effect (fiber awaits renderer.init()); StrictMode's re-run writes the same field.
  useEffect(() => {
    renderer.compute(computeCurlNoise);
  }, [renderer, computeCurlNoise]);

  // The volume's shadow proxy needs transmitted (non-opaque) shadow maps — a
  // WebGPURenderer property with no Canvas prop, set imperatively like
  // toneMappingExposure elsewhere in this corpus. Layout effect: the flag must be
  // set before the FIRST shadow render or three warns (imperative-setup rule).
  useLayoutEffect(() => {
    renderer.shadowMap.transmitted = true;
  }, [renderer]);

  // Layer split (before the first render): the volumetric mesh renders ONLY in the
  // half-res volumetric pass (layer 10); both lights shine in both passes. The point
  // light's custom colorNode is a duck-typed `light.colorNode` — three's light nodes
  // read it generically but @types/three doesn't declare it (UPSTREAM.md B11 pattern).
  useLayoutEffect(() => {
    const volumeMesh = volumeMeshRef.current;
    const keyLight = keyLightRef.current;
    const pointLight = pointLightRef.current;
    if (!volumeMesh || !keyLight || !pointLight) return;
    volumeMesh.layers.disableAll();
    volumeMesh.layers.enable(LAYER_VOLUMETRIC_LIGHTING);
    keyLight.layers.enable(LAYER_VOLUMETRIC_LIGHTING);
    pointLight.layers.enable(LAYER_VOLUMETRIC_LIGHTING);
    (pointLight as PointLight & { colorNode: Node }).colorNode = pointLightColorNode;
  }, [pointLightColorNode]);

  // VolumeNodeMaterial's CPU-side step count is not a uniform-backed field.
  useEffect(() => {
    volumetricMaterial.steps = steps;
    shadowMaterial.steps = steps;
  }, [volumetricMaterial, shadowMaterial, steps]);

  //* Render Pipeline ==============================================
  const { passes } = useRenderPipeline(({ renderPipeline, passes, scene, camera }) => {
    if (!renderPipeline) return;

    const volumetricLayer = new Layers();
    volumetricLayer.disableAll();
    volumetricLayer.enable(LAYER_VOLUMETRIC_LIGHTING);

    const volumetricPass = pass(scene, camera);
    volumetricPass.setLayers(volumetricLayer);
    volumetricPass.setResolutionScale(0.5);

    const blurredVolumetric = gaussianBlur(volumetricPass, fireUniforms.uDenoise, 1);

    // Saturation boost + halved contribution, then max/add-composited over the scene
    // (the original's compose), and bloom on top.
    const adjustedRGB = saturation(blurredVolumetric.rgb, fireUniforms.uSaturation);
    const adjustedVolumetric = vec4(adjustedRGB, blurredVolumetric.a).mul(0.5);

    const sceneColor = passes.scenePass.getTextureNode();
    const scenePassColor = sceneColor.max(adjustedVolumetric).add(adjustedVolumetric);

    const bloomPass = bloom(scenePassColor);
    bloomPass.strength = fireUniforms.uBloomStrength;
    bloomPass.radius = fireUniforms.uBloomRadius;
    bloomPass.threshold = fireUniforms.uBloomThreshold;
    renderPipeline.outputNode = scenePassColor.add(bloomPass);

    return { volumetricPass };
  });

  useEffect(() => {
    const volumetricPass = passes.volumetricPass as PassNode | undefined;
    if (!volumetricPass) return;
    volumetricPass.setResolutionScale(resolution);
  }, [passes, resolution]);

  //* Simulation Loop ===============================================
  const cpuNoise = useMemo(() => new ImprovedNoise(), []);
  const simState = useRef({ simulationTime: 0, accumulator: 0 });
  const prevTeapotPos = useRef(new Vector3());
  const teapotWorldPos = useRef(new Vector3());
  const teapotVelocity = useRef(new Vector3());

  useFrame(
    ({ delta: rawDelta }) => {
      const teapotMesh = teapotRef.current;
      if (!teapotMesh) return;
      const state = simState.current;
      const delta = Math.min(rawDelta, 1 / 30);

      // CPU-noise flame animation + emitter matrix, at simulation time
      const updateTemporalUniforms = (time: number) => {
        fireUniforms.uTime.value = time % 1000;

        fireUniforms.uFlameHeight.value = 3.5 + cpuNoise.noise(0, time * 2.5, 0) * 0.8;

        const swayX = cpuNoise.noise(time * 3.5, 0, 0) * 0.4;
        const swayZ = cpuNoise.noise(0, 0, time * 3.5) * 0.4;
        fireUniforms.uSway.value.set(swayX, 0, swayZ);

        const slowNoise = cpuNoise.noise(0, time * 0.8, 0);
        const fastNoise = cpuNoise.noise(0, time * 15.0, 0);
        fireUniforms.uFlicker.value = slowNoise * 0.12 + fastNoise * 0.06 + 0.82;

        fireUniforms.uColorNoise.value = cpuNoise.noise(time * 5.0, time * 5.0, 0) * 0.08;

        teapotMesh.rotation.y = time * 0.25;
        teapotMesh.updateMatrixWorld();
        fireUniforms.uTeapotMatrix.value.copy(teapotMesh.matrixWorld);
      };

      // Teapot speed and velocity drive the wind + emission boost while dragging
      const currentPos = teapotMesh.getWorldPosition(teapotWorldPos.current);
      const dist = currentPos.distanceTo(prevTeapotPos.current);
      const speed = delta > 0 ? dist / delta : 0;
      if (delta > 0) {
        teapotVelocity.current.subVectors(currentPos, prevTeapotPos.current).multiplyScalar(1 / delta);
      }
      prevTeapotPos.current.copy(currentPos);

      fireUniforms.uTeapotSpeed.value = speed;
      fireUniforms.uTeapotVelocity.value.copy(teapotVelocity.current);
      fireUniforms.uTeapotPosition.value.copy(currentPos);

      if (simulate && simSpeed > 0) {
        const simStep = SIM_STEP * simSpeed;
        state.accumulator = Math.min(state.accumulator + delta * simSpeed, simStep * MAX_SUBSTEPS);

        fireUniforms.uDt.value = simStep;
        fireUniforms.uTurbulence.value = turbulence / Math.sqrt(simSpeed);
        fireUniforms.uDissipation.value = smokeLifespan >= 100.0 ? 0.0 : 1.0 / smokeLifespan;
        fireUniforms.uCooling.value = 1.0 / fireLifespan;

        while (state.accumulator >= simStep) {
          state.simulationTime += simStep;
          updateTemporalUniforms(state.simulationTime);

          // --- fluid simulation substep (compute dispatches) ---
          renderer.compute(nodes.advectVelocity); // reads dye, velA -> writes velB
          renderer.compute(nodes.divergence); // velB -> div
          for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
            renderer.compute(i % 2 === 0 ? nodes.jacobiAB : nodes.jacobiBA);
          }
          renderer.compute(nodes.project); // velB - grad(p) -> velA
          renderer.compute(nodes.advectDye); // dye -> dyeWrite
          renderer.compute(nodes.emitTeapot); // inject from teapot vertices

          // Ping-pong the dye read/write nodes
          const temp = dyeTexNode.value;
          dyeTexNode.value = dyeTexWriteNode.value;
          dyeTexWriteNode.value = temp;

          state.accumulator -= simStep;
        }
      } else {
        updateTemporalUniforms(state.simulationTime);
      }

      // Point light range follows fire size (temperature/density/intensity), with a
      // 3-second smoothstep fade-in from ignition.
      const sizeFactor = Math.sqrt(
        (fireUniforms.uEmitTemperature.value / 8.34) *
          (fireUniforms.uEmitDensity.value / 11.02) *
          (FIRE_INTENSITY / 5.63),
      );
      const t = MathUtils.clamp(state.simulationTime / 3.0, 0, 1);
      const fadeIn = t * t * (3.0 - 2.0 * t);
      if (pointLightRef.current) {
        pointLightRef.current.distance = Math.max(0.01, 40.0 * Math.max(0.2, sizeFactor) * fadeIn);
      }
    },
    { phase: 'update' },
  );

  // Drag setup: the teapot starts on the floor, constrained to the volume box.
  const dragMatrix = useMemo(() => new Matrix4().setPosition(0, FLOOR_Y - teapotMinY, 0), [teapotMinY]);
  const dragLimits = useMemo<[[number, number], [number, number], [number, number]]>(
    () => [
      [-(VOLUME_WORLD_SIZE_X / 2 - 1.5), VOLUME_WORLD_SIZE_X / 2 - 1.5],
      [FLOOR_Y - teapotMinY, VOLUME_WORLD_SIZE_Y - 1.5],
      [-(VOLUME_WORLD_SIZE_Z / 2 - 1.5), VOLUME_WORLD_SIZE_Z / 2 - 1.5],
    ],
    [teapotMinY],
  );

  return (
    <>
      {/* Raymarched fire/smoke volume — volumetric pass only (layer 10, see effect) */}
      <mesh ref={volumeMeshRef} position={[0, VOLUME_MESH_Y, 0]} receiveShadow>
        <boxGeometry args={[VOLUME_WORLD_SIZE_X, VOLUME_WORLD_SIZE_Y, VOLUME_WORLD_SIZE_Z]} />
        <primitive object={volumetricMaterial} attach="material" />
      </mesh>

      {/* Invisible twin that raymarches the volume from the light's POV to cast a
          soft transmitted shadow onto the floor */}
      <mesh position={[0, VOLUME_MESH_Y, 0]} castShadow>
        <boxGeometry args={[VOLUME_WORLD_SIZE_X, VOLUME_WORLD_SIZE_Y, VOLUME_WORLD_SIZE_Z]} />
        <primitive object={shadowMaterial} attach="material" />
      </mesh>

      {/* Floor */}
      <mesh rotation-x={-Math.PI / 2} position={[0, FLOOR_Y, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardNodeMaterial color="#111115" roughness={0.8} />
      </mesh>

      {/* Burning teapot: fire emitter + lava emissive; drag it to stir the fluid.
          The fire point light rides along inside the drag group. */}
      <DragControls
        matrix={dragMatrix}
        dragLimits={dragLimits}
        onDragStart={() => {
          const controls = cameraControlsRef.current;
          if (controls) controls.enabled = false;
        }}
        onDragEnd={() => {
          const controls = cameraControlsRef.current;
          if (controls) controls.enabled = true;
        }}>
        <mesh ref={teapotRef} geometry={teapotGeometry} receiveShadow>
          <meshStandardNodeMaterial color="#000000" roughness={1} metalness={1} emissiveNode={teapotEmissiveNode} />
        </mesh>
        <pointLight ref={pointLightRef} color="#ffffff" intensity={1} distance={100} decay={2} />
      </DragControls>

      {/* Key light: white spot with shadows so the smoke reads clearly */}
      <spotLight
        ref={keyLightRef}
        position={KEY_LIGHT_POS}
        color="#ffffff"
        intensity={1000}
        angle={Math.PI / 5}
        penumbra={1}
        decay={2}
        distance={0}
        castShadow
        shadow-intensity={0.98}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={20 * (Math.max(VOLUME_WORLD_SIZE_X, VOLUME_WORLD_SIZE_Y, VOLUME_WORLD_SIZE_Z) / 8)}
        shadow-bias={-0.001}
        shadow-focus={1}
      />
    </>
  );
}
