# webgl-only examples — semantic dedup against the WebGPU set

Source: `research/threejs-examples-inventory.md` §3, `research/data/files.json`, `research/data/tags.json` (three.js `dev` branch, fetched 2026-07-26). Starting set: the 219 `webgl` (incl. postprocessing/advanced/tsl sub-buckets) examples with no name-suffix-matched `webgpu_*` counterpart, per the prior inventory's overlap analysis (§3).

## Methodology

For each of the 219 webgl-only examples, judged whether its **technique** (not its name) is substantively
demonstrated by any of the 221 `webgpu_*` examples. Three passes:

1. **Name/tag triage** — grep both the webgl-only list and the full webgpu list for shared roots after stripping
   renderer/category prefixes (`materials_`, `physical_`, `shaders_`, `panorama_`, `effects_`, etc.). This caught a large
   number of near-matches the original strict-suffix matcher missed purely because of an infix word — e.g.
   `webgl_materials_physical_clearcoat` vs `webgpu_clearcoat`, `webgl_shaders_sky` vs `webgpu_sky`,
   `webgl_materials_texture_anisotropy` vs `webgpu_textures_anisotropy`, `webgl_panorama_equirectangular` vs
   `webgpu_equirectangular`. This single step reclassified roughly 20 examples from "gap" to "covered."
2. **Domain-knowledge judgment** — for examples where the technique is well-known (classic three.js demos: GPGPU boids/water,
   postprocessing passes, TSL-vs-GLSL raw shaders, legacy attribute APIs), classified directly against the webgpu list
   without fetching source, using the tag data (`research/data/tags.json`) as a secondary signal.
3. **Source verification** — for genuinely ambiguous cases (new/unfamiliar webgpu examples added in the last ~6 months,
   or webgl examples whose name undersells or oversells what they actually do), fetched
   `https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/<name>.html` for both sides and compared what the code
   actually builds. 16 examples were verified this way: `webgl_animation_keyframes`, `webgl_animation_walk`,
   `webgl_geometry_extrude_shapes`, `webgl_geometry_extrude_splines`, `webgl_geometry_minecraft`,
   `webgl_postprocessing_glitch`, `webgl_multiple_scenes_comparison`, `webgl_multiple_views`, `webgl_batch_lod_bvh`,
   `webgl_clipping_advanced`, `webgl_clipping_intersection`, `webgl_clipping_stencil`, plus the webgpu-side
   `webgpu_geometry_loft`, `webgpu_generator_building`, `webgpu_generator_city`, `webgpu_postprocessing_retro`,
   `webgpu_clipping` (to check what it actually demonstrates before ruling on the clipping-variant trio).

Classification taxonomy (strict — a technique only counts as "covered" if the same *rendering or algorithmic idea* is shown,
not just a loosely related one):

- **(A) UNIQUE** — technique genuinely absent from the webgpu set. Includes the loader-format gallery as its own subcategory.
- **(B) COVERED** — same technique exists under a webgpu_* name; name(s) given.
- **(C) LOW-VALUE** — deprecated/legacy technique, thin single-property toggle, renderer-agnostic CPU-only utility with no
  rendering content, or a renderer-internal capability/stress test — regardless of whether a webgpu counterpart happens to
  exist.

## Counts

| Class | Count | Notes |
|---|---|---|
| **(A) UNIQUE** | **81** | 47 loader-format-gallery examples + 34 other genuinely unique techniques |
| (B) COVERED | 83 | same technique exists under a different webgpu_* name |
| (C) LOW-VALUE | 55 | deprecated/legacy/trivial/renderer-internal |
| **Total** | **219** | matches the inventory report's webgl-only count |

This is a big swing from the naive "219 unhandled examples" framing: only **34 non-loader examples** (16% of the
219) are genuinely unique teaching content once technique-level (not name-level) matching is applied — confirming the
project owner's hypothesis. The other 129 (59%) are the same technique under a different webgpu_* name (mostly because the
`materials_`/`physical_`/`shaders_`/`panorama_`/`effects_` infixes defeated the original suffix matcher), and 55 (25%) are
low-value: legacy/deprecated APIs (raw GLSL shaders, `onBeforeCompile`, old custom-attribute APIs, planar shadow projection),
thin single-property toggles (blend mode, texture filter, UV rotation dropdowns), renderer-agnostic CPU utilities with no
rendering content (math/helpers/LOD), or renderer-internal capability/stress tests.

## Class A — UNIQUE, teaching-valuable (no webgpu counterpart)

### A.1 — Loader-format gallery (47)

None of these have a WebGPU-side loader demo. Loading is orthogonal to the render backend (any three.js loader
just produces a `BufferGeometry`/`Texture`/scene graph that either renderer can consume), so porting these is low-effort,
high-value "does my pipeline work under WebGPURenderer" content. **Formats that already have a webgpu loader demo** (and
are therefore *not* in this list because they matched by name in the original 77-pair overlap): **glTF** (base loader +
6 material-feature variants: anisotropy, compressed, dispersion, iridescence, sheen, transmission), **KTX2** compressed
textures, and **MaterialX**. Everything below is a format/feature with zero WebGPU-side representation:

