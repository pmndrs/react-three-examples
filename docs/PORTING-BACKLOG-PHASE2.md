# Porting backlog — Phase 2 and beyond (r185)

> Companion to [PORTING-BACKLOG.md](PORTING-BACKLOG.md) (Phase 1, complete). Created
> 2026-09-03 from a verification of the webgl audit in
> [research/webgl-unique-list.md](../research/webgl-unique-list.md). Same format:
> checkboxes are the source of truth; tick with `node scripts/tick-backlog.mjs` once the
> script learns this file (it currently reads only the Phase 1 file — R3 item).

**The audit held, with two corrections.** Every one of its 81 Class-A examples still
exists in r185 and none has been ported. But (1) it only classified `webgl_*` against
`webgpu_*`, so **77 examples with other prefixes were never audited at all**, and (2) its
"low-value" test was _"is this a distinct three.js rendering technique"_, which is not
this repo's test — SPEC §2 says the point is where R3F is dramatically clearer, and that
is precisely the trivial-interaction demos the audit dismissed.

Everything in a Phase 2 port targets **WebGPURenderer + fiber v10**. The webgl original
is the source of the _demo_, not the renderer.

## 2A — The 34 unique techniques (audit Class A.2, verified)

Genuinely absent from the webgpu set. Port order is by R3F payoff, not alphabet.

- [ ] `webgl_animation_walk` — keyboard character controller, follow camera
- [ ] `webgl_decals` — DecalGeometry projection on click
- [ ] `webgl_geometry_text` — TextGeometry (drei `<Text3D>`)
- [ ] `webgl_instancing_raycast` — per-instance picking (fiber events on InstancedMesh)
- [ ] `webgl_instancing_scatter` — surface scattering (drei `<Sampler>`)
- [ ] `webgl_interactive_cubes_gpu` — GPU color-ID picking
- [ ] `webgl_interactive_voxelpainter` — raycast voxel editor
- [ ] `webgl_geometry_minecraft` — merged voxel geometry + atlas, interactive
- [ ] `webgl_multiple_views` — split viewports (drei `<View>`)
- [ ] `webgl_multiple_scenes_comparison` — scissor comparison slider
- [ ] `webgl_geometry_spline_editor` — draggable curve control points
- [ ] `webgl_geometry_terrain_raycast` — snap objects to terrain
- [ ] `webgl_materials_car` — car configurator (iconic)
- [ ] `webgl_materials_texture_canvas` — Canvas2D as live texture
- [ ] `webgl_morphtargets_webcam` — live face tracking → morphs
- [ ] `webgl_lines_dashed` — LineDashedMaterial
- [ ] `webgl_raycaster_texture` — alpha-aware picking
- [ ] `webgl_raycaster_bvh` — three-mesh-bvh
- [ ] `webgl_batch_lod_bvh` — BatchedMesh + LOD + BVH culling
- [ ] `webgl_clipping_stencil` — stencil cap-filling
- [ ] `webgl_geometry_csg` — three-bvh-csg
- [ ] `webgl_marchingcubes` — metaballs
- [ ] `webgl_geometry_convex` — QuickHull
- [ ] `webgl_geometry_nurbs` — NURBS curve/surface
- [ ] `webgl_geometry_colors_lookuptable` — Lut heatmap
- [ ] `webgl_geometries` — every primitive, one gallery
- [ ] `webgl_modifier_edgesplit`
- [ ] `webgl_modifier_simplifier`
- [ ] `webgl_modifier_subdivision`
- [ ] `webgl_modifier_tessellation`
- [ ] `webgl_animation_skinning_ik` — CCDIKSolver
- [ ] `webgl_postprocessing_glitch` — GlitchPass (needs a TSL port of the pass)
- [ ] `webgl_renderer_pathtracer` — three-gpu-pathtracer (**check WebGPU support first**)
- [ ] `webgl_worker_offscreencanvas` — OffscreenCanvas + worker (**fiber v10 support?**)

Two carry a real feasibility question before anyone starts them (bold above).

## 2B — Never audited: the 77 non-`webgl_`/`webgpu_` examples

The audit's input set was "`webgl_*` with no `webgpu_*` twin". These have neither prefix,
so they were invisible to it. Several are the **highest-payoff R3F content in the whole
three.js corpus**, because each maps onto a pmndrs library that exists to make it trivial.

### `misc_` (22) — the controls family is the big one

- [ ] `misc_controls_orbit` · `misc_controls_trackball` · `misc_controls_arcball` ·
      `misc_controls_fly` · `misc_controls_map` · `misc_controls_pointerlock` — one drei
      component each. **Consider ONE example: a controls gallery** with a leva switcher,
      since each original is ~60 lines of boilerplate around a single constructor.
- [ ] `misc_controls_transform` — `<TransformControls>` (already used in
      `modifier-curve`; a dedicated example is still worth it)
