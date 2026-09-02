// The teapot, floor, animated point + spot lights, the fog-box volumetric material, and
// the TRAA render pipeline. Uses fiber hooks throughout, so it lives inside <Canvas>;
// the page shell owns Suspense.
import { useEffect, useMemo, useRef } from 'react';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import {
  depthPass,
  fract,
  interleavedGradientNoise,
  mrt,
  output,
  screenCoordinate,
  screenUV,
  texture3D,
  uniform,
  vec2,
  vec3,
  velocity,
} from 'three/tsl';
import { AdditiveBlending, DoubleSide, VolumeNodeMaterial } from 'three/webgpu';
import type { Mesh, Node, PointLight, SpotLight, Texture, TextureNode } from 'three/webgpu';

import { useFrame, useNodes, useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu';
import { useTexture } from '@react-three/drei/webgpu';
import { folder, useControls } from 'leva';

import '../../../assets/TeapotGeometry';
import { createFogTexture3D } from '../../../utils/VolumetricFog';
import { COLORS_MAP_URL, HALTON_OFFSETS } from './constants';

// The fog box's density field: three octaves of tiled 3D noise, domain-warped by a
// PAUSABLE shader-time uniform. Not `src/utils/VolumetricFog.ts`'s shared
// `createFogScatteringNode` — that one warps by the built-in (always-running) TSL
// `time`, but this demo's `animated` toggle needs a time source it can freeze.
function createScatteringNode(fogTexture: Texture, smokeAmount: Node<'float'>, shaderTime: Node<'float'>) {
  return ({ positionRay }: { positionRay: Node<'vec3'> }) => {
    const timeScaled = vec3(shaderTime, 0, shaderTime.mul(0.3));
    const sampleGrain = (scale: number, timeScale = 1) =>
      texture3D(fogTexture, fract(positionRay.add(timeScaled.mul(timeScale)).mul(scale)), 0).r.add(0.5);

    let density = sampleGrain(0.1);
    density = density.mul(sampleGrain(0.05, 1));
    density = density.mul(sampleGrain(0.02, 2));
    return smokeAmount.mix(1, density);
  };
}

export function VolumeLightingTraa() {
  const { animated, traaEnabled, pointIntensity, spotIntensity, smokeAmount, steps } = useControls(
    'volume-lighting-traa',
    {
      animated: true,
      traaEnabled: { value: true, label: 'TRAA' },
      scene: folder({
        pointIntensity: { value: 3, min: 0, max: 6, label: 'light intensity' },
        spotIntensity: { value: 100, min: 0, max: 200, label: 'spot intensity' },
        smokeAmount: { value: 2, min: 0, max: 3 },
      }),
      rayMarching: folder({ steps: { value: 12, min: 2, max: 16, step: 1, label: 'step count' } }),
    },
  );

  const colorsMap = useTexture(COLORS_MAP_URL); // spot light cookie
  const fogTexture = useMemo(() => createFogTexture3D(), []);
  const { uSmokeAmount } = useUniforms({ uSmokeAmount: smokeAmount });

  // Temporal jitter (Halton, synced to TRAA's own sequence) + a pausable shader-time
  // uniform — all mutated every frame below, all create-once graph inputs.
  const { shaderTimeNode, temporalOffsetNode, temporalRotationNode } = useNodes(() => ({
    shaderTimeNode: uniform(0),
    temporalOffsetNode: uniform(0),
    temporalRotationNode: uniform(0),
  }));

  const volumetricMaterial = useMemo(() => {
    const material = new VolumeNodeMaterial();
    material.transparent = true;
    material.blending = AdditiveBlending;

    // Interleaved-gradient-noise dither, offset by the Halton jitter so the raymarch's
    // banding pattern moves in lockstep with TRAA's own per-frame pixel offset.
    const temporalJitter2D = vec2(temporalOffsetNode, temporalRotationNode);
    material.offsetNode = fract(
      interleavedGradientNoise(screenCoordinate.add(temporalJitter2D.mul(100))).add(temporalOffsetNode),
    );
    material.scatteringNode = createScatteringNode(fogTexture, uSmokeAmount, shaderTimeNode);
    return material;
  }, [fogTexture, uSmokeAmount, shaderTimeNode, temporalOffsetNode, temporalRotationNode]);

  useEffect(() => {
    volumetricMaterial.steps = steps;
  }, [volumetricMaterial, steps]);

  // --- Animation: orbiting point light, sweeping spot light, spinning teapot, all
  // gated by `animated` through one shared elapsed-time accumulator (a ref, not
  // `state.elapsed` — this demo can PAUSE its own clock while the render loop keeps
  // ticking for TRAA's jitter). The original's per-frame `spotLight.lookAt(0,0,0)` is
  // dropped — a SpotLight's beam direction comes from `.target`'s world position
  // (defaulted to the origin, never reparented here), not the light's own quaternion,
  // so the call was a no-op (same class of dead code as volume-lighting's).
  const animationTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const pointLightRef = useRef<PointLight>(null);
  const spotLightRef = useRef<SpotLight>(null);
  const teapotRef = useRef<Mesh>(null);

  useFrame(({ delta }) => {
    const haltonIndex = frameCountRef.current % HALTON_OFFSETS.length;
    temporalOffsetNode.value = HALTON_OFFSETS[haltonIndex][0];
    temporalRotationNode.value = HALTON_OFFSETS[haltonIndex][1];
    frameCountRef.current++;

    if (animated) animationTimeRef.current += delta;
    const t = animationTimeRef.current;
    shaderTimeNode.value = t;

    const scale = 2.4;
    pointLightRef.current?.position.set(
      Math.sin(t * 0.7) * scale,
      Math.cos(t * 0.5) * scale,
      Math.cos(t * 0.3) * scale,
    );
    if (spotLightRef.current) spotLightRef.current.position.x = Math.cos(t * 0.3) * scale;
    if (teapotRef.current) teapotRef.current.rotation.y = t * 0.2;
  });

  // --- Render pipeline: a depth-only pre-pass (opaque objects, feeds the fog box's
  // depth occlusion AND TRAA), the main scene pass with an MRT velocity output, then
  // TRAA resolving both the camera-jitter aliasing and the fog's per-frame dither.
  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, passes, scene, camera }) => {
    if (!renderPipeline) return;

    // TRAA needs single-sampled depth/velocity — pass targets otherwise inherit the
    // renderer's MSAA sample count (fiber Canvas defaults to 4x).
    passes.scenePass.options.samples = 0;

    const prePass = depthPass(scene, camera, { samples: 0 });
    prePass.name = 'Pre Pass';
    prePass.transparent = false; // the volumetric mesh is transparent, excluded automatically
    const prePassDepth = prePass.getTextureNode('depth');
    volumetricMaterial.depthNode = prePassDepth.sample(screenUV);

    passes.scenePass.setMRT(mrt({ output, velocity }));
    const scenePassColor = passes.scenePass.getTextureNode();
    const scenePassVelocity = passes.scenePass.getTextureNode('velocity');

    const traaPass = traa(scenePassColor, prePassDepth, scenePassVelocity, camera);
    renderPipeline.outputNode = traaPass;

    // Return to register — the effect below swaps between this and the raw color.
    return { traaPass, scenePassColor };
  });

  useEffect(() => {
    const traaPass = passes.traaPass as ReturnType<typeof traa> | undefined;
    const scenePassColor = passes.scenePassColor as TextureNode | undefined;
    if (!renderPipeline || !traaPass || !scenePassColor) return;
    renderPipeline.outputNode = traaEnabled ? traaPass : scenePassColor;
    renderPipeline.needsUpdate = true;
  }, [renderPipeline, passes, traaEnabled]);

  return (
    <>
      <mesh ref={teapotRef} castShadow>
        <teapotGeometry args={[0.8, 18]} />
        <meshStandardNodeMaterial color="#ffffff" side={DoubleSide} />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[0, -3, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardNodeMaterial color="#ffffff" />
      </mesh>

      <mesh position={[0, 2, 0]} receiveShadow>
        <boxGeometry args={[20, 10, 20]} />
        <primitive object={volumetricMaterial} attach="material" />
      </mesh>

      <pointLight
        ref={pointLightRef}
        color="#f9bb50"
        intensity={pointIntensity}
        distance={100}
        castShadow
        position={[0, 1.4, 0]}
      />

      <spotLight
        ref={spotLightRef}
        color="#ffffff"
        intensity={spotIntensity}
        position={[2.5, 5, 2.5]}
        angle={Math.PI / 6}
        penumbra={1}
        decay={2}
        distance={0}
        map={colorsMap}
        castShadow
        shadow-intensity={0.98}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={15}
        shadow-focus={1}
      />
    </>
  );
}
