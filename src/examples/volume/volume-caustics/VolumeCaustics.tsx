// The duck (transmissive caustic caster), the floor, the spot light, the fog-box
// volumetric-lighting mesh, and the layered render pipeline (main pass + half-res
// volumetric pass -> bloom -> compose). Uses fiber hooks throughout, so it lives
// inside <Canvas>; the page shell owns leva and Suspense.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { bayer16 } from 'three/addons/tsl/math/Bayer.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { frameId, pass, screenCoordinate, screenUV } from 'three/tsl';
import {
  DoubleSide,
  HalfFloatType,
  Layers,
  MeshPhysicalNodeMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  SpotLight,
  VolumeNodeMaterial,
  type Mesh,
} from 'three/webgpu';
import { useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { useGLTF, useTexture } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import { createFogScatteringNode, createFogTexture3D } from '../../../utils/VolumetricFog';
import { CAUSTIC_MAP_URL, DUCK_URL, LAYER_VOLUMETRIC_LIGHTING } from './constants';
import { createDuckShading } from './duckShading';

export function VolumeCaustics() {
  const { causticOcclusion, materialColor } = useControls('volume-caustics duck', {
    causticOcclusion: { value: 1, min: 0, max: 20, step: 0.1 },
    materialColor: '#ffd700',
  });
  const { smokeAmount, volumetricLightingIntensity, steps, resolution } = useControls('volume-caustics fog', {
    smokeAmount: { value: 3, min: 0, max: 10, step: 0.1 },
    volumetricLightingIntensity: { value: 0.7, min: 0, max: 3, step: 0.01 },
    steps: { value: 20, min: 4, max: 64, step: 1 },
    resolution: { value: 0.5, min: 0.1, max: 1, step: 0.05 },
  });

  const gltf = useGLTF(DUCK_URL, { draco: true });
  const causticMap = useTexture(CAUSTIC_MAP_URL);

  // WebGPU-only renderer flag (no Canvas prop) required for the duck's transmitted
  // castShadowNode caustics — cast for the B9 union gap, layout effect so it's set
  // before the first shadow render (AGENTS.md imperative-setup rule).
  const renderer = useThree((state) => state.renderer);
  useLayoutEffect(() => {
    renderer.shadowMap.transmitted = true;
  }, [renderer]);

  const {
    uCausticOcclusion: uCausticOcclusionNode,
    uSmokeAmount: uSmokeAmountNode,
    uVolumetricIntensity: uVolumetricIntensityNode,
  } = useUniforms(
    {
      uCausticOcclusion: causticOcclusion,
      uSmokeAmount: smokeAmount,
      uVolumetricIntensity: volumetricLightingIntensity,
    },
    'volumeCaustics',
  );

  useLayoutEffect(() => {
    causticMap.wrapS = causticMap.wrapT = RepeatWrapping;
    causticMap.colorSpace = SRGBColorSpace;
  }, [causticMap]);

  // Stable light instance (lazy useState, not useMemo — AGENTS.md non-node-instance
  // rule): the duck's node graph closes over this exact object via lightViewPosition,
  // so a StrictMode memo re-run must never hand it a different instance.
  const [spotLight] = useState(() => new SpotLight('#ffffff', 1));
  useLayoutEffect(() => {
    spotLight.shadow.mapType = HalfFloatType; // for HDR caustics
    spotLight.layers.enable(LAYER_VOLUMETRIC_LIGHTING);
  }, [spotLight]);

  // The duck's caustic-casting material, built once from the stable light + texture.
  const duckMaterial = useMemo(() => {
    const material = new MeshPhysicalNodeMaterial();
    material.side = DoubleSide;
    material.transparent = true;
    material.color.set('#FFD700');
    material.transmission = 1;
    material.thickness = 0.25;
    material.ior = 1.5;
    material.metalness = 0;
    material.roughness = 0.1;

    const { causticEffect, emissiveNode } = createDuckShading({
      material,
      causticMap,
      spotLight,
      causticOcclusion: uCausticOcclusionNode,
    });
    material.castShadowNode = causticEffect;
    material.emissiveNode = emissiveNode;
    return material;
  }, [causticMap, spotLight, uCausticOcclusionNode]);

  // Imperative mesh setup that must precede the first render (AGENTS.md rule): the
  // WebGPU shader-graph build reads mesh state once. Mutates drei's cached gltf.scene
  // in place — idempotent (same material/flags every run), matching this corpus's
  // established glTF-material-swap pattern (tsl-angular-slicing).
  useLayoutEffect(() => {
    const duck = gltf.scene.children[0] as Mesh;
    duck.material = duckMaterial;
    duck.castShadow = true;
    gltf.scene.scale.setScalar(0.5);
  }, [gltf, duckMaterial]);

  useEffect(() => {
    duckMaterial.color.set(materialColor);
  }, [duckMaterial, materialColor]);

  // --- Volumetric fog box: raymarched density from a tiled 3D noise field ---
  // (src/utils/VolumetricFog.ts — shared with volume-lighting/volume-lighting-rectarea,
  // whose three.js originals duplicate this exact block)
  const fogTexture = useMemo(() => createFogTexture3D(), []);

  const volumetricMaterial = useMemo(() => {
    const material = new VolumeNodeMaterial();
    material.steps = steps;
    // Dithering to reduce raymarch banding.
    material.offsetNode = bayer16(screenCoordinate.add(frameId));
    material.scatteringNode = createFogScatteringNode({
      fogTexture,
      smokeAmount: uSmokeAmountNode,
      octaves: [[1], [0.5, 1], [0.2, 2]],
      timeSpeed: [0.01, 0.03],
    });
    return material;
    // `steps` intentionally omitted — handled by the effect below via `.steps =` so
    // changing it doesn't rebuild the scattering node graph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fogTexture, uSmokeAmountNode]);

  useEffect(() => {
    volumetricMaterial.steps = steps;
  }, [volumetricMaterial, steps]);

  // Layer split: the fog box renders ONLY in the half-res volumetric pass, not the
  // main scene pass — `layers` isn't a plain prop (THREE.Layers is a bitmask object,
  // not replaceable via JSX assignment), so this is imperative like the fire port.
  const fogBoxRef = useRef<Mesh>(null);
  useLayoutEffect(() => {
    const fogBox = fogBoxRef.current;
    if (!fogBox) return;
    fogBox.layers.disableAll();
    fogBox.layers.enable(LAYER_VOLUMETRIC_LIGHTING);
  }, []);

  // --- Render pipeline: main scene pass (feeds the fog box's depth occlusion) +
  //     half-resolution volumetric-only pass -> bloom -> additive compose ---
  const { passes } = useRenderPipeline(({ renderPipeline, passes, scene, camera }) => {
    if (!renderPipeline) return;

    const volumetricLayer = new Layers();
    volumetricLayer.disableAll();
    volumetricLayer.enable(LAYER_VOLUMETRIC_LIGHTING);

    const volumetricPass = pass(scene, camera, { depthBuffer: false, samples: 0 });
    volumetricPass.setLayers(volumetricLayer);
    volumetricPass.setResolutionScale(0.5);

    const sceneDepth = passes.scenePass.getTextureNode('depth');
    volumetricMaterial.depthNode = sceneDepth.sample(screenUV);

    const bloomPass = bloom(volumetricPass, 1, 1, 0);

    const sceneColor = passes.scenePass.getTextureNode();
    renderPipeline.outputNode = sceneColor.add(bloomPass.mul(uVolumetricIntensityNode));

    // Return to register — the effect below mutates their uniform-backed knobs.
    return { volumetricPass, bloomPass };
  });

  useEffect(() => {
    const volumetricPass = passes.volumetricPass as { setResolutionScale: (s: number) => void } | undefined;
    volumetricPass?.setResolutionScale(resolution);
  }, [passes, resolution]);

  return (
    <>
      <primitive object={gltf.scene} />

      {/* Floor: the original loads a hardwood texture but never assigns it to the
          material (dead code upstream) — dropped; the floor renders effectively
          black either way, lit only by the spot light and caustic projection. */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[2, 2]} />
        <meshStandardNodeMaterial color="#000000" />
      </mesh>

      {/* Fog box: volumetric-pass-only (layer 10, see the effect above) */}
      <mesh ref={fogBoxRef} position={[0, 0.25, 0]} receiveShadow>
        <boxGeometry args={[1.5, 0.5, 1.5]} />
        <primitive object={volumetricMaterial} attach="material" />
      </mesh>

      <primitive
        object={spotLight}
        position={[0.2, 0.3, 0.2]}
        castShadow
        angle={Math.PI / 6}
        penumbra={1}
        decay={2}
        distance={0}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.1}
        shadow-camera-far={1}
        shadow-intensity={0.95}
      />
    </>
  );
}
