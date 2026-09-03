# Porting backlog — Phase 2 (r185)

> Companion to [PORTING-BACKLOG.md](PORTING-BACKLOG.md) (Phase 1, complete). Rewritten
> 2026-09-03 as a **decision list** after Dennis greenlit Phase 2: every example is
> either PORT, SKIP with the reason, or REVIEW (stuck → his hands). Checkboxes are the
> source of truth; `node scripts/tick-backlog.mjs` ticks both files.
>
> Rules of engagement (Dennis): agents crank through everything worth doing; anything an
> agent is stuck on for more than a few minutes goes to
> [REVIEW-QUEUE.md](REVIEW-QUEUE.md) and the agent moves on; every skip says why.

Every port targets **WebGPURenderer + fiber v10**. The `webgl_`/`misc_`/`physics_`
original is the source of the _demo_, not the renderer. Originals at
`https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/<name>.html`. Slug =
original name minus the `webgl_`/`misc_`/`physics_`/`css3d_`/`css2d_`/`games_` prefix.

**Feasibility checked 2026-09-03**, and the dependencies below are installed:
`three-mesh-bvh`, `three-bvh-csg`, `@three.ez/batched-mesh-extensions`,
`three-subdivide`, `@dimforge/rapier3d-compat`, `@react-three/rapier` (peer is fiber ^9 —
experimental on v10, see 2B). Every three addon the 34 need exists in r185 except
`tsl/display/GlitchNode.js` (the glitch pass is hand-ported to TSL).

## 2A — Unique techniques (audit Class A.2) — 30 port · 1 skip · 3 review

- [x] ~~`webgl_animation_walk`~~ — ported — keyboard controller, follow camera → `animation/`
- [x] ~~`webgl_animation_skinning_ik`~~ — ported — CCDIKSolver → `animation/`
- [x] ~~`webgl_decals`~~ — ported — DecalGeometry on click (drei `<Decal>`) → `geometry/`
- [x] ~~`webgl_geometry_text`~~ — ported — TextGeometry (drei `<Text3D>`) → `geometry/`
- [x] ~~`webgl_geometries`~~ — ported — every primitive gallery → `geometry/`
- [x] ~~`webgl_geometry_convex`~~ — ported — QuickHull → `geometry/`
- [x] ~~`webgl_geometry_nurbs`~~ — ported — NURBS curve/surface → `geometry/`
- [x] ~~`webgl_geometry_csg`~~ — ported — three-bvh-csg → `geometry/`
- [x] ~~`webgl_geometry_colors_lookuptable`~~ — ported — Lut heatmap → `geometry/`
- [x] ~~`webgl_geometry_spline_editor`~~ — ported — draggable control points → `geometry/`
- [x] ~~`webgl_geometry_terrain_raycast`~~ — ported — snap to terrain → `geometry/`
- [x] ~~`webgl_geometry_minecraft`~~ — ported — merged voxels + atlas, interactive → `geometry/`
- [x] ~~`webgl_marchingcubes`~~ — ported — metaballs → `geometry/`
- [x] ~~`webgl_modifier_edgesplit`~~ — ported → `geometry/`
- [x] ~~`webgl_modifier_simplifier`~~ — ported → `geometry/`
- [x] ~~`webgl_modifier_subdivision`~~ — ported (three-subdivide) → `geometry/`
- [x] ~~`webgl_modifier_tessellation`~~ — ported → `geometry/`
- [x] ~~`webgl_instancing_raycast`~~ — ported — per-instance picking via fiber events → `scene/`
- [x] ~~`webgl_instancing_scatter`~~ — ported — surface scatter (drei `<Sampler>`) → `scene/`
- [x] ~~`webgl_interactive_cubes_gpu`~~ — ported — GPU color-ID picking → `scene/`
- [x] ~~`webgl_interactive_voxelpainter`~~ — ported — raycast voxel editor → `scene/`
- [x] ~~`webgl_raycaster_texture`~~ — ported — alpha-aware picking → `scene/`
- [x] ~~`webgl_raycaster_bvh`~~ — ported — three-mesh-bvh → `scene/`
- [ ] `webgl_batch_lod_bvh` — BatchedMesh + LOD + BVH culling → `scene/`
- [x] ~~`webgl_multiple_views`~~ — ported — split viewports (drei `<View>`) → `camera/`
- [x] ~~`webgl_multiple_scenes_comparison`~~ — ported — scissor slider → `camera/`
- [x] ~~`webgl_clipping_stencil`~~ — ported — stencil cap-filling → `materials/`
- [x] ~~`webgl_materials_car`~~ — ported — car configurator → `materials/`
- [x] ~~`webgl_materials_texture_canvas`~~ — ported — Canvas2D live texture → `textures/`
- [x] ~~`webgl_lines_dashed`~~ — ported → `geometry/`
- [ ] `webgl_morphtargets_webcam` — live face tracking → morphs → `animation/`
- [x] ~~`webgl_postprocessing_glitch`~~ — ported — hand-port GlitchPass to TSL → `postprocessing/`
- [x] ~~`webgl_renderer_pathtracer`~~ — **SKIP**: three-gpu-pathtracer is WebGL 2 only
      (`WebGLPathTracer(new WebGLRenderer())`); no WebGPU backend exists
