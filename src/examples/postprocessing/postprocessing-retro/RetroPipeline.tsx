// The CRT stack. `retroPass()` re-renders the scene with PS1-era materials (affine
// texture warping, no mip selection), then six chained TSL helpers add the television
// on top: barrel glass, colour bleed, dithered 15-bit colour, vignette, scanlines.
import { useEffect } from 'react';
import type { Node } from 'three/webgpu';
import { posterize, replaceDefaultUV, screenSize } from 'three/tsl';
import { retroPass } from 'three/addons/tsl/display/RetroPassNode.js';
import { bayerDither } from 'three/addons/tsl/math/Bayer.js';
import { barrelUV, colorBleeding, scanlines, vignette } from 'three/addons/tsl/display/CRT.js';
import { circle } from 'three/addons/tsl/display/Shape.js';
import { useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

export function RetroPipeline({ model }: { model: string }) {
  const { enabled, filterTextures, ...values } = useControls('Settings', {
    enabled: { label: 'Retro Pipeline', value: true },
    curvature: { label: 'Curvature', value: 0.02, min: 0, max: 0.2, step: 0.01 },
    // PS1-style 15-bit colour: 32 levels per channel.
    colorDepthSteps: { label: 'Color Depth', value: 32, min: 4, max: 32, step: 1 },
    scanlineIntensity: { label: 'Scanlines', value: 0.3, min: 0, max: 1, step: 0.01 },
    scanlineDensity: { label: 'Scanline Density', value: 1, min: 0.02, max: 1, step: 0.01 },
    scanlineSpeed: { label: 'Scanline Speed', value: 0, min: 0, max: 0.1, step: 0.01 },
    vignetteIntensity: { label: 'Vignette', value: 0.3, min: 0, max: 1, step: 0.01 },
    bleeding: { label: 'Color Bleeding', value: 0.001, min: 0, max: 0.005, step: 0.001 },
    affineDistortion: { label: 'Affine Distortion', value: 0, min: 0, max: 1, step: 0.01 },
    filterTextures: { label: 'Filter Textures', value: false },
  });

  // Pattern (a): every knob here is a plain float we introduce, and each CRT helper is
  // an Fn() that uses the node it is handed as-is — no re-wrapping, so one useUniforms
  // call carries all eight and no per-uniform effect is needed.
  const uniforms = useUniforms(values);

  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, scene, camera }) => {
    // The glass: a barrel warp of the sampling UVs, plus a matching outward smear of
    // the colour-bleed radius so the fringing widens towards the edges of the tube.
    const distortedUV = barrelUV(uniforms.curvature);
    const distortedDelta = circle(uniforms.curvature.add(0.1).mul(10), 1).mul(uniforms.curvature).mul(0.05);

    const retro = retroPass(scene, camera, { affineDistortion: uniforms.affineDistortion });

    // Concrete node type so the chain below keeps resolving — every CRT helper from
    // colorBleeding() onward both takes and returns a vec3.
    let retroPipeline: Node<'vec3'> = colorBleeding(
      replaceDefaultUV(distortedUV, retro),
      uniforms.bleeding.add(distortedDelta),
    );
    retroPipeline = bayerDither(retroPipeline, uniforms.colorDepthSteps);
    retroPipeline = posterize(retroPipeline, uniforms.colorDepthSteps);
    retroPipeline = vignette(retroPipeline, uniforms.vignetteIntensity, 0.6);
    retroPipeline = scanlines(
      retroPipeline,
      uniforms.scanlineIntensity,
      screenSize.y.mul(uniforms.scanlineDensity),
      uniforms.scanlineSpeed,
    );

    renderPipeline.outputNode = retroPipeline;

    return { retro, retroPipeline };
  });

  // `filterTextures` is NOT a uniform — the pass bakes it into each retro material it
  // caches, so it takes a plain assignment plus a cache drop. Dropping the cache is
  // also how the original picks up an environment map that arrived after a model swap.
  useEffect(() => {
    const retro = passes.retro as ReturnType<typeof retroPass> | undefined;
    if (!retro) return;
    retro.filterTextures = filterTextures;
    retro.dispose();
  }, [passes, filterTextures, model]);

  // Pattern (d): the bypass has no field to write, so swap the whole outputNode
  // between the CRT graph and fiber's plain scene pass and force a rebuild.
  useEffect(() => {
    const retroPipeline = passes.retroPipeline as Node | undefined;
    if (!renderPipeline || !retroPipeline) return;
    renderPipeline.outputNode = enabled ? retroPipeline : passes.scenePass;
    renderPipeline.needsUpdate = true;
  }, [renderPipeline, passes, enabled]);

  return null;
}