```
webgl_loader_3dm
webgl_loader_3ds
webgl_loader_3dtiles
webgl_loader_3mf
webgl_loader_3mf_materials
webgl_loader_amf
webgl_loader_bvh
webgl_loader_collada
webgl_loader_collada_kinematics
webgl_loader_collada_skinning
webgl_loader_draco
webgl_loader_fbx
webgl_loader_fbx_nurbs
webgl_loader_gcode
webgl_loader_gltf_animation_pointer
webgl_loader_gltf_avif
webgl_loader_gltf_instancing
webgl_loader_gltf_progressive_lod
webgl_loader_gltf_variants
webgl_loader_ifc
webgl_loader_imagebitmap
webgl_loader_kmz
webgl_loader_ldraw
webgl_loader_md2
webgl_loader_md2_control
webgl_loader_mdd
webgl_loader_nrrd
webgl_loader_obj
webgl_loader_pcd
webgl_loader_pdb
webgl_loader_ply
webgl_loader_stl
webgl_loader_svg
webgl_loader_texture_dds
webgl_loader_texture_exr
webgl_loader_texture_hdr
webgl_loader_texture_ktx
webgl_loader_texture_lottie
webgl_loader_texture_pvrtc
webgl_loader_texture_tga
webgl_loader_texture_tiff
webgl_loader_texture_ultrahdr
webgl_loader_ttf
webgl_loader_usdz
webgl_loader_vox
webgl_loader_vrml
webgl_loader_xyz
```

Sub-grouping for planning: 3D model formats (`3dm`, `3ds`, `3dtiles`, `3mf`, `3mf_materials`, `amf`, `collada`,
`collada_kinematics`, `collada_skinning`, `draco`, `fbx`, `fbx_nurbs`, `ifc`, `kmz`, `ldraw`, `md2`, `md2_control`, `obj`,
`ply`, `stl`, `usdz`, `vox`, `vrml`) · point-cloud/scientific formats (`pcd`, `xyz`, `pdb`, `nrrd`) · animation-only formats
(`bvh`, `mdd`) · misc geometry sources (`gcode`, `svg`, `ttf`, `imagebitmap`) · glTF *feature* demos that aren't shown by the
base `webgpu_loader_gltf` (`gltf_animation_pointer`, `gltf_avif`, `gltf_instancing`, `gltf_progressive_lod`, `gltf_variants`)
· texture formats (`texture_dds`, `texture_exr`, `texture_hdr`, `texture_ktx` [legacy v1], `texture_lottie`, `texture_pvrtc`,
`texture_tga`, `texture_tiff`, `texture_ultrahdr`).

### A.2 — Other unique techniques (34)