- [x] ~~`webgl_worker_offscreencanvas`~~ — **REVIEW**: fiber v10 has only a type shim for
      OffscreenCanvas, no worker story; Dennis decides whether to build one (REVIEW-QUEUE)

## 2B — Never audited (77 with other prefixes) — 21 port · 5 skip · 30 final

### `misc_` (22)

- [x] ~~`misc_controls_orbit`~~ — ported + `_trackball` + `_arcball` + `_fly` + `_map` +
      `_pointerlock` → **ONE example** `controls` in `camera/`, leva switcher over the six
      drei controls. Six originals are ~60 lines each around one constructor; six pages
      would be six copies of `<OrbitControls />`.
- [x] ~~`misc_controls_transform`~~ — ported — `<TransformControls>` → `camera/`
- [x] ~~`misc_controls_drag`~~ — ported — `<DragControls>` → `scene/`
- [x] ~~`misc_boxselection`~~ — ported — SelectionBox/SelectionHelper → `scene/`
- [x] ~~`misc_animation_groups`~~ — ported — AnimationObjectGroup → `animation/`
- [x] ~~`misc_animation_keys`~~ — ported — keyframe tracks from scratch → `animation/`
- [x] ~~`misc_raycaster_helper`~~ — ported → `scene/`
- [x] ~~`misc_exporter_gltf`~~ — ported + `_gltf_normals` + `_usdz` + `_ply` + `_stl` + `_obj` →
      **ONE example** `exporter` in `loaders/`, format dropdown; export is
      renderer-agnostic, one page shows the pattern
- [x] ~~`misc_exporter_draco`~~ ~~`_gcode`~~ ~~`_exr`~~ ~~`_ktx2`~~ — **SKIP**: covered by
      the one exporter example; these add a codec, not a pattern

### `physics_` (13) — one probe first

`@react-three/rapier` declares `peerDependencies: @react-three/fiber ^9`. It may work on
v10 alpha or may not (it was built against the v9 frame loop). **`physics_rapier_basic`
is the probe**: try `@react-three/rapier` first; if it breaks on v10, fall back to a
`src/utils/RapierPhysics.ts` — the three addon inlined with attribution (AGENTS.md § the
`reference/` clone rule) and its hardcoded skypack CDN import replaced by the installed
`@dimforge/rapier3d-compat`, per the runtime-CDN-JS rule. Whichever wins, the other five
follow the same shape. Report which.

- [x] ~~`physics_rapier_basic`~~ — ported — **the probe** → `physics/` (new category; 7 justify it)
- [x] ~~`physics_rapier_instancing`~~ — ported → `physics/`
- [x] ~~`physics_rapier_joints`~~ — ported → `physics/`
- [x] ~~`physics_rapier_character_controller`~~ — ported → `physics/`
- [x] ~~`physics_rapier_vehicle_controller`~~ — ported → `physics/`
- [x] ~~`physics_rapier_terrain`~~ — ported → `physics/`
- [x] ~~`games_fps`~~ — ported — Octree + Capsule, no physics lib → `physics/`
- [x] ~~`physics_jolt_instancing`~~ — **SKIP**: rapier instancing covers the same demo; Jolt
      has no pmndrs binding and would be a second engine for one page
- [x] ~~`physics_ammo_break`~~ ~~`_cloth`~~ ~~`_instancing`~~ ~~`_rope`~~ ~~`_terrain`~~
      ~~`_volume`~~ — **SKIP**: Ammo is the legacy engine loaded from a CDN WASM URL; rapier
      demos cover instancing/terrain, and cloth/rope/break are Ammo-specific soft-body
      features with no rapier equivalent worth a second engine

