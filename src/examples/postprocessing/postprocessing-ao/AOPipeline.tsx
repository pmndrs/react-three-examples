// GTAO + TRAA render pipeline: a dedicated pre-pass (packed normals + velocity via
// MRT) feeds the AO node, whose output modulates the scene's AMBIENT lighting term
// through `builtinAOContext` — not a naive multiply over the final color. TRAA then
// resolves GTAO's per-frame sampling noise using the same pre-pass depth + velocity.
import { useEffect } from 'react';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import {
  builtinAOContext,
  mrt,
  normalView,
  packNormalToRGB,
  pass,
  sample,
  screenUV,
  unpackRGBToNormal,
  vec3,
  vec4,
  velocity,
} from 'three/tsl';
import { NeutralToneMapping, NoToneMapping, UnsignedByteType } from 'three/webgpu';
import { useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

export function AOPipeline() {
  const { temporalFiltering, aoOnly, ...aoValues } = useControls('AO', {
    samples: { value: 16, min: 4, max: 32, step: 1 },
    distanceExponent: { value: 1, min: 1, max: 2, step: 0.01 },
    distanceFallOff: { value: 1, min: 0.01, max: 1, step: 0.01 },
    radius: { value: 0.25, min: 0.1, max: 1, step: 0.01 },
    scale: { value: 0.5, min: 0.01, max: 1, step: 0.01 },
    thickness: { value: 1, min: 0.01, max: 2, step: 0.01 },
    temporalFiltering: true,
    aoOnly: false,
  });
  const uniforms = useUniforms(aoValues);
  const renderer = useThree((s) => s.renderer);

  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, passes, scene, camera }) => {
    // TRAA supersedes MSAA, and pass targets inherit the renderer's sample count
    // (fiber Canvas defaults to MSAA 4x) — multisampled depth breaks TRAA's
    // depth-history copyTextureToTexture. Force both passes to 0 samples, as the
    // original does on its TRAA path (`scenePass.options.samples = useTRAA ? 0 : 4`).
    passes.scenePass.options.samples = 0;

    // Pre-pass: RGB-packed view-space normals + velocity, opaque objects only
    // (the transparent test plane must not occlude). Built here in the mainCB —
    // the callback's RootState carries scene and camera for extra passes.
    const prePass = pass(scene, camera, { samples: 0 });
    prePass.name = 'Pre-Pass';
    prePass.transparent = false;
    prePass.setMRT(mrt({ output: packNormalToRGB(normalView), velocity }));

    // Bandwidth optimization: packed normals fit in 8 bits per channel.
    prePass.getTexture('output').type = UnsignedByteType;

    const prePassNormal = sample((uv) => unpackRGBToNormal(prePass.getTextureNode().sample(uv)));
    const prePassDepth = prePass.getTextureNode('depth');
    const prePassVelocity = prePass.getTextureNode('velocity');

    // GTAO — half resolution is sufficient since TRAA smooths the result. Its knobs
    // are the node's own uniform()-backed fields; swap ours in before the shader
    // compiles, same as bloom's threshold/strength/radius.
    const aoPass = ao(prePassDepth, prePassNormal, camera);
    aoPass.resolutionScale = 0.5;
    aoPass.samples = uniforms.samples;
    aoPass.distanceExponent = uniforms.distanceExponent;
    aoPass.distanceFallOff = uniforms.distanceFallOff;
    aoPass.radius = uniforms.radius;
    aoPass.scale = uniforms.scale;
    aoPass.thickness = uniforms.thickness;

    // Feed the AO term into the scene pass's built-in ambient occlusion context:
    // occlusion darkens ambient/indirect light where geometry creases, instead of
    // flat-multiplying the beauty pass.
    passes.scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);

    // TRAA resolves the temporal noise of GTAO.
    const traaPass = traa(passes.scenePass, prePassDepth, prePassVelocity, camera);
    traaPass.useSubpixelCorrection = false;

    // Debug view: raw AO term as grayscale (swapped in by the effect below).
    const aoOnlyNode = vec4(vec3(aoPass.r), 1);

    renderPipeline.outputNode = traaPass;

    // Return to register — `useTemporalFiltering` is a plain boolean read with JS
    // `===` at update time (not a node, so it can't go through useUniforms), and the
    // AO-only debug swap below both need a live reference after the pipeline compiles.
    return { aoPass, traaPass, aoOnlyNode };
  });

  useEffect(() => {
    const aoPass = passes.aoPass as ReturnType<typeof ao> | undefined;
    if (aoPass) aoPass.useTemporalFiltering = temporalFiltering;
  }, [passes, temporalFiltering]);

  // AO-only debug view: swap the pipeline output between the TRAA beauty chain and
  // the raw AO node, drop tone mapping for the grayscale view (as the original does),
  // and flag the pipeline for an update. Two genuinely different node graphs, not a
  // uniform — the read-back cast is the intended way to consume `passes`.
  useEffect(() => {
    const traaPass = passes.traaPass as ReturnType<typeof traa> | undefined;
    const aoOnlyNode = passes.aoOnlyNode as ReturnType<typeof vec4> | undefined;
    if (!renderPipeline || !traaPass || !aoOnlyNode) return;
    renderPipeline.outputNode = aoOnly ? aoOnlyNode : traaPass;
    renderer.toneMapping = aoOnly ? NoToneMapping : NeutralToneMapping;
    renderPipeline.needsUpdate = true;
  }, [renderPipeline, passes, renderer, aoOnly]);

  return null;
}