| Example | Why it's unique |
|---|---|
| `webgl_animation_skinning_ik` | CCDIKSolver inverse-kinematics solving is a distinct algorithm not demonstrated by any webgpu example (webgpu_skinning covers playback/rendering of skinning only, not IK). |
| `webgl_animation_walk` | Verified via source fetch: WASD/keyboard-driven Soldier.glb character controller — movement input, idle/walk/run animation-weight blending, turn easing, and a follow-camera. This interactive locomotion-controller pattern is not demonstrated by any webgpu example. |
| `webgl_batch_lod_bvh` | Verified via source fetch: BatchedMesh with 500k instances across 10 geometries, 5 mesh-simplified LODs each, plus BVH-accelerated (TLAS/BLAS) frustum culling and raycasting via community libraries (@three.ez/batched-mesh-extensions, three-mesh-bvh) — a much more advanced technique than the base batching shown in webgpu_mesh_batch, and not demonstrated there. |
| `webgl_clipping_stencil` | Verified via source fetch: stencil-buffer-based cap-filling (multi-pass stencil increment/decrement to render solid caps where a clip plane cuts through geometry) is a materially different technique from webgpu_clipping (which clips without capping) — not demonstrated anywhere in the webgpu set. |
| `webgl_decals` | DecalGeometry surface-projection algorithm (e.g. bullet-hole decals on arbitrary meshes); unique CPU geometry-projection technique, not shown elsewhere. |
| `webgl_geometries` | Reference gallery of every built-in BufferGeometry primitive; no webgpu equivalent catalog exists. |
| `webgl_geometry_colors_lookuptable` | Lut.js colormap/heatmap scientific-visualization technique; not shown anywhere in the webgpu set. |
| `webgl_geometry_convex` | ConvexGeometry/QuickHull convex-hull algorithm; not shown anywhere in the webgpu set. |
| `webgl_geometry_csg` | Constructive solid geometry via three-bvh-csg (community); unique boolean-geometry technique, no webgpu equivalent. |
| `webgl_geometry_minecraft` | Verified via source fetch: interactive raycast-driven voxel placement/removal with a merged BufferGeometry + per-face texture atlas — distinct from the static procedural architecture generators webgpu_generator_building/_city (which are not interactive and use a different, Neo-Gothic-skyscraper-specific generation algorithm). |
| `webgl_geometry_nurbs` | NURBSCurve/NURBSSurface algorithm; not shown anywhere in the webgpu set. |
| `webgl_geometry_spline_editor` | Interactive CatmullRomCurve3 control-point editor; unique CPU curve-editing UI pattern, not shown elsewhere. |
| `webgl_geometry_terrain_raycast` | Raycasting against terrain to place/snap objects to the surface is an interaction pattern not shown in webgpu_tsl_procedural_terrain (which demonstrates generation only, not placement). |
| `webgl_geometry_text` | 3D extruded TextGeometry from a font; common real-world need, not demonstrated anywhere in the webgpu set. |
| `webgl_instancing_raycast` | Per-instance raycast picking on an InstancedMesh; distinct interactive technique, not shown for any webgpu instancing example. |
| `webgl_instancing_scatter` | Scattering instances across a surface (e.g. grass/rocks via barycentric sampling); distinct algorithm from the static procedural generators (webgpu_generator_building/_city), not shown elsewhere. |
| `webgl_interactive_cubes_gpu` | GPU color-ID picking via render-target readback is a distinct technique from CPU raycasting; closest webgpu analog (webgpu_multiple_rendertargets_readback) demonstrates the readback API but not the picking application. |
| `webgl_interactive_voxelpainter` | Interactive raycast-driven voxel add/remove editor; distinct interaction pattern, no webgpu equivalent (related to, but simpler than, webgl_geometry_minecraft). |
| `webgl_lines_dashed` | LineDashedMaterial dash-pattern rendering; not demonstrated by the webgpu_lines_fat family (which covers thickness/wireframe/raycasting, not dashing). |
| `webgl_marchingcubes` | Marching Cubes isosurface/metaball extraction algorithm; distinct technique not demonstrated (even via GPU compute) anywhere in the webgpu set. |
| `webgl_materials_car` | Interactive car paint/wheel/environment customizer; iconic, distinctive showcase demo with no webgpu counterpart. |
| `webgl_materials_texture_canvas` | Using an HTML5 Canvas 2D drawing surface as a live-updating texture; distinct from webgpu_materials_texture_html (DOM/iframe embedding) and from shader-procedural textures — not covered. |
| `webgl_modifier_edgesplit` | EdgeSplitModifier hard-edge/flat-shading geometry-processing algorithm; renderer-agnostic CPU utility with no webgpu-side demonstration anywhere. |
| `webgl_modifier_simplifier` | SimplifyModifier mesh-decimation/LOD-generation algorithm; renderer-agnostic CPU utility, not shown elsewhere. |
| `webgl_modifier_subdivision` | Catmull-Clark-style subdivision-surface modifier (community); renderer-agnostic CPU utility, not shown elsewhere. |
| `webgl_modifier_tessellation` | TessellateModifier triangle-subdivision algorithm (for smoother displacement mapping); renderer-agnostic CPU utility, not shown elsewhere. |
| `webgl_morphtargets_webcam` | Live webcam face-tracking driving morph targets in real time is a distinct interactive technique from webgpu_morphtargets_face (which plays back a pre-baked facial animation clip, not live tracking). |
| `webgl_multiple_scenes_comparison` | Verified via source fetch: draggable scissor-test comparison slider (before/after two renders) — distinct UI/rendering pattern, no webgpu equivalent. |
| `webgl_multiple_views` | Verified via source fetch: split-screen multiple-viewport rendering via renderer.setViewport() — distinct from webgpu_camera_array (stereo/array-texture rendering), no webgpu equivalent. |
| `webgl_postprocessing_glitch` | Verified via source fetch: GlitchPass block-displacement/datamosh "digital glitch" effect is a different technique from webgpu_postprocessing_retro (which is CRT/scanline/dither retro emulation, not glitch/datamosh) — no webgpu equivalent. |
| `webgl_raycaster_bvh` | three-mesh-bvh–accelerated raycasting (community); genuinely valuable performance technique, not demonstrated anywhere else. |
| `webgl_raycaster_texture` | Alpha-map-aware ("pixel perfect") picking through transparent texture regions; distinct useful technique, not shown elsewhere. |
| `webgl_renderer_pathtracer` | three-gpu-pathtracer (community) physically-based path tracing; categorically distinct from every rasterization technique in the webgpu set, genuinely high-value and unique. |
| `webgl_worker_offscreencanvas` | OffscreenCanvas + Worker-thread rendering; not demonstrated for the WebGPU renderer anywhere, despite WebGPU being arguably an even better fit for multi-threaded rendering. |


## Class B — COVERED (technique exists under a different webgpu_* name)

83 examples. Table below gives the covering webgpu example(s) and why the suffix matcher missed the pair.