### `css2d_` / `css3d_` (8) — drei `<Html>`

- [x] ~~`css2d_label`~~ — ported → `scene/`
- [x] ~~`css3d_periodictable`~~ — ported — the classic → `scene/`
- [x] ~~`css3d_molecules`~~ — ported → `scene/`
- [x] ~~`css3d_sprites`~~ — ported → `scene/`
- [x] ~~`css3d_youtube`~~ — ported → `scene/`
- [x] ~~`css3d_orthographic`~~ ~~`css3d_mixed`~~ — **SKIP**: camera-type / mixed-renderer
      variants of the same `<Html transform>` technique the five above show
- [x] ~~`css3d_sandbox`~~ — **SKIP**: sandbox, no stable subject

### The rest

- [x] ~~`svg_lines`~~ ~~`svg_sandbox`~~ — **SKIP**: SVGRenderer output, not WebGPU
- **`webaudio_*` (4)** and **`webxr_*` (26)** — **final phase**, unchanged; see 2F

## 2B½ — Folded originals (ported as part of a combined example)

These originals have no page of their own by design; the backlog tick attributes them
to the combined example's `original` anchor. Listed so a reconciliation of r185 finds
every name.

- [x] ~~`misc_controls_trackball`~~ ~~`misc_controls_arcball`~~ ~~`misc_controls_fly`~~
      ~~`misc_controls_map`~~ ~~`misc_controls_pointerlock`~~ — ported inside `controls`
      (anchor `misc_controls_orbit`)
- [x] ~~`misc_exporter_gltf_normals`~~ ~~`misc_exporter_usdz`~~ ~~`misc_exporter_ply`~~
      ~~`misc_exporter_stl`~~ ~~`misc_exporter_obj`~~ — ported inside `exporter` (anchor
      `misc_exporter_gltf`)
- [x] ~~`webgl_loader_texture_hdr`~~ ~~`webgl_loader_texture_ultrahdr`~~ — ported inside
      `texture-hdr-formats` (anchor `webgl_loader_texture_exr`)
- [x] ~~`misc_uv_tests`~~ — **SKIP**: a UV test-pattern generator for checking texture
      mapping on the built-in geometries; renderer-agnostic utility with no R3F content
      (found 2026-09-03 by a full r185 reconciliation — the only name no document had
      mentioned)

## 2C — Loader gallery (47) — 10 port · 35 skip · 3 review

Dennis's rule: _loaders that just load a model are not needed._ A loader earns a page
only when it demonstrates something beyond "the model appears".

- [x] ~~`webgl_loader_gltf_variants`~~ — ported — KHR_materials_variants switcher → `loaders/`
- [ ] `webgl_loader_gltf_progressive_lod` — streaming LOD → `loaders/`
- [x] ~~`webgl_loader_gltf_instancing`~~ — ported — EXT_mesh_gpu_instancing → `loaders/`
- [ ] `webgl_loader_gltf_animation_pointer` — KHR_animation_pointer → `loaders/`
- [ ] `webgl_loader_3dtiles` — tiled streaming → `loaders/`
- [x] ~~`webgl_loader_collada_kinematics`~~ — ported — kinematic chain playback → `loaders/`
- [x] ~~`webgl_loader_md2_control`~~ — ported — animation state control → `loaders/`
- [x] ~~`webgl_loader_ldraw`~~ — ported — LEGO, build-step animation → `loaders/`
- [x] ~~`webgl_loader_pdb`~~ — ported — molecules + labels → `loaders/`
- [x] ~~`webgl_loader_texture_exr`~~ — ported + `_hdr` + `_ultrahdr` → **ONE example**
      `texture-hdr-formats` in `textures/`: three HDR pipelines side by side
