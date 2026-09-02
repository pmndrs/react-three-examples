// Stochastic SSR + spatiotemporal denoising, the full six-stage chain:
//   scene MRT -> ssr(stochastic) -> temporalReproject -> recurrentDenoise
//              -> grading -> traa -> sharpen
// The denoised result is fed BACK into SSR as its history texture, which is what
// gives the reflections a second bounce.
import { useEffect } from 'react';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { temporalReproject } from 'three/addons/tsl/display/TemporalReprojectNode.js';
import { recurrentDenoise } from 'three/addons/tsl/display/RecurrentDenoiseNode.js';
import { sharpen } from 'three/addons/tsl/display/SharpenNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import {
  abs,
  diffuseColor,
  float,
  materialMetalness,
  materialRoughness,
  mix,
  mrt,
  normalView,
  output,
  packNormalToRGB,
  renderOutput,
  sample,
  saturation,
  screenSize,
  screenUV,
  step,
  uniform,
  unpackRGBToNormal,
  vec2,
  vec4,
  velocity,
} from 'three/tsl';
import { AgXToneMapping, SRGBColorSpace, UnsignedByteType } from 'three/webgpu';
import type { Node, Texture, UniformNode } from 'three/webgpu';
import { useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu';
import type CameraControlsImpl from 'camera-controls';
import { useControls } from 'leva';

type Output =
  | 'combined'
  | 'denoised SSR'
  | 'compare (denoise)'
  | 'compare (reflections)'
  | 'SSR (raw)'
  | 'ray length'
  | 'accumulation speed';

const OUTPUTS: Output[] = [
  'combined',
  'denoised SSR',
  'compare (denoise)',
  'compare (reflections)',
  'SSR (raw)',
  'ray length',
  'accumulation speed',
];

// Fixed color grade (the original exposes no GUI for these, so they stay constants).
// `exposure` rides on the renderer; the rest are applied after renderOutput().
const GRADING = { gamma: 0.89, contrast: 1.31, saturation: 1 };

export interface SSRDenoisePipelineProps {
  /** Raw equirect HDR — SSR needs CPU-side `image.data` for its env-miss lookup. */
  envMap: Texture;
  /** Camera controls, muted while shift-dragging the compare split. */
  controlsRef: React.RefObject<CameraControlsImpl | null>;
}

export function SSRDenoisePipeline({ envMap, controlsRef }: SSRDenoisePipelineProps) {
  const {
    output: outputMode,
    binaryRefine,
    stepExponent,
    ...ssrValues
  } = useControls('SSR', {
    output: { value: 'combined' as Output, options: OUTPUTS },
    quality: { value: 0.25, min: 0, max: 1, step: 0.01 },
    mirrorBias: { value: 0.5, min: 0, max: 1, step: 0.01 },
    stepExponent: { value: 3, min: 1, max: 4, step: 0.5 },
    binaryRefine: false,
    maxDistance: { value: 0.4, min: 0, max: 5, step: 0.01 },
    intensity: { value: 1, min: 0, max: 4, step: 0.01 },
    thickness: { value: 0.1, min: 0, max: 0.25, step: 0.001 },
    environmentIntensity: { value: 3.14, min: 0, max: 10, step: 0.01 },
  });

  const {
    enabled: denoiseEnabled,
    radius: denoiseRadius,
    ...denoiseValues
  } = useControls('Denoise', {
    enabled: true,
    lumaPhi: { value: 0.75, min: 0, max: 3, step: 0.01 },
    depthPhi: { value: 20, min: 0, max: 50, step: 0.1 },
    normalPhi: { value: 0.3, min: 0.01, max: 1, step: 0.01 },
    alphaPhi: { value: 5, min: 0, max: 15, step: 0.1 },
    radius: { value: 1.5, min: 0, max: 3, step: 0.01 },
    strength: { value: 0.725, min: 0.5, max: 0.95, step: 0.005 },
    adapt: { value: 0.5, min: 0, max: 1, step: 0.01 },
  });

  const { hitPointReprojection, ...reprojectValues } = useControls('Temporal Reproject', {
    maxFrames: { value: 16, min: 1, max: 128, step: 1 },
    clampIntensity: { value: 0.25, min: 0, max: 1, step: 0.01 },
    flickerSuppression: { value: 1, min: 0, max: 1, step: 0.01 },
    hitPointReprojection: true,
  });

  // One uniform set for every float knob across the three folders — the names don't
  // collide, and the denoise on/off switch is just "radius 0" (as in the original).
  const uniforms = useUniforms({
    ...ssrValues,
    ...denoiseValues,
    ...reprojectValues,
    radius: denoiseEnabled ? denoiseRadius : 0,
  });

  const renderer = useThree((s) => s.renderer);

  const { renderPipeline, passes } = useRenderPipeline(
    ({ renderPipeline, passes, camera }) => {
      // Everything downstream samples or copies depth; a multisampled target (fiber's
      // Canvas defaults to MSAA 4x) is rejected outright. TRAA is the AA here.
      passes.scenePass.options.samples = 0;

      const scenePassColor = passes.scenePass.getTextureNode('output');
      const scenePassNormal = passes.scenePass.getTextureNode('normal');
      const scenePassDepth = passes.scenePass.getTextureNode('depth');
      const scenePassVelocity = passes.scenePass.getTextureNode('velocity');
      const scenePassDiffuse = passes.scenePass.getTextureNode('diffuseColor');

      passes.scenePass.getTexture('normal').type = UnsignedByteType;
      passes.scenePass.getTexture('diffuseColor').type = UnsignedByteType;

      const sceneNormal = sample((uv) => unpackRGBToNormal(scenePassNormal.sample(uv).rgb));
      // Metalness rides in diffuseColor.a and roughness in normal.a, so the whole
      // G-buffer is three attachments instead of five.
      const sceneMetalRough = sample((uv) => vec2(scenePassDiffuse.sample(uv).a, scenePassNormal.sample(uv).a));

      // Stochastic SSR: GGX-distributed rays per pixel instead of one mirror ray.
      // Noisy by construction — the denoise chain below is not optional here.
      const ssrNode = ssr(scenePassColor, scenePassDepth, sceneNormal, {
        stochastic: true,
        diffuseNode: scenePassDiffuse,
        metalnessNode: scenePassDiffuse.a,
        roughnessNode: scenePassNormal.a,
        environmentNode: envMap,
      });
      // Env fallback for rays that leave the screen. Needs the raw equirect HDR with
      // CPU-side data — a PMREM cubemap is explicitly not supported.
      ssrNode.setEnvMap(envMap);
      ssrNode.maxLuminance.value = 35;
      ssrNode.quality = uniforms.quality;
      ssrNode.mirrorBias = uniforms.mirrorBias;
      ssrNode.maxDistance = uniforms.maxDistance;
      ssrNode.intensity = uniforms.intensity;
      ssrNode.thickness = uniforms.thickness;
      ssrNode.environmentIntensity = uniforms.environmentIntensity;

      // Stage 2: reproject last frame's reflection along the velocity buffer.
      const reprojectNode = temporalReproject(ssrNode, scenePassDepth, scenePassNormal, scenePassVelocity, camera, {
        mode: 'specular',
        accumulate: false,
      });
      reprojectNode.maxFrames = uniforms.maxFrames;
      reprojectNode.clampIntensity = uniforms.clampIntensity;
      reprojectNode.flickerSuppression = uniforms.flickerSuppression;

      // Stage 3: edge-aware spatial denoise, guided by depth, normals and — because
      // `alphaSource` is 'raylength' — by how far each reflection ray travelled.
      const denoiseNode = recurrentDenoise(reprojectNode, camera, {
        depth: scenePassDepth,
        normal: scenePassNormal,
        raw: ssrNode,
        metalRoughness: sceneMetalRough,
        mode: 'specular',
        accumulate: true,
      });
      denoiseNode.alphaSource = 'raylength';
      denoiseNode.lumaPhi = uniforms.lumaPhi;
      denoiseNode.depthPhi = uniforms.depthPhi;
      denoiseNode.normalPhi = uniforms.normalPhi;
      denoiseNode.alphaPhi = uniforms.alphaPhi;
      denoiseNode.radius = uniforms.radius;
      denoiseNode.strength = uniforms.strength;
      denoiseNode.adapt = uniforms.adapt;

      // The feedback loop: the denoised frame becomes SSR's history, so a ray that
      // hits an already-reflective pixel picks up ITS reflection — multi-bounce.
      ssrNode.setHistory(denoiseNode, scenePassVelocity);
      reprojectNode.setHistoryTexture(denoiseNode);

      const denoisePassBlend = vec4(denoiseNode.rgb, ssrNode.a.greaterThan(0).toVar());
      const combinedNode = vec4(scenePassColor.rgb.add(denoisePassBlend.rgb), 1);

      // Grade -> antialias -> sharpen. Applied per output mode so the debug views are
      // graded identically to the beauty (the raw data views below opt out).
      const applyPost = (source: Node<'vec4'>) => {
        const toned = renderOutput(vec4(source.rgb, 1), AgXToneMapping, SRGBColorSpace).rgb;
        const contrasted = toned.sub(0.5).mul(GRADING.contrast).add(0.5);
        const graded = saturation(contrasted, GRADING.saturation)
          .max(0)
          .pow(1 / GRADING.gamma);
        return sharpen(traa(vec4(graded, 1), scenePassDepth, scenePassVelocity, camera), 0);
      };

      // Split-screen wipe: `left` on one side of the cursor, `right` on the other,
      // with a one-pixel white seam (screenSize replaces the original's hand-fed
      // resolution uniform).
      const uCompareSplit = uniform(0.5);
      const compare = (left: Node<'vec4'>, right: Node<'vec4'>) => {
        const blended = mix(left, right, step(uCompareSplit, screenUV.x));
        const onSeam = float(1).sub(step(float(1).div(screenSize.x), abs(screenUV.x.sub(uCompareSplit))));
        return mix(blended, vec4(1), onSeam);
      };

      // The pipeline callback runs ONCE, so what gets registered is the graph
      // BUILDER: each mode is a different chain, and building on demand beats
      // constructing seven TRAA passes up front. `graded` says whether this chain
      // already did its own tone mapping / color space conversion.
      const buildOutput = (mode: Output): { node: Node<'vec4'>; graded: boolean } => {
        switch (mode) {
          case 'SSR (raw)':
            return { node: applyPost(vec4(ssrNode.rgb, 1)), graded: true };
          case 'denoised SSR':
            return { node: applyPost(vec4(denoiseNode.rgb, 1)), graded: true };
          case 'compare (denoise)':
            return {
              node: compare(applyPost(vec4(denoiseNode.rgb, 1)), applyPost(vec4(ssrNode.rgb, 1))),
              graded: true,
            };
          case 'compare (reflections)':
            return { node: compare(applyPost(combinedNode), applyPost(passes.scenePass)), graded: true };
          case 'accumulation speed':
            return { node: vec4(denoiseNode.aaa, 1), graded: false };
          case 'ray length':
            return { node: vec4(ssrNode.aaa, 1), graded: false };
          default:
            return { node: applyPost(combinedNode), graded: true };
        }
      };

      renderPipeline.outputNode = buildOutput('combined').node;
      renderPipeline.outputColorTransform = false;

      return { ssrNode, reprojectNode, denoiseNode, buildOutput, uCompareSplit };
    },
    ({ passes }) => {
      passes.scenePass.setMRT(
        mrt({
          output,
          // Albedo + metalness in one attachment. Metalness must NOT be pre-applied to
          // the albedo: metals would go black and lose their specular tint.
          diffuseColor: vec4(diffuseColor.rgb, materialMetalness),
          // Packed normals + roughness in the other.
          normal: vec4(packNormalToRGB(normalView).rgb, materialRoughness),
          velocity,
        }),
      );
    },
  );

  // Build-time constants (they rebake the SSR material) and the two bool uniforms
  // `useUniforms` can't express — everything else rides the uniforms above.
  useEffect(() => {
    const ssrNode = passes.ssrNode as ReturnType<typeof ssr> | undefined;
    const reprojectNode = passes.reprojectNode as ReturnType<typeof temporalReproject> | undefined;
    if (!ssrNode || !reprojectNode) return;
    ssrNode.stepExponent = stepExponent;
    ssrNode.binaryRefine = binaryRefine;
    reprojectNode.hitPointReprojection.value = hitPointReprojection;
  }, [passes, stepExponent, binaryRefine, hitPointReprojection]);

  // Pattern (d): each output mode is a whole different chain.
  useEffect(() => {
    const buildOutput = passes.buildOutput as ((mode: Output) => { node: Node<'vec4'>; graded: boolean }) | undefined;
    if (!renderPipeline || !buildOutput) return;
    const { node, graded } = buildOutput(outputMode);
    renderPipeline.outputColorTransform = !graded;
    renderPipeline.outputNode = node;
    renderPipeline.needsUpdate = true;
  }, [renderPipeline, passes, outputMode]);

  // Shift-drag moves the compare seam. The listener goes on the canvas rather than
  // an R3F event handler because it must fire over empty background too, and the
  // camera controls are muted while shift is held so the view doesn't truck.
  useEffect(() => {
    const uCompareSplit = passes.uCompareSplit as UniformNode<unknown, number> | undefined;
    if (!uCompareSplit || !outputMode.startsWith('compare')) return;

    const element = renderer.domElement;
    const controls = controlsRef.current;
    const onPointerMove = (event: PointerEvent) => {
      if (controls) controls.enabled = !event.shiftKey;
      if (!event.shiftKey) return;
      const rect = element.getBoundingClientRect();
      uCompareSplit.value = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    };

    element.addEventListener('pointermove', onPointerMove);
    return () => {
      element.removeEventListener('pointermove', onPointerMove);
      if (controls) controls.enabled = true;
    };
  }, [passes, renderer, controlsRef, outputMode]);

  return null;
}