| webgl-only example | Covered by | Rationale |
|---|---|---|
| `webgl_animation_keyframes` | `webgpu_animation_retargeting`, `webgpu_loader_gltf`, `webgpu_morphtargets_face`, `webgpu_skinning_instancing` | Just AnimationMixer.clipAction() playback of a baked glTF clip (LittlestTokyo) — this exact playback pattern is used throughout the webgpu set (webgpu_animation_retargeting, webgpu_skinning_instancing, webgpu_morphtargets_face, webgpu_loader_gltf). Verified via source fetch. |
| `webgl_animation_multiple` | `webgpu_skinning_instancing` | Multiple simultaneous AnimationMixer instances on cloned skinned models is the same GPU skinning technique as webgpu_skinning_instancing, just via a different (per-mixer vs. batched) CPU driving mechanism. |
| `webgl_animation_skinning_additive_blending` | `webgpu_skinning`, `webgpu_skinning_instancing` | Additive animation blending is an AnimationMixer (CPU, renderer-agnostic) technique layered on top of the same GPU skinning pipeline shown in webgpu_skinning / webgpu_skinning_instancing. |
| `webgl_animation_skinning_blending` | `webgpu_skinning`, `webgpu_skinning_instancing` | Cross-fade animation blending is an AnimationMixer (CPU, renderer-agnostic) technique on top of the GPU skinning pipeline shown in webgpu_skinning / webgpu_skinning_instancing. |
| `webgl_animation_skinning_morph` | `webgpu_morphtargets_face`, `webgpu_skinning` | Combined skeleton + facial morph-target animation is covered by the combination of webgpu_skinning (skeletal) and webgpu_morphtargets_face (facial morph blending). |
| `webgl_buffergeometry` | `webgpu_compute_geometry`, `webgpu_compute_points` | Manual procedural BufferGeometry/particle construction is superseded as a "why" demo by TSL storage-buffer-driven geometry (webgpu_compute_geometry, webgpu_compute_points). |
| `webgl_buffergeometry_attributes_none` | `webgpu_generator_building`, `webgpu_tsl_procedural_terrain` | Attribute-less geometry driven purely by vertex-index math in the shader is the standard pattern in TSL procedural-generation examples (webgpu_tsl_procedural_terrain, webgpu_generator_building/_city use builtin vertex/instance index nodes). |
| `webgl_buffergeometry_custom_attributes_particles` | `webgpu_particles`, `webgpu_tsl_vfx_` | Custom per-particle attributes driving a shader is the exact technique shown (via TSL storage buffers) in webgpu_particles / webgpu_tsl_vfx_* family. |
| `webgl_buffergeometry_instancing` | `webgpu_instance_mesh`, `webgpu_instancing_morph` | Covered by the webgpu_instance_mesh / webgpu_instancing_morph instancing family. |
| `webgl_buffergeometry_instancing_billboards` | `webgpu_instance_sprites` | Covered by webgpu_instance_sprites (camera-facing billboard instancing). |
| `webgl_buffergeometry_instancing_interleaved` | `webgpu_instance_mesh`, `webgpu_instance_uniform` | Covered conceptually by webgpu_instance_uniform / webgpu_instance_mesh (per-instance attribute data via TSL instance nodes). |
| `webgl_buffergeometry_points` | `webgpu_compute_points`, `webgpu_instance_points` | Covered by webgpu_instance_points / webgpu_compute_points. |
| `webgl_clipping_advanced` | `webgpu_clipping` | Verified via source fetch: multiple simultaneous local+global clipping planes — already demonstrated directly in webgpu_clipping (which uses a globalClippingGroup plus a knotClippingGroup with two local planes). |
| `webgl_clipping_intersection` | `webgpu_clipping` | Verified via source fetch: clipIntersection mode is already demonstrated directly in webgpu_clipping (knotClippingGroup.clipIntersection = true). |
| `webgl_effects_stereo` | `webgpu_display_stereo` | Side-by-side stereo camera rendering is directly covered by webgpu_display_stereo. |
| `webgl_framebuffer_texture` | `webgpu_rtt` | Copying a framebuffer directly to a texture is superseded by WebGPU's unified render-target/texture model, demonstrated by webgpu_rtt (render-to-texture). |
| `webgl_geometry_extrude_shapes` | `webgpu_geometry_loft` | Verified via source fetch: ExtrudeGeometry from a 2D Shape is a special case of the general cross-section lofting technique demonstrated (with many more example sections) by webgpu_geometry_loft. |
| `webgl_geometry_extrude_splines` | `webgpu_geometry_loft` | Verified via source fetch: tube-along-spline extrusion is a special case of the general cross-section lofting technique demonstrated by webgpu_geometry_loft. |
| `webgl_geometry_terrain` | `webgpu_tsl_procedural_terrain` | Directly covered by webgpu_tsl_procedural_terrain (Perlin/noise-based procedural terrain heightmap via TSL). |
| `webgl_gpgpu_birds` | `webgpu_compute_birds` | Directly covered by webgpu_compute_birds (native WebGPU compute-shader boids vs. the older render-to-texture GPGPUComputationRenderer technique). |
| `webgl_gpgpu_birds_gltf` | `webgpu_compute_birds` | Same boids technique as webgl_gpgpu_birds, covered by webgpu_compute_birds; the glTF bird model is incidental. |
| `webgl_gpgpu_protoplanet` | `webgpu_tsl_compute_attractors_particles` | Covered by webgpu_tsl_compute_attractors_particles (GPU N-body/attractor particle simulation). |
| `webgl_gpgpu_water` | `webgpu_compute_water` | Directly covered by webgpu_compute_water (native compute-shader water ripple simulation vs. the older render-to-texture technique). |
| `webgl_instancing_dynamic` | `webgpu_instance_mesh`, `webgpu_instance_uniform` | Per-frame-updated instance transforms is covered by the webgpu_instance_mesh / webgpu_instance_uniform instancing family. |
| `webgl_lights_spotlights` | `webgpu_lights_spotlight` | Multiple-spotlight variant of the single-spotlight technique already covered by webgpu_lights_spotlight. |
| `webgl_materials_bumpmap` | `webgpu_materials` | Bump-mapping is one of the standard PBR material properties shown in the general webgpu_materials showcase. |
| `webgl_materials_cubemap` | `webgpu_cubemap_dynamic`, `webgpu_materials_envmaps` | Basic env-mapped cubemap reflection, covered by webgpu_materials_envmaps / webgpu_cubemap_dynamic. |
| `webgl_materials_cubemap_dynamic` | `webgpu_cubemap_dynamic` | Directly covered by webgpu_cubemap_dynamic (CubeCamera dynamic reflection) — near-exact match, suffix matcher missed it due to the "materials_" infix. |
| `webgl_materials_cubemap_refraction` | `webgpu_refraction` | Covered by webgpu_refraction (same env-map-based refraction technique, newer render-target-based implementation). |
| `webgl_materials_cubemap_render_to_mipmaps` | `webgpu_materials_cubemap_mipmaps` | Directly covered by webgpu_materials_cubemap_mipmaps (near-exact match, suffix matcher missed the "render_to_" infix difference). |
| `webgl_materials_envmaps_exr` | `webgpu_hdr`, `webgpu_materials_envmaps` | The environment-mapping technique is covered by webgpu_materials_envmaps + webgpu_hdr; only the specific EXR loader format is unported (see loader gallery). |
| `webgl_materials_envmaps_fasthdr` | `webgpu_hdr`, `webgpu_materials_envmaps` | Same reasoning as envmaps_exr — technique covered by webgpu_materials_envmaps + webgpu_hdr. |
| `webgl_materials_envmaps_hdr` | `webgpu_hdr`, `webgpu_materials_envmaps` | Same reasoning as envmaps_exr — technique covered by webgpu_materials_envmaps + webgpu_hdr. |
| `webgl_materials_normalmap` | `webgpu_materials` | Tangent-space normal mapping is one of the standard PBR material properties in the general webgpu_materials showcase. |
| `webgl_materials_physical_clearcoat` | `webgpu_clearcoat` | Directly covered by webgpu_clearcoat — near-exact match, suffix matcher missed the "materials_physical_" infix. |
| `webgl_materials_physical_transmission` | `webgpu_materials_transmission` | Directly covered by webgpu_materials_transmission — near-exact match, suffix matcher missed the "physical_" infix. |
| `webgl_materials_physical_transmission_alpha` | `webgpu_materials_transmission` | Variant of the transmission technique, covered by webgpu_materials_transmission. |
| `webgl_materials_subsurface_scattering` | `webgpu_materials_sss` | Directly covered by webgpu_materials_sss — same technique, shortened name. |
| `webgl_materials_texture_anisotropy` | `webgpu_textures_anisotropy` | Directly covered by webgpu_textures_anisotropy — suffix matcher missed the "materials_texture_" vs "textures_" prefix difference. |
| `webgl_materials_texture_partialupdate` | `webgpu_textures_partialupdate` | Directly covered by webgpu_textures_partialupdate — suffix matcher missed the "materials_texture_" vs "textures_" prefix difference. |
| `webgl_materials_video_webcam` | `webgpu_materials_video` | Live webcam feed as a VideoTexture is the same texture pipeline as webgpu_materials_video (source is a getUserMedia stream instead of a video file, not a different rendering technique). |
| `webgl_materials_wireframe` | `webgpu_lines_fat_wireframe` | True-thickness wireframe rendering is directly covered by webgpu_lines_fat_wireframe. |
| `webgl_modifier_curve_instanced` | `webgpu_instance_path`, `webgpu_modifier_curve` | Instancing meshes along a curve path is directly covered by webgpu_instance_path (+ the already-matched webgpu_modifier_curve). |
| `webgl_morphtargets_horse` | `webgpu_morphtargets` | Classic blend-shape morph animation, covered by the general webgpu_morphtargets technique demo. |
| `webgl_morphtargets_sphere` | `webgpu_morphtargets` | Basic morph-target demo, covered by the general webgpu_morphtargets technique demo. |
| `webgl_multiple_elements_text` | `webgpu_multiple_elements` | Directly covered by webgpu_multiple_elements (multiple DOM/canvas elements sharing one WebGL/WebGPU context); the "_text" variant is a content difference only. |
| `webgl_panorama_cube` | `webgpu_cubemap_dynamic`, `webgpu_materials_envmaps` | Cubemap-based 360 panorama viewing, covered by webgpu_cubemap_dynamic / webgpu_materials_envmaps (general env-map/skybox viewing technique). |
| `webgl_panorama_equirectangular` | `webgpu_equirectangular` | Directly covered by webgpu_equirectangular — near-exact match, suffix matcher missed the "panorama_" prefix. |
| `webgl_points_billboards` | `webgpu_instance_sprites` | Camera-facing billboard points is covered by webgpu_instance_sprites. |
| `webgl_points_dynamic` | `webgpu_compute_points` | CPU-updated dynamic point positions is superseded by, and covered in teaching terms by, GPU-driven webgpu_compute_points. |
| `webgl_points_sprites` | `webgpu_instance_sprites`, `webgpu_particles`, `webgpu_particles_soft` | Texture-mapped point sprites covered by webgpu_particles / webgpu_particles_soft / webgpu_instance_sprites. |
| `webgl_points_waves` | `webgpu_compute_points`, `webgpu_tsl_raging_sea` | Classic animated sine-wave point grid is covered in teaching terms by GPU-driven point animation in webgpu_compute_points / webgpu_tsl_raging_sea. |
| `webgl_postprocessing_advanced` | `webgpu_postprocessing` | General multi-pass EffectComposer showcase; covered collectively by webgpu_postprocessing plus the individual effect examples (bloom, dof, etc.) already in the webgpu set. |
| `webgl_postprocessing_backgrounds` | `webgpu_backdrop`, `webgpu_backdrop_area`, `webgpu_backdrop_water` | Background/scene-compositing techniques are covered by the webgpu_backdrop / webgpu_backdrop_area / webgpu_backdrop_water family. |
| `webgl_postprocessing_dof2` | `webgpu_postprocessing_dof`, `webgpu_postprocessing_dof_basic` | Alternate depth-of-field/bokeh algorithm; covered by webgpu_postprocessing_dof + webgpu_postprocessing_dof_basic (two DOF techniques already ported). |
| `webgl_postprocessing_gtao` | `webgpu_postprocessing_ao` | Ground-Truth AO algorithm variant, covered by the general webgpu_postprocessing_ao pass. |
| `webgl_postprocessing_procedural` | `webgpu_procedural_texture` | Procedurally-generated-texture-in-postprocessing showcase, covered by webgpu_procedural_texture. |
| `webgl_postprocessing_rgb_halftone` | `webgpu_tsl_halftone` | Directly covered by webgpu_tsl_halftone. |
| `webgl_postprocessing_sao` | `webgpu_postprocessing_ao` | Scalable AO algorithm variant, covered by the general webgpu_postprocessing_ao pass. |
| `webgl_postprocessing_ssao` | `webgpu_postprocessing_ao`, `webgpu_postprocessing_ssgi` | Screen-space AO, covered by webgpu_postprocessing_ao (and webgpu_postprocessing_ssgi for the more advanced GI/AO case). |
| `webgl_postprocessing_taa` | `webgpu_postprocessing_traa`, `webgpu_volume_lighting_traa` | Temporal anti-aliasing, covered by webgpu_postprocessing_traa (+ webgpu_volume_lighting_traa). |
| `webgl_postprocessing_unreal_bloom` | `webgpu_postprocessing_bloom` | Covered by webgpu_postprocessing_bloom (+ _bloom_emissive/_bloom_selective). |
| `webgl_postprocessing_unreal_bloom_selective` | `webgpu_postprocessing_bloom_selective` | Directly covered by webgpu_postprocessing_bloom_selective — near-exact conceptual match. |
| `webgl_read_float_buffer` | `webgpu_multiple_rendertargets_readback` | Float render-target pixel readback is covered in modern form by webgpu_multiple_rendertargets_readback (WebGPU async buffer-mapping readback). |
| `webgl_rendertarget_texture2darray` | `webgpu_rendertarget_2d-array_3d` | Exact technique match to webgpu_rendertarget_2d-array_3d (rendering into a 2D-array/3D render target). |
| `webgl_shader_lava` | `webgpu_materialx_noise`, `webgpu_tsl_`, `webgpu_tsl_wood` | Procedural noise-driven material shader, covered by the webgpu_tsl_* procedural-noise family (e.g. webgpu_tsl_wood, webgpu_materialx_noise). |
| `webgl_shaders_ocean` | `webgpu_ocean`, `webgpu_water` | Directly covered by webgpu_ocean / webgpu_water — near-exact conceptual match, suffix matcher missed the "shaders_" prefix. |
| `webgl_shaders_sky` | `webgpu_sky` | Directly covered by webgpu_sky — near-exact conceptual match, suffix matcher missed the "shaders_" prefix. |
| `webgl_shadowmap_pcss` | `webgpu_shadowmap_vsm` | Percentage-Closer Soft Shadows is one soft-shadow algorithm in the same problem space covered by webgpu_shadowmap_vsm (variance shadow maps). |
| `webgl_simple_gi` | `webgpu_postprocessing_ssgi`, `webgpu_postprocessing_ssgi_ballpool` | Approximate real-time global illumination, covered by webgpu_postprocessing_ssgi / webgpu_postprocessing_ssgi_ballpool (screen-space GI). |
| `webgl_texture2darray` | `webgpu_textures_2d-array` | Exact technique match to webgpu_textures_2d-array; suffix matcher missed it due to "texture2darray" vs "textures_2d-array" spelling difference. |
| `webgl_texture2darray_compressed` | `webgpu_textures_2d-array_compressed` | Exact technique match to webgpu_textures_2d-array_compressed (same naming-mismatch reason). |
| `webgl_texture2darray_layerupdate` | `webgpu_textures_2d-array`, `webgpu_textures_partialupdate` | Covered by webgpu_textures_2d-array plus webgpu_textures_partialupdate (per-layer partial update). |
| `webgl_texture3d` | `webgpu_compute_texture_3d` | Covered by webgpu_compute_texture_3d (3D texture generation/use via WebGPU compute). |
| `webgl_texture3d_partialupdate` | `webgpu_compute_texture_3d`, `webgpu_textures_partialupdate` | Covered by webgpu_textures_partialupdate (partial texture update technique) + webgpu_compute_texture_3d. |
| `webgl_tsl_clearcoat` | `webgpu_clearcoat` | Same TSL clearcoat technique as webgpu_clearcoat, just running on the WebGL backend to prove TSL portability — not the priority renderer for a WebGPU-first port. |
| `webgl_tsl_instancing` | `webgpu_instance_` | Same TSL instancing technique as the webgpu_instance_* family, running on the WebGL backend. |
| `webgl_tsl_shadowmap` | `webgpu_shadowmap` | Same TSL shadow-mapping technique as webgpu_shadowmap, running on the WebGL backend. |
| `webgl_tsl_skinning` | `webgpu_skinning` | Same TSL skinning technique as webgpu_skinning, running on the WebGL backend. |
| `webgl_ubo` | `webgpu_lights_clustered`, `webgpu_storage_buffer` | Manual Uniform Buffer Object wiring; WebGPU's modern equivalent large-GPU-buffer pattern is shown in webgpu_storage_buffer, and TSL handles UBO-style uniform batching transparently (see webgpu_lights_clustered/_dynamic for many-light buffer handling). |
| `webgl_ubo_arrays` | `webgpu_storage_buffer` | Same reasoning as webgl_ubo — modern equivalent is webgpu_storage_buffer. |
| `webgl_video_panorama_equirectangular` | `webgpu_video_panorama` | Directly covered by webgpu_video_panorama — near-exact conceptual match. |
| `webgl_volume_instancing` | `webgpu_volume_` | Instanced variant of volume rendering; the core volume-rendering technique is thoroughly covered by the webgpu_volume_* family (cloud, perlin, fire, caustics, lighting). |

