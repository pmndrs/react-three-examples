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

## 2A — Unique techniques (audit Class A.2) — 32 port · 2 review

- [ ] `webgl_animation_walk` — keyboard controller, follow camera → `animation/`
- [ ] `webgl_animation_skinning_ik` — CCDIKSolver → `animation/`
- [ ] `webgl_decals` — DecalGeometry on click (drei `<Decal>`) → `geometry/`
- [ ] `webgl_geometry_text` — TextGeometry (drei `<Text3D>`) → `geometry/`
- [ ] `webgl_geometries` — every primitive gallery → `geometry/`
- [ ] `webgl_geometry_convex` — QuickHull → `geometry/`
- [ ] `webgl_geometry_nurbs` — NURBS curve/surface → `geometry/`
- [ ] `webgl_geometry_csg` — three-bvh-csg → `geometry/`
- [ ] `webgl_geometry_colors_lookuptable` — Lut heatmap → `geometry/`
- [ ] `webgl_geometry_spline_editor` — draggable control points → `geometry/`
- [ ] `webgl_geometry_terrain_raycast` — snap to terrain → `geometry/`
- [ ] `webgl_geometry_minecraft` — merged voxels + atlas, interactive → `geometry/`
- [ ] `webgl_marchingcubes` — metaballs → `geometry/`
- [ ] `webgl_modifier_edgesplit` → `geometry/`
- [ ] `webgl_modifier_simplifier` → `geometry/`
- [ ] `webgl_modifier_subdivision` (three-subdivide) → `geometry/`
- [ ] `webgl_modifier_tessellation` → `geometry/`
- [ ] `webgl_instancing_raycast` — per-instance picking via fiber events → `scene/`
- [ ] `webgl_instancing_scatter` — surface scatter (drei `<Sampler>`) → `scene/`
- [ ] `webgl_interactive_cubes_gpu` — GPU color-ID picking → `scene/`
- [ ] `webgl_interactive_voxelpainter` — raycast voxel editor → `scene/`
- [ ] `webgl_raycaster_texture` — alpha-aware picking → `scene/`
- [ ] `webgl_raycaster_bvh` — three-mesh-bvh → `scene/`
- [ ] `webgl_batch_lod_bvh` — BatchedMesh + LOD + BVH culling → `scene/`
- [ ] `webgl_multiple_views` — split viewports (drei `<View>`) → `camera/`
- [ ] `webgl_multiple_scenes_comparison` — scissor slider → `camera/`
- [ ] `webgl_clipping_stencil` — stencil cap-filling → `materials/`
- [ ] `webgl_materials_car` — car configurator → `materials/`
- [ ] `webgl_materials_texture_canvas` — Canvas2D live texture → `textures/`
- [ ] `webgl_lines_dashed` → `geometry/`
- [ ] `webgl_morphtargets_webcam` — live face tracking → morphs → `animation/`
- [ ] `webgl_postprocessing_glitch` — hand-port GlitchPass to TSL → `postprocessing/`
- [x] ~~`webgl_renderer_pathtracer`~~ — **SKIP**: three-gpu-pathtracer is WebGL 2 only
      (`WebGLPathTracer(new WebGLRenderer())`); no WebGPU backend exists
- [x] ~~`webgl_worker_offscreencanvas`~~ — **REVIEW**: fiber v10 has only a type shim for
      OffscreenCanvas, no worker story; Dennis decides whether to build one (REVIEW-QUEUE)

## 2B — Never audited (77 with other prefixes) — 22 port · 12 skip · 3 review · 30 final

### `misc_` (22)

- [ ] `misc_controls_orbit` + `_trackball` + `_arcball` + `_fly` + `_map` +
      `_pointerlock` → **ONE example** `controls` in `camera/`, leva switcher over the six
      drei controls. Six originals are ~60 lines each around one constructor; six pages
      would be six copies of `<OrbitControls />`.
- [ ] `misc_controls_transform` — `<TransformControls>` → `camera/`
- [ ] `misc_controls_drag` — `<DragControls>` → `scene/`
- [ ] `misc_boxselection` — SelectionBox/SelectionHelper → `scene/`
- [ ] `misc_animation_groups` — AnimationObjectGroup → `animation/`
- [ ] `misc_animation_keys` — keyframe tracks from scratch → `animation/`
- [ ] `misc_raycaster_helper` → `scene/`
- [ ] `misc_exporter_gltf` + `_gltf_normals` + `_usdz` + `_ply` + `_stl` + `_obj` →
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

