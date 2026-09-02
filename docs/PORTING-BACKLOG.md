# Porting backlog — Phase 1 (WebGPU), r185

Generated from `research/data/files_r185.json` vs `src/examples.json`.

**214 webgpu examples in r185 · 129 ported · 85 remaining.**

> **Not all 85 are showcase demos.** These read as three.js internal test/benchmark
> pages rather than things worth porting — they demonstrate renderer internals, not a
> visual idea. Recommend cutting them (a decision for Dennis, not the porting agent):
>
> `sandbox` · `test-memory` · `performance` · `performance-renderbundle` ·
> `pmrem-test` · `furnace-test` · `compile-async` · `multisampled-renderbuffers` ·
> `reversed-depth-buffer` · `centroid-sampling`
>
> Cutting those leaves **75** genuine ports. Some are arguable — `furnace-test` is a
> real PBR-correctness check and `centroid-sampling` teaches a genuine MSAA subtlety —
> so this is a curation call, not a mechanical one.

Category is a FIRST GUESS from the slug — the porting agent confirms it and may
place the example elsewhere. Slugs drop the `webgpu_` prefix and kebab-case.

## uncategorised (18)

- [ ] `centroid-sampling`
- [ ] `compile-async`
- [ ] `furnace-test`
- [ ] `modifier-curve`
- [ ] `multisampled-renderbuffers`
- [ ] `particles`
- [ ] `performance`
- [ ] `performance-renderbundle`
- [ ] `pmrem-scene`
- [ ] `pmrem-test`
- [ ] `reversed-depth-buffer`
- [ ] `sandbox`
- [ ] `shadertoy`
- [ ] `storage-buffer`
- [ ] `struct-drawindirect`
- [ ] `test-memory`
- [ ] `upscaling-fsr1`
- [ ] `upscaling-taau`

## postprocessing (14)

- [ ] `postprocessing-3dlut`
- [ ] `postprocessing-difference`
- [ ] `postprocessing-dof-basic`
- [ ] `postprocessing-masking`
- [ ] `postprocessing-radial-blur`
- [ ] `postprocessing-retro`
- [ ] `postprocessing-ssaa`
- [ ] `postprocessing-ssgi`
- [ ] `postprocessing-ssgi-ballpool`
- [ ] `postprocessing-ssr`
- [ ] `postprocessing-ssr-denoise`
- [ ] `postprocessing-sss`
- [ ] `postprocessing-traa`
- [ ] `postprocessing-transition`

## scene (10)

- [ ] `custom-fog-background`
- [ ] `custom-fog-scattering`
- [ ] `generator-building`
- [ ] `generator-city`
- [ ] `hdr`
- [ ] `multiple-canvas`
- [ ] `multiple-elements`
- [ ] `xr-cubes`
- [ ] `xr-native-layers`
- [ ] `xr-rollercoaster`

## compute (7)

- [ ] `compute-audio`
- [ ] `compute-particles-fluid`
- [ ] `compute-rasterizer`
- [ ] `compute-rasterizer-ibl`
- [ ] `compute-reduce`
- [ ] `compute-sort-bitonic`
- [ ] `water`

## lights (6)

- [ ] `lightprobe`
- [ ] `lightprobe-cubecamera`
- [ ] `lights-clustered`
- [ ] `lights-custom`
- [ ] `lights-dynamic`
- [ ] `volume-lighting-traa`

## reflections (5)

- [ ] `cubemap-adjustments`
- [ ] `cubemap-mix`
- [ ] `equirectangular`
- [ ] `pmrem-cubemap`
- [ ] `reflection-roughness`

## geometry (5)

- [ ] `instance-path`
- [ ] `instancing-morph`
- [ ] `lines-fat-raycasting`
- [ ] `lines-fat-wireframe`
- [ ] `skinning-instancing-individual`

## materials (5)

- [ ] `loader-materialx`
- [ ] `materials`
- [ ] `materials-envmaps-bpcem`
- [ ] `materials-texture-html`
- [ ] `materialx-noise`

## tsl (5)

- [ ] `tsl-editor`
- [ ] `tsl-graph`
- [ ] `tsl-interoperability`
- [ ] `tsl-transpiler`
- [ ] `tsl-vfx-linkedparticles`

## textures (4)

- [ ] `loader-texture-ktx2`
- [ ] `texturegather`
- [ ] `texturegrad`
- [ ] `video-frame`

## animation (3)

- [ ] `animation-retargeting-readyplayer`
- [ ] `morphtargets-face`
- [ ] `skinning`

## camera (2)

- [ ] `camera-logarithmicdepthbuffer`
- [ ] `display-stereo`

## volume (1)

- [ ] `caustics`