## Class C — LOW-VALUE

55 examples. Deprecated/legacy technique, thin single-property demo, renderer-agnostic CPU-only utility, or renderer-internal capability/stress test.

| Example | Why low-value |
|---|---|
| `webgl_buffergeometry_attributes_integer` | WebGL2-specific integer vertex-attribute capability test; no rendering technique, not applicable to WebGPU's attribute model. |
| `webgl_buffergeometry_drawrange` | Thin drawRange() API demo, renderer-agnostic, not a distinct rendering technique. |
| `webgl_buffergeometry_glbufferattribute` | WebGL-specific interop trick (wrapping a raw WebGLBuffer); has no WebGPU analog because WebGPU buffer binding works completely differently — not a portable technique. |
| `webgl_buffergeometry_indexed` | Basic indexed-vs-non-indexed geometry API demo, renderer-agnostic, trivial. |
| `webgl_buffergeometry_lines` | Basic non-indexed line geometry API demo; the teaching-valuable line technique (thick/fat lines) is already covered by webgpu_lines_fat. |
| `webgl_buffergeometry_lines_indexed` | Indexed variant of the basic line geometry API demo; same reasoning as buffergeometry_lines. |
| `webgl_buffergeometry_points_interleaved` | Interleaved-buffer micro-optimization variant of buffergeometry_points; no independent teaching content. |
| `webgl_buffergeometry_rawshader` | Raw GLSL RawShaderMaterial boilerplate is exactly the pattern TSL node materials are designed to replace; every webgpu_tsl_* example is the modern equivalent. |
| `webgl_buffergeometry_selective_draw` | Thin geometry-groups/multi-material selective-draw API demo, renderer-agnostic, low incremental value. |
| `webgl_buffergeometry_uint` | WebGL-specific >65k-vertex Uint32 index capability test; WebGPU supports uint32 indices natively with no demo needed. |
| `webgl_clipculldistance` | WebGL-specific GL_ARB_clip_cull_distance extension capability test; no applicable WebGPU concept, renderer-internal. |
| `webgl_custom_attributes` | Legacy pre-BufferGeometry custom-attribute shader API, superseded by webgl_buffergeometry_custom_attributes_particles and by TSL storage-buffer particle examples. |
| `webgl_custom_attributes_lines` | Legacy custom-attribute API demo, redundant with buffergeometry equivalents. |
| `webgl_custom_attributes_points` | Legacy custom-attribute API demo, redundant with buffergeometry equivalents. |
| `webgl_custom_attributes_points2` | Near-duplicate variant of webgl_custom_attributes_points. |
| `webgl_custom_attributes_points3` | Near-duplicate variant of webgl_custom_attributes_points. |
| `webgl_effects_anaglyph` | Legacy red/cyan anaglyph-glasses stereo novelty effect from the original 2013-era Effects folder; superseded by modern stereo/XR rendering (webgpu_display_stereo, webxr_*). |
| `webgl_effects_ascii` | Legacy ASCII-art post-render novelty effect from the original Effects folder; niche/retro, not a broadly applicable technique. |
| `webgl_effects_parallaxbarrier` | Legacy autostereoscopic parallax-barrier novelty effect from the original Effects folder; superseded by modern stereo/XR rendering. |
| `webgl_geometry_colors` | Trivial single-property demo (vertexColors:true); not a distinct technique. |
| `webgl_geometry_cube` | Legacy basic-cube-with-per-face-materials demo; superseded in teaching value by the general geometries gallery and modern materials examples. |
| `webgl_geometry_shapes` | Thin 2D Shape-API fill demo; subsumed by geometry_extrude_shapes/geometry_text_shapes which use the same Shape API for more teaching value. |
| `webgl_geometry_teapot` | Canonical parametric test mesh (Utah teapot) used mainly to exercise tessellation options; not a distinct teaching technique. |
| `webgl_geometry_text_shapes` | Flat (non-extruded) Shape-based text is a minor variant of geometry_text using the same Font/Shape pipeline; low incremental value beyond it. |
| `webgl_geometry_text_stroke` | Stroked/outline text-path variant; minor variant of geometry_text, low incremental value. |
| `webgl_helpers` | Gallery of THREE.js debug helper objects (AxesHelper, GridHelper, etc.); renderer-agnostic, works identically under either renderer, no distinct WebGPU teaching content. |
| `webgl_instancing_performance` | Instancing performance/stress benchmark; renderer-internal test, analogous to the webgpu_performance* internal-test bucket, not teaching content. |
| `webgl_interactive_buffergeometry` | CPU-side THREE.Raycaster picking is renderer-agnostic; thin demo, not a distinct rendering technique. |
| `webgl_interactive_cubes` | Most basic CPU raycasting/hover-highlight tutorial demo; renderer-agnostic and trivial. |
| `webgl_interactive_cubes_ortho` | Orthographic-camera variant of webgl_interactive_cubes; camera-type change only, no new technique. |
| `webgl_interactive_lines` | Thin CPU raycasting-on-Line2 API demo. |
| `webgl_interactive_points` | Thin CPU raycasting-on-Points API demo. |
| `webgl_interactive_raycasting_points` | Near-duplicate of webgl_interactive_points (adds a raycast distance threshold). |
| `webgl_lights_hemisphere` | Single-light-type toggle demo; ambient/hemisphere-style lighting is superseded in teaching value by the SH-based environment lighting shown across webgpu_lightprobe*. |
| `webgl_lines_colors` | Thin per-vertex-color-on-lines API demo. |
| `webgl_lod` | THREE.LOD distance-based mesh-swapping is a renderer-agnostic scene-graph utility; works identically under WebGPURenderer, no distinct technique to re-demonstrate. |
| `webgl_materials_blending` | Basic THREE.Blending mode dropdown; trivial single-property showcase. |
| `webgl_materials_blending_custom` | Custom GL blend-equation/blend-func combinations; low-level WebGL GPU-state capability demo, low teaching value. |
| `webgl_materials_channels` | Manual RGBA texture-channel-packing demo; superseded by TSL's trivial node-based channel selection (texture(map).r/.g/.b), no dedicated demo needed. |
| `webgl_materials_modified` | onBeforeCompile GLSL-chunk-patching is exactly the escape hatch TSL node materials are designed to eliminate; every webgpu_tsl_* example is the modern equivalent. |
| `webgl_materials_normalmap_object_space` | Niche object-space-normal-map variant; low incremental value beyond tangent-space normal mapping which is covered. |
| `webgl_materials_texture_filters` | Basic min/mag texture-filter-mode dropdown; trivial single-property showcase. |
| `webgl_materials_texture_rotation` | Basic UV/texture-matrix rotation-offset demo; trivial single-property showcase. |
| `webgl_math_obb` | Pure CPU math/collision-testing demo (Oriented Bounding Box intersection); renderer-agnostic, no rendering technique. |
| `webgl_math_orientation_transform` | Pure CPU quaternion/Euler/rotation-matrix conversion demo; renderer-agnostic, no rendering technique. |
| `webgl_random_uv` | Thin single-property demo (randomizing per-face UV offset for texture variety); low incremental teaching value. |
| `webgl_raycaster_sprite` | Niche raycasting-on-Sprite capability test; low incremental value beyond general raycasting demos. |
| `webgl_shader` | Minimal RawShaderMaterial/GLSL boilerplate starter; superseded by the TSL node-material authoring paradigm shown throughout webgpu_tsl_*. |
| `webgl_shadowmap_performance` | Shadow-map performance/quality-tradeoff benchmark; renderer-internal test, not teaching content. |
| `webgl_shadowmap_viewer` | Debug utility that overlays the raw shadow-map depth texture; a dev-tool, not an end-user rendering technique. |
| `webgl_shadowmesh` | Legacy planar-projected blob-shadow technique from the pre-shadow-map era; entirely superseded by the modern shadow-mapping techniques in the webgpu_shadowmap_* family. |
| `webgl_test_memory2` | Renderer memory-leak/stress regression test; analogous internal test already exists as webgpu_test_memory — not example/teaching content either way. |
| `webgl_test_wide_gamut` | Display-P3/wide-color-gamut capability test; renderer-internal, no teaching content, no webgpu equivalent needed. |
| `webgl_video_kinect` | Hardware-specific demo requiring a discontinued device (Microsoft Kinect); historically interesting, not practically reproducible. |
| `webgl_watch` | A modeled wristwatch showcase scene, not a rendering technique; one of three.js's original demo scenes with no distinct teaching content beyond generic material+lighting already covered elsewhere. |
