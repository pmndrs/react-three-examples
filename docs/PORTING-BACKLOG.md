# Porting backlog — Phase 1 (WebGPU), r185

Generated from `research/data/files_r185.json` vs `src/examples.json`.

**214 in r185 · 129 ported · 85 unported · 10 excluded · 7 deferred · 68 TO PORT.**

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

> **DEFERRED 2026-09-02 — 7 more, by rules SPEC §4 already had.** Nobody had applied them
> to this list. WebXR (`xr-cubes`, `xr-native-layers`, `xr-rollercoaster`) and webaudio
> (`compute-audio`) are "explicitly out of scope for now — final-phase items"; the TSL
> tooling pages (`tsl-editor`, `tsl-transpiler`, `tsl-graph`) are "a later-phase project,
> not v1". Deferred, not excluded — they come back in a later phase.
>
> **Net: 68 ports in Phase 1.**

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
- [x] ~~`xr-cubes`~~ — deferred (WebXR — SPEC §4 out of scope for now)
- [x] ~~`xr-native-layers`~~ — deferred (WebXR — SPEC §4 out of scope for now)
- [x] ~~`xr-rollercoaster`~~ — deferred (WebXR — SPEC §4 out of scope for now)

## compute (7)

- [x] ~~`compute-audio`~~ — deferred (webaudio — SPEC §4 out of scope for now)
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

- [x] ~~`tsl-editor`~~ — deferred (TSL editor/transpiler — SPEC §4 later-phase project, not v1)
- [x] ~~`tsl-graph`~~ — deferred (TSL editor/transpiler — SPEC §4 later-phase project, not v1)
- [ ] `tsl-interoperability`
- [x] ~~`tsl-transpiler`~~ — deferred (TSL editor/transpiler — SPEC §4 later-phase project, not v1)
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
