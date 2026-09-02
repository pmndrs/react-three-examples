// The GPU-driven pipeline: mega-mesh storage, the five compute kernels (clear,
// cull + LOD + work allocation, indirect dispatch args, software raster, hardware draw
// args), the hierarchical depth pyramid that occlusion-culls next frame's instances,
// and the render takeover that runs them all. Shading lives in visibilitySurface.ts.
import { use, useEffect, useLayoutEffect, useMemo, type RefObject } from 'react';
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js';
import {
  context,
  overrideNodes,
  positionView,
  positionViewDirection,
  storage,
  texture,
  uniform,
  uniformArray,
} from 'three/tsl';
import {
  ACESFilmicToneMapping,
  BufferGeometry,
  DepthTexture,
  EquirectangularReflectionMapping,
  Float32BufferAttribute,
  FloatType,
  Frustum,
  HalfFloatType,
  IndirectStorageBufferAttribute,
  Matrix4,
  MeshStandardMaterial,
  NodeMaterial,
  NoToneMapping,
  QuadMesh,
  RenderTarget,
  Sphere,
  StorageBufferAttribute,
  Vector3,
  Vector4,
  type Mesh,
} from 'three/webgpu';
import {
  useBuffers,
  useFrame,
  useLoader,
  useLocalNodes,
  useNodes,
  useThree,
  useUniforms,
} from '@react-three/fiber/webgpu';
import { useGLTF } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import type CameraControlsImpl from 'camera-controls';

import { buildHzbKernels, createSphereOcclusionTest, hzbLevels, MAX_HZB_LEVELS } from './depthPyramid';
import { buildHelmetMeshlets, type MegaMesh, MESHOPT_READY } from './helmetMeshlets';
import { buildRasterizerKernels } from './rasterizerKernels';
import { buildVisibilitySurface, type HelmetMaps } from './visibilitySurface';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples';
const HELMET_URL = `${ASSETS}/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf`;
const HDR_URL = `${ASSETS}/textures/equirectangular/royal_esplanade_2k.hdr.jpg`;

/** 125x125 as a plane, 25x25x25 as a volume — the same instance count either way. */
const INSTANCE_COUNT = 15625;
const MAX_WORK_ITEMS = 2_820_000;
const MAX_HW_TRIANGLES = 100_000;

const OUTPUT_MODES = [
  'Default',
  'Meshlet Debug',
  'Geometry Normal',
  'Normal Map',
  'UV',
  'Roughness',
  'Metalness',
  'AO',
  'Emissive',
] as const;
type OutputMode = (typeof OUTPUT_MODES)[number];
// leva widens an options ARRAY to string, so the menus are objects (display-stereo's
// pattern) and the union survives into the comparisons below.
const OUTPUT_MODE_OPTIONS = Object.fromEntries(OUTPUT_MODES.map((mode) => [mode, mode])) as Record<string, OutputMode>;
/** Index the vis shader switches on; Default and Meshlet Debug use their own material. */
const OUTPUT_MODE_INDEX: Record<OutputMode, number> = {
  Default: 0,
  'Meshlet Debug': 0,
  'Geometry Normal': 1,
  'Normal Map': 2,
  UV: 3,
  Roughness: 4,
  Metalness: 5,
  AO: 6,
  Emissive: 7,
};

/** Instance grid layouts, and where the camera starts for each. */
const GRIDS: Record<'XZ' | 'XYZ', { position: [number, number, number]; target: [number, number, number] }> = {
  XZ: { position: [0, 8, 30], target: [0, -1, 0] },
  XYZ: { position: [2, 2, 40], target: [0, 0, 0] },
};
type GridName = keyof typeof GRIDS;
const GRID_OPTIONS = { XZ: 'XZ', XYZ: 'XYZ' } as Record<string, GridName>;

