# Porting backlog — Phase 1 (WebGPU), r185

Generated from `research/data/files_r185.json` vs `src/examples.json`.

**214 in r185 · 145 ported · 10 excluded · 7 deferred · 52 TO PORT.**

> Checkboxes are the source of truth; the counts above are hand-updated. After a wave,
> re-tick with `node scripts/tick-backlog.mjs` — anything present in `src/examples.json`
> is ported.

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

- [x] ~~`custom-fog-background`~~ — ported
- [x] ~~`custom-fog-scattering`~~ — ported
- [x] ~~`generator-building`~~ — ported
- [x] ~~`generator-city`~~ — ported
- [x] ~~`hdr`~~ — ported
- [x] ~~`multiple-canvas`~~ — ported
- [x] ~~`multiple-elements`~~ — ported
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

- [x] ~~`lightprobe`~~ — ported
- [x] ~~`lightprobe-cubecamera`~~ — ported
- [x] ~~`lights-clustered`~~ — ported
- [x] ~~`lights-custom`~~ — ported
- [x] ~~`lights-dynamic`~~ — ported
- [x] ~~`volume-lighting-traa`~~ — ported

## reflections (5)

- [x] ~~`cubemap-adjustments`~~ — ported
- [x] ~~`cubemap-mix`~~ — ported
- [x] ~~`equirectangular`~~ — ported
- [x] ~~`pmrem-cubemap`~~ — ported
- [x] ~~`reflection-roughness`~~ — ported

## geometry (5)

- [x] ~~`instance-path`~~ — ported
- [x] ~~`instancing-morph`~~ — ported
- [x] ~~`lines-fat-raycasting`~~ — ported
- [x] ~~`lines-fat-wireframe`~~ — ported
- [x] ~~`skinning-instancing-individual`~~ — ported

## materials (5)

- [x] ~~`loader-materialx`~~ — ported
- [x] ~~`materials`~~ — ported
- [x] ~~`materials-envmaps-bpcem`~~ — ported
- [x] ~~`materials-texture-html`~~ — ported
- [x] ~~`materialx-noise`~~ — ported

## tsl (5)

- [x] ~~`tsl-editor`~~ — deferred (TSL editor/transpiler — SPEC §4 later-phase project, not v1)
- [x] ~~`tsl-graph`~~ — deferred (TSL editor/transpiler — SPEC §4 later-phase project, not v1)
- [ ] `tsl-interoperability`
- [x] ~~`tsl-transpiler`~~ — deferred (TSL editor/transpiler — SPEC §4 later-phase project, not v1)
- [ ] `tsl-vfx-linkedparticles`

## textures (4)

- [x] ~~`loader-texture-ktx2`~~ — ported
- [x] ~~`texturegather`~~ — ported
- [x] ~~`texturegrad`~~ — ported
- [x] ~~`video-frame`~~ — ported

## animation (3)

- [x] ~~`animation-retargeting-readyplayer`~~ — ported
- [x] ~~`morphtargets-face`~~ — ported
- [x] ~~`skinning`~~ — ported

## camera (2)

- [x] ~~`camera-logarithmicdepthbuffer`~~ — ported
- [x] ~~`display-stereo`~~ — ported

## volume (1)

- [ ] `caustics`
