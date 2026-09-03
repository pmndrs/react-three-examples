# Porting backlog — Phase 1 (WebGPU), r185

Generated from `research/data/files_r185.json` vs `src/examples.json`.

**214 in r185 · 198 ported · 13 excluded · 3 deferred · 0 TO PORT — Phase 1 complete.**

> Checkboxes are the source of truth; the counts above are hand-updated. After a wave,
> re-tick with `node scripts/tick-backlog.mjs` — anything present in `src/examples.json`
> is ported.

Category is a FIRST GUESS from the slug — the porting agent confirms it and may
place the example elsewhere. Slugs drop the `webgpu_` prefix and kebab-case.

## uncategorised (18)

- [x] ~~`centroid-sampling`~~ — excluded (internal/benchmark)
- [x] ~~`compile-async`~~ — excluded (internal/benchmark)
- [x] ~~`furnace-test`~~ — excluded (internal/benchmark)
- [x] ~~`modifier-curve`~~ — ported
- [x] ~~`multisampled-renderbuffers`~~ — excluded (internal/benchmark)
- [x] ~~`particles`~~ — ported
- [x] ~~`performance`~~ — excluded (internal/benchmark)
- [x] ~~`performance-renderbundle`~~ — excluded (internal/benchmark)
- [x] ~~`pmrem-scene`~~ — ported
- [x] ~~`pmrem-test`~~ — excluded (internal/benchmark)
- [x] ~~`reversed-depth-buffer`~~ — excluded (internal/benchmark)
- [x] ~~`sandbox`~~ — excluded (internal/benchmark)
- [x] ~~`shadertoy`~~ — ported
- [x] ~~`storage-buffer`~~ — ported
- [x] ~~`struct-drawindirect`~~ — ported
- [x] ~~`test-memory`~~ — excluded (internal/benchmark)
- [x] ~~`upscaling-fsr1`~~ — ported
- [x] ~~`upscaling-taau`~~ — ported

## postprocessing (14)

- [x] ~~`postprocessing-3dlut`~~ — ported
- [x] ~~`postprocessing-difference`~~ — ported
- [x] ~~`postprocessing-dof-basic`~~ — ported
- [x] ~~`postprocessing-masking`~~ — ported
- [x] ~~`postprocessing-radial-blur`~~ — ported
- [x] ~~`postprocessing-retro`~~ — ported
- [x] ~~`postprocessing-ssaa`~~ — ported
- [x] ~~`postprocessing-ssgi`~~ — ported
- [x] ~~`postprocessing-ssgi-ballpool`~~ — ported
- [x] ~~`postprocessing-ssr`~~ — ported
- [x] ~~`postprocessing-ssr-denoise`~~ — ported
- [x] ~~`postprocessing-sss`~~ — ported
- [x] ~~`postprocessing-traa`~~ — ported
- [x] ~~`postprocessing-transition`~~ — ported

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

- [x] ~~`compute-audio`~~ — ported (webaudio wave, 2026-09-03)
- [x] ~~`compute-particles-fluid`~~ — ported
- [x] ~~`compute-rasterizer`~~ — ported
- [x] ~~`compute-rasterizer-ibl`~~ — ported
- [x] ~~`compute-reduce`~~ — ported
- [x] ~~`compute-sort-bitonic`~~ — ported
- [x] ~~`water`~~ — ported

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

- [x] ~~`tsl-editor`~~ — excluded (internal tooling — a Monaco editor / Inspector UI, not a scene; not porting — Dennis, 2026-09-03)
- [x] ~~`tsl-graph`~~ — excluded (internal tooling — a Monaco editor / Inspector UI, not a scene; not porting — Dennis, 2026-09-03)
- [x] ~~`tsl-interoperability`~~ — ported
- [x] ~~`tsl-transpiler`~~ — excluded (internal tooling — a Monaco editor / Inspector UI, not a scene; not porting — Dennis, 2026-09-03)
- [x] ~~`tsl-vfx-linkedparticles`~~ — ported

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

- [x] ~~`caustics`~~ — ported