function instanceGridData(grid: GridName) {
  const data = new Float32Array(INSTANCE_COUNT * 4);
  let write = 0;
  if (grid === 'XZ') {
    for (let x = 0; x < 125; x++) {
      for (let z = 0; z < 125; z++) {
        data[write++] = (x - 62) * 4;
        data[write++] = -1;
        data[write++] = (z - 62) * 4;
        data[write++] = 1;
      }
    }
  } else {
    for (let x = 0; x < 25; x++) {
      for (let y = 0; y < 25; y++) {
        for (let z = 0; z < 25; z++) {
          data[write++] = (x - 12) * 4;
          data[write++] = (y - 12) * 4;
          data[write++] = (z - 12) * 4;
          data[write++] = 1;
        }
      }
    }
  }
  return data;
}

//* Asset gate ======================================================

/**
 * Loads everything the pipeline is built from and suspends until it is all here: the
 * helmet, the environment, and the two meshopt WASM modules. The pipeline itself is a
 * CHILD, so its create-once hooks only ever run with the assets in hand.
 */
export interface HelmetAssetsProps {
  /** Live camera-controls instance — the grid switch reframes the field through it. */
  controlsRef: RefObject<CameraControlsImpl | null>;
}

export function HelmetAssets({ controlsRef }: HelmetAssetsProps) {
  const scene = useThree((state) => state.scene);
  const { scene: helmetScene } = useGLTF(HELMET_URL);
  const hdrTexture = useLoader(UltraHDRLoader, HDR_URL);
  use(MESHOPT_READY);

  // The lit scene has no analytic lights — the environment IS the lighting, and both
  // materials are custom-node, so it has to be in place before their first shader
  // build (AGENTS.md B15).
  useLayoutEffect(() => {
    hdrTexture.mapping = EquirectangularReflectionMapping;
    scene.background = hdrTexture;
    scene.backgroundBlurriness = 0.5;
    scene.environment = hdrTexture;
    return () => {
      scene.background = null;
      scene.backgroundBlurriness = 0;
      scene.environment = null;
    };
  }, [scene, hdrTexture]);

  const { megaMesh, maps } = useMemo(() => {
    let sourceMesh: Mesh | undefined;
    helmetScene.traverse((child) => {
      if ((child as Mesh).isMesh) sourceMesh = child as Mesh;
    });
    if (!sourceMesh) throw new Error('DamagedHelmet.gltf has no mesh');

    // The helmet is authored z-up under a node transform; bake it in, because the
    // rasterizer only ever sees raw vertex positions.
    helmetScene.updateMatrixWorld(true);
    sourceMesh.geometry.applyMatrix4(sourceMesh.matrixWorld);

    const material = sourceMesh.material as MeshStandardMaterial;
    return {
      megaMesh: buildHelmetMeshlets(sourceMesh.geometry),
      maps: {
        map: material.map,
        normalMap: material.normalMap,
        roughnessMap: material.roughnessMap,
        aoMap: material.aoMap,
        emissiveMap: material.emissiveMap,
      } as HelmetMaps,
    };
  }, [helmetScene]);

  return <RasterizerIbl megaMesh={megaMesh} maps={maps} controlsRef={controlsRef} />;
}

//* Pipeline ========================================================

interface RasterizerIblProps extends HelmetAssetsProps {
  megaMesh: MegaMesh;
  maps: HelmetMaps;
}