- [ ] `physics_rapier_basic` — **the probe** → `physics/` (new category; 7 justify it)
- [ ] `physics_rapier_instancing` → `physics/`
- [ ] `physics_rapier_joints` → `physics/`
- [ ] `physics_rapier_character_controller` → `physics/`
- [ ] `physics_rapier_vehicle_controller` → `physics/`
- [ ] `physics_rapier_terrain` → `physics/`
- [ ] `games_fps` — Octree + Capsule, no physics lib → `physics/`
- [x] ~~`physics_jolt_instancing`~~ — **SKIP**: rapier instancing covers the same demo; Jolt
      has no pmndrs binding and would be a second engine for one page
- [x] ~~`physics_ammo_break`~~ ~~`_cloth`~~ ~~`_instancing`~~ ~~`_rope`~~ ~~`_terrain`~~
      ~~`_volume`~~ — **SKIP**: Ammo is the legacy engine loaded from a CDN WASM URL; rapier
      demos cover instancing/terrain, and cloth/rope/break are Ammo-specific soft-body
      features with no rapier equivalent worth a second engine

### `css2d_` / `css3d_` (8) — drei `<Html>`

- [ ] `css2d_label` → `scene/`
- [ ] `css3d_periodictable` — the classic → `scene/`
- [ ] `css3d_molecules` → `scene/`
- [ ] `css3d_sprites` → `scene/`
- [ ] `css3d_youtube` → `scene/`
- [x] ~~`css3d_orthographic`~~ ~~`css3d_mixed`~~ — **SKIP**: camera-type / mixed-renderer
      variants of the same `<Html transform>` technique the five above show
- [x] ~~`css3d_sandbox`~~ — **SKIP**: sandbox, no stable subject

### The rest

- [x] ~~`svg_lines`~~ ~~`svg_sandbox`~~ — **SKIP**: SVGRenderer output, not WebGPU
- **`webaudio_*` (4)** and **`webxr_*` (26)** — **final phase**, unchanged; see 2F

## 2C — Loader gallery (47) — 12 port · 35 skip

Dennis's rule: _loaders that just load a model are not needed._ A loader earns a page
only when it demonstrates something beyond "the model appears".

- [ ] `webgl_loader_gltf_variants` — KHR_materials_variants switcher → `loaders/`
- [ ] `webgl_loader_gltf_progressive_lod` — streaming LOD → `loaders/`
- [ ] `webgl_loader_gltf_instancing` — EXT_mesh_gpu_instancing → `loaders/`
- [ ] `webgl_loader_gltf_animation_pointer` — KHR_animation_pointer → `loaders/`
- [ ] `webgl_loader_3dtiles` — tiled streaming → `loaders/`
- [ ] `webgl_loader_collada_kinematics` — kinematic chain playback → `loaders/`
- [ ] `webgl_loader_md2_control` — animation state control → `loaders/`
- [ ] `webgl_loader_ldraw` — LEGO, build-step animation → `loaders/`
- [ ] `webgl_loader_pdb` — molecules + labels → `loaders/`
- [ ] `webgl_loader_texture_exr` + `_hdr` + `_ultrahdr` → **ONE example**
      `texture-hdr-formats` in `textures/`: three HDR pipelines side by side
- [ ] `webgl_loader_svg` — vector → geometry → `loaders/`
- [ ] `webgl_loader_texture_lottie` — animated vector texture → `textures/`
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

- [ ] `webgl_interactive_cubes` — `onPointerOver`/`onClick`: THE R3F wow demo → `scene/`
- [ ] `webgl_lod` — drei `<Detailed>` → `scene/`
- [ ] `webgl_helpers` — drei `<Helper>` / `useHelper` gallery → `scene/`
- [ ] `webgl_geometry_teapot` — iconic; trivial → `geometry/`
- [ ] `webgl_materials_blending` — leva over `blending` → `materials/`
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

| section              |   port |   skip | review |  final |
| -------------------- | -----: | -----: | -----: | -----: |
| 2A unique techniques |     32 |      1 |      1 |        |
| 2B never audited     |     22 |     12 |        |     30 |
| 2C loader gallery    |     12 |     35 |        |        |
| 2D Class-C re-check  |      5 |      2 |        |        |
| 2E on next bump      |      6 |        |        |      1 |
| **total**            | **77** | **50** |  **1** | **31** |

77 ports (2A–2D, 71 now + 6 on bump) — about 40% of Phase 1, and a far higher share of
scene-graph/event demos where the R3F win is largest.