- [x] ~~`webgl_loader_svg`~~ — ported — vector → geometry → `loaders/`
- [x] ~~`webgl_loader_texture_lottie`~~ — ported — animated vector texture → `textures/`
- [x] ~~`3dm`~~ ~~`3ds`~~ ~~`3mf`~~ ~~`3mf_materials`~~ ~~`amf`~~ ~~`bvh`~~ ~~`collada`~~
      ~~`collada_skinning`~~ ~~`draco`~~ ~~`fbx`~~ ~~`fbx_nurbs`~~ ~~`gcode`~~ ~~`gltf_avif`~~
      ~~`ifc`~~ ~~`imagebitmap`~~ ~~`kmz`~~ ~~`md2`~~ ~~`mdd`~~ ~~`nrrd`~~ ~~`obj`~~ ~~`pcd`~~
      ~~`ply`~~ ~~`stl`~~ ~~`texture_dds`~~ ~~`texture_ktx`~~ ~~`texture_pvrtc`~~
      ~~`texture_tga`~~ ~~`texture_tiff`~~ ~~`ttf`~~ ~~`usdz`~~ ~~`vox`~~ ~~`vrml`~~ ~~`xyz`~~
      — **SKIP**: just loads a model/texture; `useLoader(XLoader, url)` is the same one
      line for every one of them and the shipped `loader-gltf`/`loader-texture-ktx2`
      already show it (`ttf` overlaps `geometry_text`; `vox` is fun but is still "load a
      model")

## 2D — Audit Class C re-check under the R3F criterion — 5 port · 2 skip

The audit's "low-value" test was _"distinct three.js technique"_; SPEC §2's is _"where is
R3F dramatically clearer"_, which is exactly trivial-interaction demos.

- [x] ~~`webgl_interactive_cubes`~~ — ported — `onPointerOver`/`onClick`: THE R3F wow demo → `scene/`
- [x] ~~`webgl_lod`~~ — ported — drei `<Detailed>` → `scene/`
- [x] ~~`webgl_helpers`~~ — ported — drei `<Helper>` / `useHelper` gallery → `scene/`
- [x] ~~`webgl_geometry_teapot`~~ — ported — iconic; trivial → `geometry/`
- [x] ~~`webgl_materials_blending`~~ — ported — leva over `blending` → `materials/`
- [x] ~~`webgl_effects_ascii`~~ — **SKIP**: `AsciiEffect` takes a `WebGLRenderer` and reads
      pixels back through it; drei's `<AsciiRenderer>` is not on the `/webgpu` entry
- [x] ~~`webgl_lights_hemisphere`~~ — **SKIP**: one JSX line; `lights-phong` and the light
      demos already show every light type

The other 48 Class-C calls stand (legacy APIs, WebGL-only capability tests, stress tests,
Kinect).

## 2E — New since r185 (monthly re-diff) — on the next three bump

- [ ] `webgpu_deferred` · `webgpu_lightprobes` · `webgpu_lightprobes_complex` ·
      `webgpu_lightprobes_sponza` · `webgpu_materials_retroreflection` · `webgpu_particles_soft`
- `webgpu_xr_shadows` → 2F

## 2F — Final phase: WebXR (26) + webaudio (4) — REVIEW

`@react-three/xr` 6.6 peers on fiber `>=8`, so it installs. But **nothing here can verify
an XR example**: no headset, and the smoke/animates tiers can't enter a session. Porting
26 examples nobody can run is not "covered". Filed in REVIEW-QUEUE: Dennis decides
whether to port a representative 3–4 (`xr_cubes`, `xr_dragging`, `ar_hittest`,
`vr_teleport`) and verify them himself, or hold the whole phase. webaudio (4) is
renderer-agnostic and small; same review entry.

## Counts

**66 ported · 6 review-queued · 0 left** (2026-09-03, from actual checkbox state).

| section              |   port |  skip | review |  final |
| -------------------- | -----: | ----: | -----: | -----: |
| 2A unique techniques |     30 |     1 |      3 |        |
| 2B never audited     |     21 |     5 |        |     30 |
| 2C loader gallery    |     10 |     0 |      3 |        |
| 2D Class-C re-check  |      5 |     2 |        |        |
| 2E on next bump      |      6 |       |        |      1 |
| **total**            | **72** | **8** |  **6** | **31** |

66 ported so far (2A–2D; 6 more of the 72 wait on the next three.js bump in 2E) — about
40% of Phase 1, and a far higher share of scene-graph/event demos where the R3F win is
largest. The 6 review-queued items are every currently-unchecked row (`webgl_batch_lod_bvh`,
`webgl_morphtargets_webcam`, `webgl_loader_gltf_progressive_lod`,
`webgl_loader_gltf_animation_pointer`, `webgl_loader_3dtiles`) plus the one checked-but-blocked
`webgl_worker_offscreencanvas` — all five REVIEW-QUEUE entries (#15, #1c, #1d ×3, #1b).
