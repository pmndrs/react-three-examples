// Colour grading through a 3D lookup table. Three file formats, three addon loaders,
// one `lut3D()` node — and switching LUTs at runtime is a texture swap, not a rebuild.
import { useEffect, useMemo } from 'react';
import { float, renderOutput, texture3D } from 'three/tsl';
import { lut3D } from 'three/addons/tsl/display/Lut3DNode.js';
import { LUT3dlLoader } from 'three/addons/loaders/LUT3dlLoader.js';
import { LUTCubeLoader } from 'three/addons/loaders/LUTCubeLoader.js';
import { LUTImageLoader } from 'three/addons/loaders/LUTImageLoader.js';
import { useLoader, useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

const lutUrl = (file: string) =>
  `https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/luts/${encodeURIComponent(file)}`;

// One list per file format — needing a different loader for each is the whole reason
// the original juggles three of them. Labels are the file names, minus `.png`.
const CUBE_FILES = ['Bourbon 64.CUBE', 'Chemical 168.CUBE', 'Clayton 33.CUBE', 'Cubicle 99.CUBE', 'Remy 24.CUBE'];
const DL3_FILES = ['Presetpro-Cinematic.3dl'];
const IMAGE_FILES = ['NeutralLUT.png', 'B&WLUT.png', 'NightLUT.png'];

const LUT_NAMES = [...CUBE_FILES, ...DL3_FILES, ...IMAGE_FILES].map((file) => file.replace(/\.png$/, ''));

// `useLoader(Loader, [urls])` fetches N resources in one call, so the original's
// loadAsync/Promise.all/await dance collapses into three lines plus a zip.
function useLutMap() {
  const cube = useLoader(LUTCubeLoader, CUBE_FILES.map(lutUrl));
  const dl3 = useLoader(LUT3dlLoader, DL3_FILES.map(lutUrl));
  const image = useLoader(LUTImageLoader, IMAGE_FILES.map(lutUrl));

  return useMemo(() => {
    const loaded = [...cube, ...dl3, ...image].map((lut) => lut.texture3D);
    return Object.fromEntries(LUT_NAMES.map((name, i) => [name, loaded[i]]));
  }, [cube, dl3, image]);
}

export function LutPipeline() {
  const luts = useLutMap();
  const { lut, intensity } = useControls('Settings', {
    lut: { value: LUT_NAMES[0], options: LUT_NAMES },
    intensity: { value: 1, min: 0, max: 1, step: 0.01 },
  });

  const uniforms = useUniforms({ intensity });

  const { passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    // Ignore the pipeline's automatic output transform and sequence it by hand, so the
    // LUT grades the already tone-mapped, already sRGB-encoded image.
    renderPipeline.outputColorTransform = false;

    const outputPass = renderOutput(passes.scenePass.getTextureNode());

    // Pattern (b): construct with the factory's own default, then assign the uniform
    // onto the field — Lut3DNode reads `this.intensityNode` in setup(), at compile.
    const first = luts[LUT_NAMES[0]];
    const lutPass = lut3D(outputPass, texture3D(first), first.image.width, float(1));
    lutPass.intensityNode = uniforms.intensity;

    renderPipeline.outputNode = lutPass;
    return { lutPass };
  });

  // Switching LUTs swaps the sampled texture and its edge length in place. Both are
  // `.value` writes on nodes the compiled shader already holds — no recompile.
  useEffect(() => {
    const lutPass = passes.lutPass as ReturnType<typeof lut3D> | undefined;
    if (!lutPass) return;
    const texture = luts[lut];
    lutPass.lutNode.value = texture;
    lutPass.size.value = texture.image.width;
  }, [passes, luts, lut]);

  return null;
}
