# Porting backlog — Phase 1 (WebGPU), r185

Generated from `research/data/files_r185.json` vs `src/examples.json`.

**214 webgpu examples in r185 · 129 ported · 85 unported · 10 excluded · 75 TO PORT.**

> **DECIDED 2026-09-02 — 10 excluded, 75 to port.** These r185 `webgpu_*` pages exercise
> renderer internals or measure performance rather than teaching a visual technique, so a
> React port would demonstrate nothing about R3F. They are struck through below and
> enumerated in `docs/SPEC.md` §4, which always said "minus stress/internal tests" without
> listing them.
>
> `sandbox` · `test-memory` · `performance` · `performance-renderbundle` · `pmrem-test` ·
> `furnace-test` · `compile-async` · `multisampled-renderbuffers` ·
> `reversed-depth-buffer` · `centroid-sampling`
>
> `furnace-test` (PBR correctness) and `centroid-sampling` (an MSAA subtlety) are the
> arguable two — revisit if a "renderer correctness" group ever makes sense.

Category is a FIRST GUESS from the slug — the porting agent confirms it and may
place the example elsewhere. Slugs drop the `webgpu_` prefix and kebab-case.

## uncategorised (18)

- [x] ~~`centroid-sampling`~~ — excluded (internal/benchmark)
- [x] ~~`compile-async`~~ — excluded (internal/benchmark)
- [x] ~~`furnace-test`~~ — excluded (internal/benchmark)
- [ ] `modifier-curve`
- [x] ~~`multisampled-renderbuffers`~~ — excluded (internal/benchmark)
- [ ] `particles`
- [x] ~~`performance`~~ — excluded (internal/benchmark)
- [x] ~~`performance-renderbundle`~~ — excluded (internal/benchmark)
- [ ] `pmrem-scene`
- [x] ~~`pmrem-test`~~ — excluded (internal/benchmark)
- [x] ~~`reversed-depth-buffer`~~ — excluded (internal/benchmark)
- [x] ~~`sandbox`~~ — excluded (internal/benchmark)
- [ ] `shadertoy`
- [ ] `storage-buffer`
- [ ] `struct-drawindirect`
- [x] ~~`test-memory`~~ — excluded (internal/benchmark)
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
