# three.js Official Examples Inventory — for R3F v10 (WebGPU-first) Port Planning

Source of truth: `https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json` and
`.../tags.json` (fetched from the `dev` branch — i.e. the *unreleased*, in-progress example set).
Raw `files.json` snapshot saved alongside this report at `research/data/files.json`.

Fetched: 2026-07-26.

## 0. Current three.js release

Per `gh`/GitHub Releases API (`api.github.com/repos/mrdoob/three.js/releases`):

| Tag | Published | webgpu example count (as `"webgpu (wip)"` in that tag's files.json) |
|---|---|---|
| r185 (latest) | 2026-07-01 | 214 |
| r184 | 2026-04-16 | 203 |
| r183 | 2026-02-20 | 196 |
| r182 | 2025-12-10 | 190 |
| r181 | 2025-11-19 | 186 |

**Current release: r185.** The `dev` branch (what `files.json` on `dev` reflects, used for the rest of
this report) is already ahead of r185 with **221** webgpu examples — the category is still labeled
`"webgpu"` on `dev` but `"webgpu (wip)"` in tagged releases, i.e. three.js itself still considers
WebGPU examples pre-stable/in-progress even at r185.

**Growth in the last ~6 months** (comparing tagged snapshots to current `dev`):
- Since r183 (2026-02-20, ~5 months ago): **+26 added**, -1 removed/renamed (`webgpu_lights_tiled` → gone, replaced by more granular light examples) → net +25.
- Since r182 (2025-12-10, ~7.5 months ago): +32 added net.
- Since r181 (2025-11-19, ~8.2 months ago): +36 added net.

So: **roughly 25–30 new WebGPU examples landed in the last 6 months alone** — the category is growing
at ~4-5 new examples/month. A port project needs to treat the WebGPU example set as a moving target,
not a fixed list.

Examples added since r183 (last ~5 months), for reference:
```
webgpu_compile_async, webgpu_compute_rasterizer, webgpu_compute_rasterizer_ibl, webgpu_deferred,
webgpu_furnace_test, webgpu_generator_building, webgpu_generator_city, webgpu_geometry_loft,
webgpu_lightprobes, webgpu_lightprobes_complex, webgpu_lightprobes_sponza, webgpu_lights_clustered,
webgpu_lights_dynamic, webgpu_materials_envmaps_groundprojected, webgpu_materials_retroreflection,
webgpu_materials_texture_html, webgpu_particles_soft, webgpu_postprocessing_ssgi_ballpool,
webgpu_postprocessing_ssr_denoise, webgpu_skinning_instancing_individual, webgpu_texturegather,
webgpu_tsl_graph, webgpu_upscaling_fsr1, webgpu_upscaling_taau, webgpu_volume_fire, webgpu_xr_shadows
```

## 1. Totals

| Top-level category (files.json key) | Count |
|---|---|
| `webgl` | 218 |
| `webgl / postprocessing` | 26 |
| `webgl / advanced` | 48 |
| `webgl / tsl` | 4 |
| **webgl total (all sub-buckets)** | **296** |
| `webgpu` | **221** |
| `webaudio` | 4 |
| `webxr` | 26 |
| `games` | 1 |
| `physics` | 13 |
| `misc` | 22 |
| `css2d` | 1 |
| `css3d` | 7 |
| `svg` | 2 |
| `tests` | 2 |
| **GRAND TOTAL** | **595** |

Of the 595, 221 (37%) are WebGPU/TSL renderer examples, 296 (50%) are classic WebGL, and the
remaining 78 (13%) are renderer-agnostic (physics, webxr, css2d/3d, svg, webaudio, misc, games, tests).

Only 172/595 examples (29%) carry any tags at all in `tags.json` — tags are sparse and can't be relied
on alone for classification; name-pattern heuristics (below) do most of the work.

28 examples are explicitly tagged `community` (third-party plugin/library integrations: Rapier, Jolt,
Ammo physics, three-mesh-bvh, three-gpu-pathtracer, 3D Tiles/Cesium, Lottie, IFC, Rhino 3DM, etc.) —
these depend on external packages beyond three.js itself and should be scoped separately/last in a
port plan.

## 2. Full `webgpu_*` list (221)

```
webgpu_animation_retargeting
webgpu_animation_retargeting_readyplayer
webgpu_backdrop
webgpu_backdrop_area
webgpu_backdrop_water
webgpu_camera
webgpu_camera_array
webgpu_camera_logarithmicdepthbuffer
webgpu_caustics
webgpu_centroid_sampling
webgpu_clearcoat
webgpu_clipping
webgpu_compile_async
webgpu_compute_audio
webgpu_compute_birds
webgpu_compute_cloth
webgpu_compute_geometry
webgpu_compute_particles
webgpu_compute_particles_fluid
webgpu_compute_particles_rain
webgpu_compute_particles_snow
webgpu_compute_points
webgpu_compute_rasterizer
webgpu_compute_rasterizer_ibl
webgpu_compute_reduce
webgpu_compute_sort_bitonic
webgpu_compute_texture
webgpu_compute_texture_3d
webgpu_compute_texture_pingpong
webgpu_compute_water
webgpu_cubemap_adjustments
webgpu_cubemap_dynamic
webgpu_cubemap_mix
webgpu_custom_fog
webgpu_custom_fog_background
webgpu_custom_fog_scattering
webgpu_deferred
webgpu_depth_texture
webgpu_display_stereo
webgpu_equirectangular
webgpu_fog_height
webgpu_furnace_test
webgpu_generator_building
webgpu_generator_city
webgpu_geometry_loft
webgpu_hdr
webgpu_instance_mesh
webgpu_instance_path
webgpu_instance_points
webgpu_instance_sprites
webgpu_instance_uniform
webgpu_instancing_morph
webgpu_layers
webgpu_lensflares
webgpu_lightprobe
webgpu_lightprobe_cubecamera
webgpu_lightprobes
webgpu_lightprobes_complex
webgpu_lightprobes_sponza
webgpu_lights_clustered
webgpu_lights_custom
webgpu_lights_dynamic
webgpu_lights_ies_spotlight
webgpu_lights_phong
webgpu_lights_physical
webgpu_lights_pointlights
webgpu_lights_projector
webgpu_lights_rectarealight
webgpu_lights_selective
webgpu_lights_spotlight
webgpu_lines_fat
webgpu_lines_fat_raycasting
webgpu_lines_fat_wireframe
webgpu_loader_gltf
webgpu_loader_gltf_anisotropy
webgpu_loader_gltf_compressed
webgpu_loader_gltf_dispersion
webgpu_loader_gltf_iridescence
webgpu_loader_gltf_sheen
webgpu_loader_gltf_transmission
webgpu_loader_materialx
webgpu_loader_texture_ktx2
webgpu_materials
webgpu_materials_alphahash
webgpu_materials_arrays
webgpu_materials_basic
webgpu_materials_cubemap_mipmaps
webgpu_materials_displacementmap
webgpu_materials_envmaps
webgpu_materials_envmaps_bpcem
webgpu_materials_envmaps_groundprojected
webgpu_materials_lightmap
webgpu_materials_matcap
webgpu_materials_retroreflection
webgpu_materials_sss
webgpu_materials_texture_html
webgpu_materials_texture_manualmipmap
webgpu_materials_toon
webgpu_materials_transmission
webgpu_materials_video
webgpu_materialx_noise
webgpu_mesh_batch
webgpu_mirror
webgpu_modifier_curve
webgpu_morphtargets
webgpu_morphtargets_face
webgpu_mrt
webgpu_mrt_mask
webgpu_multiple_canvas
webgpu_multiple_elements
webgpu_multiple_rendertargets
webgpu_multiple_rendertargets_readback
webgpu_multisampled_renderbuffers
webgpu_occlusion
webgpu_ocean
webgpu_parallax_uv
webgpu_particles
webgpu_particles_soft
webgpu_performance
webgpu_performance_renderbundle
webgpu_pmrem_cubemap
webgpu_pmrem_equirectangular
webgpu_pmrem_scene
webgpu_pmrem_test
webgpu_portal
webgpu_postprocessing
webgpu_postprocessing_3dlut
webgpu_postprocessing_afterimage
webgpu_postprocessing_anamorphic
webgpu_postprocessing_ao
webgpu_postprocessing_bloom
webgpu_postprocessing_bloom_emissive
webgpu_postprocessing_bloom_selective
webgpu_postprocessing_ca
webgpu_postprocessing_difference
webgpu_postprocessing_dof
webgpu_postprocessing_dof_basic
webgpu_postprocessing_fxaa
webgpu_postprocessing_godrays
webgpu_postprocessing_lensflare
webgpu_postprocessing_masking
webgpu_postprocessing_motion_blur
webgpu_postprocessing_outline
webgpu_postprocessing_pixel
webgpu_postprocessing_radial_blur
webgpu_postprocessing_retro
webgpu_postprocessing_smaa
webgpu_postprocessing_sobel
webgpu_postprocessing_ssaa
webgpu_postprocessing_ssgi
webgpu_postprocessing_ssgi_ballpool
webgpu_postprocessing_ssr
webgpu_postprocessing_ssr_denoise
webgpu_postprocessing_sss
webgpu_postprocessing_traa
webgpu_postprocessing_transition
webgpu_procedural_texture
webgpu_reflection
webgpu_reflection_blurred
webgpu_reflection_roughness
webgpu_refraction
webgpu_rendertarget_2d-array_3d
webgpu_reversed_depth_buffer
webgpu_rtt
webgpu_sandbox
webgpu_shadertoy
webgpu_shadow_contact
webgpu_shadowmap
webgpu_shadowmap_array
webgpu_shadowmap_csm
webgpu_shadowmap_opacity
webgpu_shadowmap_pointlight
webgpu_shadowmap_progressive
webgpu_shadowmap_vsm
webgpu_skinning
webgpu_skinning_instancing
webgpu_skinning_instancing_individual
webgpu_skinning_points
webgpu_sky
webgpu_sprites
webgpu_storage_buffer
webgpu_struct_drawindirect
webgpu_test_memory
webgpu_texturegather
webgpu_texturegrad
webgpu_textures_2d-array
webgpu_textures_2d-array_compressed
webgpu_textures_anisotropy
webgpu_textures_partialupdate
webgpu_tonemapping
webgpu_tsl_angular_slicing
webgpu_tsl_compute_attractors_particles
webgpu_tsl_earth
webgpu_tsl_editor
webgpu_tsl_galaxy
webgpu_tsl_graph
webgpu_tsl_halftone
webgpu_tsl_interoperability
webgpu_tsl_procedural_terrain
webgpu_tsl_raging_sea
webgpu_tsl_transpiler
webgpu_tsl_vfx_flames
webgpu_tsl_vfx_linkedparticles
webgpu_tsl_vfx_tornado
webgpu_tsl_wood
webgpu_upscaling_fsr1
webgpu_upscaling_taau
webgpu_video_frame
webgpu_video_panorama
webgpu_volume_caustics
webgpu_volume_cloud
webgpu_volume_fire
webgpu_volume_lighting
webgpu_volume_lighting_rectarea
webgpu_volume_lighting_traa
webgpu_volume_perlin
webgpu_water
webgpu_xr_cubes
webgpu_xr_native_layers
webgpu_xr_rollercoaster
webgpu_xr_shadows
```

(Plus the 4 examples filed under the separate `webgl / tsl` bucket that are actually TSL-on-WebGL
demos, not WebGPU: `webgl_tsl_shadowmap`, `webgl_tsl_skinning`, `webgl_tsl_clearcoat`,
`webgl_tsl_instancing`. These prove TSL node materials work identically on the WebGL backend and are
relevant to an R3F TSL strategy even though they're not in the `webgpu` bucket.)

## 3. Overlap analysis (webgl ↔ webgpu, matched by name suffix after stripping the renderer prefix)

Matching `webgl_<suffix>` against `webgpu_<suffix>` (exact suffix match only — no fuzzy matching):

| | Count |
|---|---|
| **Overlap** — same suffix exists in both `webgl` (incl. postprocessing/advanced/tsl) and `webgpu` | **77** |
| **webgpu-only** — no webgl example with matching suffix | **144** |
| **webgl-only** — no webgpu example with matching suffix (the gap) | **219** |

So of the 221 webgpu examples, only 77 (35%) are "the same demo, ported to WebGPU" — the other 144
(65%) are WebGPU-exclusive content: compute-shader demos, TSL showcase pieces, deferred rendering,
MRT, procedural generators, etc. that simply don't exist as WebGL examples (either because they need
compute shaders, or because they were written after WebGPU/TSL became the showcase target and nobody
bothered backporting them to WebGL).

Conversely, of the 296 total webgl examples, 219 (74%) have **no** WebGPU counterpart at all — these
are overwhelmingly the loader gallery (3DM, 3DS, Collada, FBX, OBJ, PLY, STL, USDZ, VOX, texture
formats like DDS/EXR/HDR/KTX/TGA/TIFF...), the buffergeometry/custom-attributes teaching set, most of
the geometry primitives gallery, and classic WebGL-specific capability tests (UBOs, `clipCullDistance`,
`OffscreenCanvas` worker rendering, `readPixels`/float buffers) that have no WebGPU equivalent because
WebGPU either doesn't need the workaround or three.js just hasn't built the WebGPU version yet.

**Full overlap list (77 pairs):**
```
webgl_camera <-> webgpu_camera
webgl_camera_array <-> webgpu_camera_array
webgl_camera_logarithmicdepthbuffer <-> webgpu_camera_logarithmicdepthbuffer
webgl_clipping <-> webgpu_clipping
webgl_depth_texture <-> webgpu_depth_texture
webgl_instancing_morph <-> webgpu_instancing_morph
webgl_lensflares <-> webgpu_lensflares
webgl_lightprobe <-> webgpu_lightprobe
webgl_lightprobe_cubecamera <-> webgpu_lightprobe_cubecamera
webgl_lightprobes <-> webgpu_lightprobes
webgl_lightprobes_complex <-> webgpu_lightprobes_complex
webgl_lightprobes_sponza <-> webgpu_lightprobes_sponza
webgl_lights_physical <-> webgpu_lights_physical
webgl_lights_rectarealight <-> webgpu_lights_rectarealight
webgl_lights_spotlight <-> webgpu_lights_spotlight
webgl_lines_fat <-> webgpu_lines_fat
webgl_lines_fat_raycasting <-> webgpu_lines_fat_raycasting
webgl_lines_fat_wireframe <-> webgpu_lines_fat_wireframe
webgl_loader_gltf <-> webgpu_loader_gltf
webgl_loader_gltf_anisotropy <-> webgpu_loader_gltf_anisotropy
webgl_loader_gltf_compressed <-> webgpu_loader_gltf_compressed
webgl_loader_gltf_dispersion <-> webgpu_loader_gltf_dispersion
webgl_loader_gltf_iridescence <-> webgpu_loader_gltf_iridescence
webgl_loader_gltf_sheen <-> webgpu_loader_gltf_sheen
webgl_loader_gltf_transmission <-> webgpu_loader_gltf_transmission
webgl_loader_texture_ktx2 <-> webgpu_loader_texture_ktx2
webgl_materials_alphahash <-> webgpu_materials_alphahash
webgl_materials_cubemap_mipmaps <-> webgpu_materials_cubemap_mipmaps
webgl_materials_displacementmap <-> webgpu_materials_displacementmap
webgl_materials_envmaps <-> webgpu_materials_envmaps
webgl_materials_envmaps_groundprojected <-> webgpu_materials_envmaps_groundprojected
webgl_materials_matcap <-> webgpu_materials_matcap
webgl_materials_texture_html <-> webgpu_materials_texture_html
webgl_materials_texture_manualmipmap <-> webgpu_materials_texture_manualmipmap
webgl_materials_toon <-> webgpu_materials_toon
webgl_materials_video <-> webgpu_materials_video
webgl_mesh_batch <-> webgpu_mesh_batch
webgl_mirror <-> webgpu_mirror
webgl_modifier_curve <-> webgpu_modifier_curve
webgl_morphtargets <-> webgpu_morphtargets
webgl_morphtargets_face <-> webgpu_morphtargets_face
webgl_multiple_elements <-> webgpu_multiple_elements
webgl_multiple_rendertargets <-> webgpu_multiple_rendertargets
webgl_multisampled_renderbuffers <-> webgpu_multisampled_renderbuffers
webgl_performance <-> webgpu_performance
webgl_pmrem_cubemap <-> webgpu_pmrem_cubemap
webgl_pmrem_equirectangular <-> webgpu_pmrem_equirectangular
webgl_pmrem_test <-> webgpu_pmrem_test
webgl_portal <-> webgpu_portal
webgl_postprocessing <-> webgpu_postprocessing
webgl_postprocessing_3dlut <-> webgpu_postprocessing_3dlut
webgl_postprocessing_afterimage <-> webgpu_postprocessing_afterimage
webgl_postprocessing_dof <-> webgpu_postprocessing_dof
webgl_postprocessing_fxaa <-> webgpu_postprocessing_fxaa
webgl_postprocessing_godrays <-> webgpu_postprocessing_godrays
webgl_postprocessing_masking <-> webgpu_postprocessing_masking
webgl_postprocessing_outline <-> webgpu_postprocessing_outline
webgl_postprocessing_pixel <-> webgpu_postprocessing_pixel
webgl_postprocessing_smaa <-> webgpu_postprocessing_smaa
webgl_postprocessing_sobel <-> webgpu_postprocessing_sobel
webgl_postprocessing_ssaa <-> webgpu_postprocessing_ssaa
webgl_postprocessing_ssr <-> webgpu_postprocessing_ssr
webgl_postprocessing_transition <-> webgpu_postprocessing_transition
webgl_refraction <-> webgpu_refraction
webgl_reversed_depth_buffer <-> webgpu_reversed_depth_buffer
webgl_rtt <-> webgpu_rtt
webgl_shadow_contact <-> webgpu_shadow_contact
webgl_shadowmap <-> webgpu_shadowmap
webgl_shadowmap_csm <-> webgpu_shadowmap_csm
webgl_shadowmap_pointlight <-> webgpu_shadowmap_pointlight
webgl_shadowmap_progressive <-> webgpu_shadowmap_progressive
webgl_shadowmap_vsm <-> webgpu_shadowmap_vsm
webgl_sprites <-> webgpu_sprites
webgl_test_memory <-> webgpu_test_memory
webgl_tonemapping <-> webgpu_tonemapping
webgl_volume_cloud <-> webgpu_volume_cloud
webgl_volume_perlin <-> webgpu_volume_perlin
```

Note a handful of *conceptual* (not name-exact) near-matches the suffix match misses, worth folding in
manually during planning: `webgpu_skinning*` ↔ `webgl_animation_skinning_*`; `webgpu_sky` ↔
`webgl_shaders_sky`; `webgpu_ocean`/`webgpu_water` ↔ `webgl_shaders_ocean`/`webgl_gpgpu_water`;
`webgpu_particles` ↔ `webgl_gpgpu_birds`/`webgl_points_*`; `webgpu_compute_birds` ↔
`webgl_gpgpu_birds`; `webgpu_loader_materialx`/`webgpu_materialx_noise` ↔ nothing in webgl (MaterialX
is TSL/WebGPU-only). These are judgment calls, not counted in the 77/144/219 numbers above.

**Full webgl-only (no webgpu counterpart) list — 219 examples** — grouped by rough theme for
readability (full flat list is in `research/data/files.json`, key `webgl`/`webgl / advanced`/etc.):

- **Loaders with no WebGPU version (35):** `webgl_loader_3dm, _3ds, _3dtiles, _3mf, _3mf_materials, _amf, _bvh, _collada, _collada_kinematics, _collada_skinning, _draco, _fbx, _fbx_nurbs, _gcode, _gltf_animation_pointer, _gltf_avif, _gltf_instancing, _gltf_progressive_lod, _gltf_variants, _ifc, _imagebitmap, _kmz, _ldraw, _md2, _md2_control, _mdd, _nrrd, _obj, _pcd, _pdb, _ply, _stl, _svg, _texture_dds, _texture_exr, _texture_hdr, _texture_ktx, _texture_lottie, _texture_pvrtc, _texture_tga, _texture_tiff, _texture_ultrahdr, _ttf, _usdz, _vox, _vrml, _xyz`
- **BufferGeometry / custom attributes teaching set (23):** `webgl_buffergeometry*` (17 variants), `webgl_custom_attributes*` (5 variants), `webgl_gpgpu_birds/_gltf/_protoplanet/_water` style low-level geometry teaching
- **Geometry primitives gallery (16):** `webgl_geometries, geometry_colors(+lookuptable), geometry_convex, geometry_csg, geometry_cube, geometry_extrude_shapes/_splines, geometry_minecraft, geometry_nurbs, geometry_shapes, geometry_spline_editor, geometry_teapot, geometry_terrain(+raycast), geometry_text(+shapes/+stroke)`
- **Animation/skinning without a webgpu twin (5):** `webgl_animation_keyframes, animation_multiple, animation_skinning_additive_blending, animation_skinning_blending, animation_skinning_ik, animation_skinning_morph, animation_walk`
- **Materials, not yet ported (23):** `webgl_materials_blending(+custom), bumpmap, car, channels, cubemap(+dynamic/+refraction/+render_to_mipmaps), envmaps_exr/_fasthdr/_hdr, modified, normalmap(+object_space), physical_clearcoat, physical_transmission(+alpha), subsurface_scattering, texture_anisotropy, texture_canvas, texture_filters, texture_partialupdate, texture_rotation, video_webcam, wireframe`
- **Interactive / picking demos (9):** `webgl_interactive_buffergeometry, _cubes, _cubes_gpu, _cubes_ortho, _lines, _points, _raycasting_points, _voxelpainter`
- **Points/sprites/lines (7):** `webgl_points_billboards, _dynamic, _sprites, _waves, lines_colors, lines_dashed`
- **Postprocessing not yet on webgpu (12):** `webgl_postprocessing_advanced, backgrounds, dof2, glitch, gtao, rgb_halftone, sao, ssao, taa, unreal_bloom(+selective), procedural`
- **Advanced/capability tests, WebGL-specific (13):** `webgl_clipculldistance, ubo(+arrays), texture2darray(+compressed/+layerupdate), texture3d(+partialupdate), rendertarget_texture2darray, worker_offscreencanvas, read_float_buffer, test_wide_gamut, test_memory2`
- **Misc / effects / shaders (remaining ~76):** decals, effects (anaglyph/ascii/parallaxbarrier/stereo), framebuffer_texture, helpers, instancing_dynamic/_performance/_raycast/_scatter, lights_hemisphere/_spotlights, lod, marchingcubes, math_obb/_orientation_transform, modifier_curve_instanced/_edgesplit/_simplifier/_subdivision/_tessellation, morphtargets_horse/_sphere/_webcam, multiple_elements_text, multiple_scenes_comparison, multiple_views, panorama_cube/_equirectangular, random_uv, raycaster_bvh/_sprite/_texture, renderer_pathtracer, shader, shader_lava, shaders_ocean/_sky, shadowmap_pcss/_performance/_viewer, shadowmesh, simple_gi, video_kinect, video_panorama_equirectangular, volume_instancing, watch, and the 4 `webgl_tsl_*` (which prove out on WebGL already)

## 4. Classification (judgment call, based on naming + tags — applied to the 221 `webgpu_*` set)

Four buckets, in priority order for a port (i.e. check higher buckets first):

### (d) WebXR-dependent — 4 in the `webgpu` bucket, +26 more in the dedicated `webxr` category
`webgpu_xr_cubes, webgpu_xr_native_layers, webgpu_xr_rollercoaster, webgpu_xr_shadows`. Requires a
device/emulator to test at all; low priority for an initial R3F port pass since `@react-three/xr`
integration is its own workstream. The `webxr` top-level category (26 examples, all still WebGL-only —
none of the 26 have a `webgpu_xr_*` equivalent except the 4 above happening to also live under
`webgpu`) covers AR/VR controllers, hand input, hit-testing, teleport, haptics — genuinely useful
patterns for `@react-three/xr` but a separate track from the WebGPU renderer port.

### (b) API / stress / device-capability tests — 21
Things that exercise renderer internals, GPU limits, or are dev-tooling rather than "here's how you
build a scene": `webgpu_centroid_sampling, webgpu_compile_async, webgpu_display_stereo,
webgpu_furnace_test, webgpu_multiple_canvas, webgpu_multiple_elements,
webgpu_multiple_rendertargets_readback, webgpu_multisampled_renderbuffers, webgpu_performance,
webgpu_performance_renderbundle, webgpu_pmrem_test, webgpu_rendertarget_2d-array_3d,
webgpu_reversed_depth_buffer, webgpu_sandbox, webgpu_struct_drawindirect, webgpu_test_memory,
webgpu_texturegather, webgpu_texturegrad, webgpu_tsl_editor, webgpu_tsl_graph,
webgpu_tsl_transpiler`. These are low/no value to port as R3F "examples" — they belong in a
conformance/smoke-test suite, not a showcase, though a few (`compile_async`, `performance_renderbundle`)
are legitimately useful perf-pattern references for advanced users.

### (c) Loader demos — 9
`webgpu_loader_gltf` (+6 material-feature variants: anisotropy, compressed, dispersion, iridescence,
sheen, transmission), `webgpu_loader_materialx`, `webgpu_loader_texture_ktx2`. Small set on the
WebGPU side because most of the loader gallery (35 formats — see §3) simply hasn't been ported off
WebGL; loader support is orthogonal to the renderer backend so these largely just need the loader
wired into a WebGPURenderer-backed `<Canvas>` — genuinely low-effort, high-value ports for a "does my
GLTF pipeline work" R3F story.

### (a) Teaching-value examples — 187 (the remainder, default bucket)
Everything else: materials, lights, shadows, postprocessing pipeline, compute-shader/GPGPU particle
systems, TSL node-material showcases (galaxy, earth, wood, halftone, raging_sea, VFX flames/tornado/
linked-particles, procedural terrain), reflections/refraction, PMREM/env-map handling, MRT, deferred
rendering, animation retargeting, skinning+instancing, volumetrics (fire/cloud/caustics/lighting),
upscaling (FSR1/TAAU), video textures/WebCodecs. This is the bulk of what a "port ALL examples" project
should actually prioritize — it's the part that teaches an R3F user a WebGPU/TSL technique they'd
reach for in a real app. Within this bucket, the ~30 `webgpu_tsl_*` and `webgpu_compute_*` examples
are the highest-signal "why WebGPU/TSL matters" content since they have no WebGL equivalent at all.

## 5. What "port ALL examples" means in practice

- **595 total examples** exist upstream today (`dev` branch); **221 are WebGPU** (37%), growing ~5/month.
- If "port ALL" means *all WebGPU examples*: that's 221 targets, of which realistically ~187 are
  teaching-value ports, ~21 are internal tests better handled as automated conformance checks than
  showcase pages, 9 are loader demos, and 4 are XR-gated (needs `@react-three/xr` + a device).
- If "port ALL" means *the full site* (595): the majority (219 examples, 37% of the whole site) are
  WebGL-only content with zero WebGPU equivalent today — mostly the loader format gallery (35 file
  formats) and low-level BufferGeometry/attribute teaching examples. Porting those to R3F is
  independent of the WebGPU-first goal and would need its own WebGL-backed `<Canvas>` track (R3F
  supports both renderers, so this is feasible, just a second lane of work).
- The 77-example overlap set is the natural **first milestone**: same concept exists on both
  renderers upstream, so an R3F port can build one component that swaps cleanly between
  `WebGPURenderer`/`WebGLRenderer` and validate the abstraction against real parity data rather than
  guessing.
- Because upstream is actively adding ~5 WebGPU examples/month, this inventory will drift — worth
  re-running the fetch+diff step periodically (the r18x tag comparison technique above works well for
  tracking exactly what's new) rather than treating this file as a one-time snapshot.