- [ ] `misc_controls_drag` — `<DragControls>`
- [ ] `misc_boxselection` — SelectionBox + SelectionHelper
- [ ] `misc_animation_groups` · `misc_animation_keys` — AnimationObjectGroup, keyframe tracks
- [ ] `misc_raycaster_helper`
- [ ] exporters (9): `misc_exporter_gltf` · `_gltf_normals` · `_obj` · `_ply` · `_stl` ·
      `_draco` · `_usdz` · `_gcode` · `_exr` · `_ktx2` — **decide as a group**: one
      "export" example with a format dropdown, or skip (export is renderer-agnostic and
      not visual). Recommendation: one example, glTF + USDZ + PLY.

### `physics_` (13) — maps onto `@react-three/rapier`

- [ ] `physics_rapier_basic` · `_instancing` · `_joints` · `_character_controller` ·
      `_vehicle_controller` · `_terrain` — **six examples, highest R3F wow in this file**:
      `<RigidBody>` replaces hundreds of lines of body/collider bookkeeping.
- [ ] `physics_jolt_instancing` — no pmndrs binding; port with the raw library or skip
- [ ] `physics_ammo_*` (6) — Ammo is the legacy engine; **skip**, rapier covers the same
      demos (break, cloth, instancing, rope, terrain, volume). Record as excluded.

### `css2d_` / `css3d_` (8) — maps onto drei `<Html>`

- [ ] `css2d_label` — `<Html>` labels
- [ ] `css3d_periodictable` — the classic; `<Html transform>`
- [ ] `css3d_molecules` · `css3d_sprites` · `css3d_orthographic` · `css3d_mixed` ·
      `css3d_youtube` — pick 2–3; `css3d_sandbox` skip (sandbox)

### The rest

- [ ] `games_fps` — Octree collision + capsule controller; a real R3F pattern
- [ ] `svg_lines` · `svg_sandbox` — SVGRenderer; **skip** (no WebGPU relevance)
- `webaudio_*` (4) and `webxr_*` (26) — **final phase** per SPEC §3, unchanged.

## 2C — Loader gallery (audit Class A.1, 47 formats) — DECISION PENDING (SPEC §14)

All 47 still in r185, none ported. Loading is renderer-agnostic, so every one is a
low-effort "does this format work under WebGPURenderer + `useLoader`" example. The
question is whether the site wants 47 near-identical pages. Options:

1. **All 47** as a `loaders/` category — complete, searchable, dull.
2. **Representative set (~12)** — one per _kind_: `obj`, `fbx`, `stl`, `ply`, `collada`,
   `usdz`, `3dtiles`, `draco`, `gltf_variants`, `gltf_progressive_lod`, `texture_exr`,
   `texture_ultrahdr`, `svg`, `ttf`.
3. **One gallery example** with a format dropdown (like `loader-materialx` does for 28
   samples) plus the representative set for formats that need their own UI.

Recommendation: **3**. _Dennis decides._

## 2D — Audit Class C re-check under the R3F criterion

The audit called these "low-value" because they are not distinct three.js techniques.
Under SPEC §2's criterion they are the opposite: each is a place where R3F collapses
20–80 lines of listener/loop plumbing into a prop. Re-examine, don't auto-port:

- [ ] `webgl_interactive_cubes` — `onPointerOver`/`onClick` IS the R3F wow demo
- [ ] `webgl_lod` — drei `<Detailed>`
- [ ] `webgl_helpers` — drei `<Helper>`; and `useHelper`
- [ ] `webgl_effects_ascii` — drei `<AsciiRenderer>`
- [ ] `webgl_lights_hemisphere` — one line in JSX; pairs with a lights gallery
- [ ] `webgl_geometry_teapot` — the classic; trivial but iconic
- [ ] `webgl_materials_blending` — a leva dropdown over `blending`

The other 48 Class-C calls stand (legacy APIs, WebGL-specific capability tests, stress
tests, Kinect).

## 2E — New since r185 (monthly re-diff, SPEC §11)

In three `dev` at 2026-07-26 but not in r185 — these are the **next Phase 1** ports when
three is bumped:

- [ ] `webgpu_deferred`
- [ ] `webgpu_lightprobes` · `webgpu_lightprobes_complex` · `webgpu_lightprobes_sponza`
- [ ] `webgpu_materials_retroreflection`
- [ ] `webgpu_particles_soft`
- [ ] `webgpu_xr_shadows` (final phase — WebXR)

## Counts

| bucket               | examples |                                status |
| -------------------- | -------: | ------------------------------------: |
| 2A unique techniques |       34 |                               to port |
| 2B never audited     |       77 | ~30 to port, ~20 skip, 30 final-phase |
| 2C loader gallery    |       47 |                              decision |
| 2D Class-C re-check  |        7 |                              decision |
| 2E new since r185    |        7 |                               on bump |

Realistic Phase 2 at the recommended scope: **~75–85 ports**, roughly 40% of Phase 1's
size, and a much higher share of them are scene-graph/event demos where the R3F win is
largest.