function RasterizerIbl({ megaMesh, maps, controlsRef }: RasterizerIblProps) {
  //* Controls =====================================================
  const { output, rasterizer, grid, occlusionBias, lodThreshold, animationSpeed } = useControls(
    'compute-rasterizer-ibl',
    {
      output: { value: 'Default' as OutputMode, options: OUTPUT_MODE_OPTIONS },
      rasterizer: { value: 'Both', options: ['SW Only', 'HW Only', 'Both'] },
      grid: { value: 'XZ' as GridName, options: GRID_OPTIONS },
      occlusionBias: { value: 0.0008, min: 0, max: 0.0008, step: 0.000001 },
      lodThreshold: { value: 3, min: 1, max: 15, step: 0.1 },
      animationSpeed: { value: 1, min: 0, max: 1, step: 0.01 },
    },
  );
  const { uOcclusionBias, uLodThreshold, uTimeScale } = useUniforms(
    { uOcclusionBias: occlusionBias, uLodThreshold: lodThreshold, uTimeScale: animationSpeed },
    'rasterizerIbl',
  );

  const renderer = useThree((state) => state.renderer);
  const scene = useThree((state) => state.scene);
  const size = useThree((state) => state.size);

  //* Render target ================================================
  // The scene renders into an HDR target so the pyramid can read its depth; the blit
  // presents it, which is where tone mapping applies.
  const bufferWidth = Math.max(1, Math.floor(size.width * renderer.getPixelRatio()));
  const bufferHeight = Math.max(1, Math.floor(size.height * renderer.getPixelRatio()));

  const { sceneTarget, sceneDepth } = useMemo(() => {
    const target = new RenderTarget(bufferWidth, bufferHeight, { type: HalfFloatType });
    const depth = new DepthTexture(bufferWidth, bufferHeight);
    depth.type = FloatType;
    target.depthTexture = depth;
    return { sceneTarget: target, sceneDepth: depth };
  }, [bufferWidth, bufferHeight]);

  useEffect(() => () => sceneTarget.dispose(), [sceneTarget]);

  //* GPU State ====================================================
  const {
    vertexBuffer,
    normalBuffer,
    uvBuffer,
    indexBuffer,
    meshletIdBuffer,
    chunkBoundsBuffer,
    instanceDataAttribute,
    instanceDataBuffer,
    instanceWorldBuffer,
    instanceWorldRead,
    instancePrevWorldBuffer,
    instanceMvpBuffer,
    workQueueBuffer,
    workQueueCountAtomic,
    workQueueCountRead,
    dispatchAttribute,
    hwQueueAtomic,
    hwQueueRead,
    hwDrawAttribute,
    screenTriAtomic,
    screenTriRead,
    screenInstAtomic,
    screenInstRead,
    hzbBuffer,
    hzbRead,
  } = useBuffers(() => {
    const instanceWorldAttribute = new StorageBufferAttribute(new Float32Array(INSTANCE_COUNT * 16), 16);
    const workQueueCountAttribute = new StorageBufferAttribute(new Uint32Array(1), 1);
    // Slot 0 is the atomic counter, then stride-2 [instanceId, triangleIndex] entries —
    // two words rather than one packed uint, because 17 + 16 bits no longer fit.
    const hwQueueAttribute = new StorageBufferAttribute(new Uint32Array(1 + MAX_HW_TRIANGLES * 2), 1);
    const instanceDataAttribute = new StorageBufferAttribute(instanceGridData('XZ'), 4);

    const pixelCount = bufferWidth * bufferHeight;
    const screenTriAttribute = new StorageBufferAttribute(new Uint32Array(pixelCount), 1);
    const screenInstAttribute = new StorageBufferAttribute(new Uint32Array(pixelCount), 1);

    // 1 = the far plane, which occludes nothing.
    const hzbAttribute = new StorageBufferAttribute(
      new Float32Array(hzbLevels(bufferWidth, bufferHeight).texels).fill(1),
      1,
    );

    return {
      vertexBuffer: storage(
        new StorageBufferAttribute(megaMesh.vertexArray, 4),
        'vec4',
        megaMesh.vertexCount,
      ).toReadOnly(),
      normalBuffer: storage(
        new StorageBufferAttribute(megaMesh.normalArray, 4),
        'vec4',
        megaMesh.vertexCount,
      ).toReadOnly(),
      uvBuffer: storage(new StorageBufferAttribute(megaMesh.uvArray, 2), 'vec2', megaMesh.vertexCount).toReadOnly(),
      indexBuffer: storage(
        new StorageBufferAttribute(megaMesh.indexArray, 1),
        'uint',
        megaMesh.indexCount,
      ).toReadOnly(),
      meshletIdBuffer: storage(
        new StorageBufferAttribute(megaMesh.meshletIdArray, 1),
        'uint',
        megaMesh.indexCount / 3,
      ).toReadOnly(),
      chunkBoundsBuffer: storage(
        new StorageBufferAttribute(megaMesh.chunkBoundsArray, 4),
        'vec4',
        megaMesh.chunkCount,
      ).toReadOnly(),

      instanceDataAttribute,
      instanceDataBuffer: storage(instanceDataAttribute, 'vec4', INSTANCE_COUNT),
      instanceWorldBuffer: storage(instanceWorldAttribute, 'mat4', INSTANCE_COUNT),
      // Read-only view for the hardware mesh's vertex stage, which runs while the
      // kernel still needs write access to the same memory.
      instanceWorldRead: storage(instanceWorldAttribute, 'mat4', INSTANCE_COUNT).toReadOnly(),
      // Last frame's transforms — the occlusion test runs against last frame's depth,
      // so it has to use last frame's positions too.
      instancePrevWorldBuffer: storage(
        new StorageBufferAttribute(new Float32Array(INSTANCE_COUNT * 16), 16),
        'mat4',
        INSTANCE_COUNT,
      ),
      instanceMvpBuffer: storage(
        new StorageBufferAttribute(new Float32Array(INSTANCE_COUNT * 16), 16),
        'mat4',
        INSTANCE_COUNT,
      ),

      workQueueBuffer: storage(
        new StorageBufferAttribute(new Uint32Array(MAX_WORK_ITEMS * 4), 4),
        'uvec4',
        MAX_WORK_ITEMS,
      ),
      workQueueCountAtomic: storage(workQueueCountAttribute, 'uint', 1).toAtomic(),
      workQueueCountRead: storage(workQueueCountAttribute, 'uint', 1).toReadOnly(),

      hwQueueAtomic: storage(hwQueueAttribute, 'uint', 1 + MAX_HW_TRIANGLES * 2).toAtomic(),
      hwQueueRead: storage(hwQueueAttribute, 'uint', 1 + MAX_HW_TRIANGLES * 2).toReadOnly(),

      dispatchAttribute: new IndirectStorageBufferAttribute(new Uint32Array(3), 3),
      hwDrawAttribute: new IndirectStorageBufferAttribute(new Uint32Array(4), 4),

      screenTriAtomic: storage(screenTriAttribute, 'uint', pixelCount).toAtomic(),
      screenTriRead: storage(screenTriAttribute, 'uint', pixelCount).toReadOnly(),
      screenInstAtomic: storage(screenInstAttribute, 'uint', pixelCount).toAtomic(),
      screenInstRead: storage(screenInstAttribute, 'uint', pixelCount).toReadOnly(),

      hzbBuffer: storage(hzbAttribute, 'float', hzbAttribute.count),
      hzbRead: storage(hzbAttribute, 'float', hzbAttribute.count).toReadOnly(),
    };
  }, 'rasterizerIbl');

  //* Compute Graph =================================================
  const {
    computeClear,
    computeFrustum,
    computeDispatch,
    computeRasterize,
    computeHwArgs,
    uSceneColor,
    uSceneDepth,
    uProjScreenMatrix,
    uPrevProjScreen,
    uFrustumPlanes,
    uCameraPos,
    uPrevCameraPos,
    uCotHalfFov,
    uOutputMode,
    uHzbLevels,
    uHzbLevelCount,
  } = useNodes(() => {
    // Camera state, rewritten every frame from the render loop — plain TSL uniforms,
    // not useUniforms: React must never write these back.
    const uProjScreenMatrix = uniform(new Matrix4());
    const uPrevProjScreen = uniform(new Matrix4());
    const uFrustumPlanes = uniformArray<'vec4'>(
      Array.from({ length: 6 }, () => new Vector4()),
      'vec4',
    );
    const uCameraPos = uniform(new Vector3());
    const uPrevCameraPos = uniform(new Vector3());
    const uCotHalfFov = uniform(1);
    // uint, so it cannot come from useUniforms — an effect below tracks the leva knob.
    const uOutputMode = uniform(0, 'uint');
    // Pyramid geometry: [texelOffset, width, height] per level, rewritten on resize.
    const uHzbLevels = uniformArray<'vec4'>(
      Array.from({ length: MAX_HZB_LEVELS }, () => new Vector4()),
      'vec4',
    );
    const uHzbLevelCount = uniform(0);
    // The scene target's colour (for the blit) and depth (level 0 of the pyramid).
    // The effect below re-points both whenever the target is reallocated.
    const uSceneColor = texture(sceneTarget.texture);
    const uSceneDepth = texture(sceneDepth);
    // The LOD table is small and read by one thread at a time — a uniform array, not
    // a storage buffer.
    const uLodOffsets = uniformArray<'vec4'>(
      megaMesh.lodOffsets.map(([start, count, chunkStart]) => new Vector4(start, count, chunkStart, 0)),
      'vec4',
    );

    return {
      uProjScreenMatrix,
      uPrevProjScreen,
      uFrustumPlanes,
      uCameraPos,
      uPrevCameraPos,
      uCotHalfFov,
      uOutputMode,
      uHzbLevels,
      uHzbLevelCount,
      uSceneColor,
      uSceneDepth,
      ...buildRasterizerKernels({
        megaMesh,
        instanceCount: INSTANCE_COUNT,
        maxWorkItems: MAX_WORK_ITEMS,
        maxHwTriangles: MAX_HW_TRIANGLES,
        vertexBuffer,
        indexBuffer,
        chunkBoundsBuffer,
        instanceDataBuffer,
        instanceWorldBuffer,
        instancePrevWorldBuffer,
        instanceMvpBuffer,
        workQueueBuffer,
        workQueueCountAtomic,
        workQueueCountRead,
        hwQueueAtomic,
        screenTriAtomic,
        screenInstAtomic,
        dispatchAttribute,
        hwDrawAttribute,
        uProjScreenMatrix,
        uFrustumPlanes,
        uCameraPos,
        uCotHalfFov,
        uTimeScale,
        uLodThreshold,
        uLodOffsets,
        sphereOccluded: createSphereOcclusionTest({
          uHzbLevels,
          uHzbLevelCount,
          hzbRead,
          uPrevCameraPos,
          uPrevProjScreen,
          uCotHalfFov,
          uOcclusionBias,
        }),
      }),
    };
  }, 'rasterizerIbl');

  //* Depth pyramid =================================================
  // useLocalNodes, not useNodes: this is an ARRAY of kernels, which the node store
  // cannot hold. Still create-once, and store-free, so it is safe after a suspension.
  const hzbKernels = useLocalNodes(() => ({
    kernels: buildHzbKernels(
      { uHzbLevels, uHzbLevelCount, uSceneDepth, hzbBuffer, hzbRead },
      hzbLevels(bufferWidth, bufferHeight).levels,
    ),
  })).kernels;

  //* Shading =======================================================
  const surface = useLocalNodes(() =>
    buildVisibilitySurface({
      maps,
      vertexBuffer,
      normalBuffer,
      uvBuffer,
      indexBuffer,
      meshletIdBuffer,
      instanceWorldRead,
      hwQueueRead,
      screenTriRead,
      screenInstRead,
      uProjScreenMatrix,
      uOutputMode,
    }),
  );

  //* Meshes ========================================================
  // Dummy geometry for the hardware pass: no attribute is read, the vertex count comes
  // from the GPU-written indirect draw buffer, and the vertex stage pulls the rest.
  const hwGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(MAX_HW_TRIANGLES * 9), 3));
    geometry.setIndirect(hwDrawAttribute);
    geometry.boundingSphere = new Sphere(new Vector3(), Infinity);
    return geometry;
  }, [hwDrawAttribute]);

  // A fullscreen TRIANGLE, drawn through the scene camera so the standard lighting
  // pipeline runs on it per fragment.
  const resolveGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geometry.boundingSphere = new Sphere(new Vector3(), Infinity);
    return geometry;
  }, []);

  // Presents the HDR target to the canvas, which is where tone mapping applies.
  const blitQuad = useMemo(() => {
    const material = new NodeMaterial();
    material.colorNode = uSceneColor;
    return new QuadMesh(material);
  }, [uSceneColor]);

  //* Modes and resize ==============================================
  useEffect(() => {
    uOutputMode.value = OUTPUT_MODE_INDEX[output];
    // Only the shaded path is HDR; the debug outputs are display-referred already.
    renderer.toneMapping = output === 'Default' ? ACESFilmicToneMapping : NoToneMapping;
  }, [output, uOutputMode, renderer]);

  // Regenerating the grid is a buffer upload, and the camera has to reframe with it —
  // through the controls, because camera-controls overwrites a direct position write.
  useEffect(() => {
    instanceDataAttribute.array.set(instanceGridData(grid));
    instanceDataAttribute.needsUpdate = true;

    const { position, target } = GRIDS[grid];
    controlsRef.current?.setLookAt(...position, ...target, false);
  }, [grid, instanceDataAttribute, controlsRef]);

  // The visibility buffers and the pyramid are sized in PIXELS, so they follow the
  // drawing buffer. Layout effect: the storage nodes must point at the new attributes
  // before the next render phase reads them.
  useLayoutEffect(() => {
    const pixelCount = bufferWidth * bufferHeight;
    const { levels, texels } = hzbLevels(bufferWidth, bufferHeight);

    // Cast: UniformArrayNode types its backing store as `unknown[]` — the element type
    // is only carried on the node's TSL side (typed-TSL gap, B11 family).
    const levelArray = uHzbLevels.array as Vector4[];
    levels.forEach(([offset, width, height], i) => levelArray[i].set(offset, width, height, 0));
    uHzbLevelCount.value = levels.length;

    // Re-point the graph at the target this render actually committed.
    uSceneColor.value = sceneTarget.texture;
    uSceneDepth.value = sceneDepth;

    hzbKernels.forEach((kernel, k) => {
      const [, width, height] = levels[Math.min(k, levels.length - 1)];
      kernel.count = width * height;
      kernel.dispose();
    });

    // On mount the buffers were already built at this size — only a resize gets past.
    if (pixelCount === screenTriAtomic.bufferCount && texels === hzbBuffer.bufferCount) return;

    screenTriAtomic.value.dispose();
    screenInstAtomic.value.dispose();
    hzbBuffer.value.dispose();

    const screenTriAttribute = new StorageBufferAttribute(new Uint32Array(pixelCount), 1);
    const screenInstAttribute = new StorageBufferAttribute(new Uint32Array(pixelCount), 1);
    const hzbAttribute = new StorageBufferAttribute(new Float32Array(texels).fill(1), 1);

    for (const [node, attribute, count] of [
      [screenTriAtomic, screenTriAttribute, pixelCount],
      [screenTriRead, screenTriAttribute, pixelCount],
      [screenInstAtomic, screenInstAttribute, pixelCount],
      [screenInstRead, screenInstAttribute, pixelCount],
      [hzbBuffer, hzbAttribute, texels],
      [hzbRead, hzbAttribute, texels],
    ] as const) {
      node.value = attribute;
      node.bufferCount = count;
    }

    // Every pipeline that binds one of those buffers has to be rebuilt.
    computeClear.count = pixelCount;
    for (const kernel of [computeClear, computeRasterize, computeFrustum, computeDispatch, computeHwArgs]) {
      kernel.dispose();
    }
  }, [
    bufferWidth,
    bufferHeight,
    sceneTarget,
    sceneDepth,
    hzbKernels,
    uHzbLevels,
    uHzbLevelCount,
    uSceneColor,
    uSceneDepth,
    screenTriAtomic,
    screenTriRead,
    screenInstAtomic,
    screenInstRead,
    hzbBuffer,
    hzbRead,
    computeClear,
    computeRasterize,
    computeFrustum,
    computeDispatch,
    computeHwArgs,
  ]);

  //* Frame =========================================================
  // Takes over rendering entirely (`{ phase: 'render' }`) — this example IS about a
  // hand-written rasterizer: five compute passes, the scene into an HDR target, the
  // depth pyramid for next frame's culling, then a blit to the canvas.
  const frustum = useMemo(() => new Frustum(), []);
  const projScreenMatrix = useMemo(() => new Matrix4(), []);
  const previous = useMemo(() => ({ projScreen: new Matrix4(), cameraPos: new Vector3(), valid: false }), []);

  useFrame(
    ({ camera }) => {
      camera.updateMatrixWorld();
      projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

      if (!previous.valid) {
        previous.projScreen.copy(projScreenMatrix);
        previous.cameraPos.copy(camera.position);
        previous.valid = true;
      }

      // Last frame's matrices drive the occlusion test, because the pyramid it reads
      // was built from last frame's depth.
      uPrevProjScreen.value.copy(previous.projScreen);
      uPrevCameraPos.value.copy(previous.cameraPos);
      previous.projScreen.copy(projScreenMatrix);
      previous.cameraPos.copy(camera.position);

      frustum.setFromProjectionMatrix(projScreenMatrix);
      uProjScreenMatrix.value.copy(projScreenMatrix);
      uCameraPos.value.copy(camera.position);
      // projectionMatrix[5] IS cot(fov/2) for a perspective camera.
      uCotHalfFov.value = camera.projectionMatrix.elements[5];

      const planeArray = uFrustumPlanes.array as Vector4[];
      frustum.planes.forEach((plane, i) => {
        planeArray[i].set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      });

      renderer.compute(computeClear);
      renderer.compute(computeFrustum);
      renderer.compute(computeDispatch);
      renderer.compute(computeRasterize, dispatchAttribute);
      renderer.compute(computeHwArgs);

      renderer.setRenderTarget(sceneTarget);
      renderer.render(scene, camera);

      // Fold this frame's depth into the pyramid the NEXT frame culls against.
      for (let k = 0; k < uHzbLevelCount.value; k++) renderer.compute(hzbKernels[k]);

      renderer.setRenderTarget(null);
      blitQuad.render(renderer);
    },
    { phase: 'render' },
  );

  const softwareVisible = rasterizer !== 'HW Only';
  const hardwareVisible = rasterizer !== 'SW Only';

  return (
    <>
      {/* The resolve pass: shades every pixel the software rasterizer covered. The
          key remounts both materials when the drawing buffer changes — they bind the
          storage buffers the resize effect reallocates, so their pipelines are stale. */}
      <mesh
        key={`resolve-${bufferWidth}x${bufferHeight}`}
        geometry={resolveGeometry}
        frustumCulled={false}
        renderOrder={1}
        visible={softwareVisible}>
        {output === 'Default' ? (
          <meshStandardNodeMaterial
            vertexNode={surface.resolveVertexNode}
            depthNode={surface.resolveDepthNode}
            contextNode={overrideNodes([
              [positionView, surface.resolveOverrides[0]],
              [positionViewDirection, surface.resolveOverrides[1]],
            ])}
            {...surface.resolveShadedNodes}
          />
        ) : output === 'Meshlet Debug' ? (
          <nodeMaterial
            vertexNode={surface.resolveVertexNode}
            depthNode={surface.resolveDepthNode}
            fragmentNode={surface.resolveDebugFragmentNode}
          />
        ) : (
          <nodeMaterial
            vertexNode={surface.resolveVertexNode}
            depthNode={surface.resolveDepthNode}
            contextNode={context({
              positionView: surface.resolveOverrides[0],
              positionViewDirection: surface.resolveOverrides[1],
            })}
            fragmentNode={surface.resolveVisFragmentNode}
          />
        )}
      </mesh>

      {/* The hardware fallback, drawn over the resolve with real depth testing. */}
      <mesh
        key={`hw-${bufferWidth}x${bufferHeight}`}
        geometry={hwGeometry}
        frustumCulled={false}
        renderOrder={2}
        visible={hardwareVisible}>
        {output === 'Default' ? (
          <meshStandardNodeMaterial {...surface.hwShadedNodes} />
        ) : output === 'Meshlet Debug' ? (
          <nodeMaterial positionNode={surface.hwPositionNode} fragmentNode={surface.hwDebugFragmentNode} />
        ) : (
          <nodeMaterial positionNode={surface.hwPositionNode} fragmentNode={surface.hwVisFragmentNode} />
        )}
      </mesh>
    </>
  );
}
