# Session Handoff — 2026-07-27 (overnight, continued: repo live + M2 waves 1–2)

## Wave 8 (same night)

8 ports, 4 pairs + the B17 audit interlude (below). **65 examples total, 65/65
smoke + contact sheet green on Metal.** Zero review fixes across all 8 ports —
second consecutive zero-fix wave.

| Example | Notes | Cost |
|---|---|---|
| materials-matcap | EXR/JPG matcap swap, both decode paths | 107k |
| materials-toon | 6³ toon lattice + ToonOutlinePassNode; pattern-(c) wrinkle (constructor takes Nodes where factory types don't) | 106k |
| lines-fat | Line2NodeMaterial vs native strip + PiP inset; **found WebGPU setViewport/setScissor TOP-origin rule** | 118k |
| lensflares | LensflareMesh field; occlusion test verified live; sRGB/linear setHSL parity flagged | 109k |
| volume-cloud | Data3DTexture raymarch; **found TSL stack rule** (helpers with internal toVar/assign need Fn) | 97k |
| volume-fire | biggest port ever (258k): 8-kernel GPU fluid sim + volumetric shadows + draggable emitter; legitimate ciSkip #5; B19 filed | 258k |
| shadowmap-vsm | shadows="variance" verified; VSM blur knobs live via dash-paths | 100k |
| shadowmap-pointlight | cube shadow maps, striped shells; intensity/distance parity checked at review | 100k |

Cumulative: **63 agent ports across 8 waves + 2 gate ports, zero manifest
clobbers across 32+ concurrent pair-registrations.** AGENTS.md v0.12→v0.16.

## Wave 8 interlude: corpus-wide B17 audit (same night)

Flames' B17 find (wave 7) triggered a full-corpus animation audit: two-frame
pixel-diff + `__frameCount` probes over all examples. Result: **14 more frozen
examples repaired** (every ungated suspending hook in the corpus — rtt,
skinning-instancing, tsl-halftone, instance-mesh, lights-phong, lights-spotlight,
materials-basic, materials-envmaps, tonemapping, five loader-gltf-* ports), all
verified animating post-fix. Fingerprint: loop alive (`__frameCount` advances) +
pixels frozen + `R3F.createRoot should only be called once!` warning.

**Big thread: all four SwiftShader CI stall examples were B17 cases.** The stall
mystery is plausibly this bug — next CI pass, watch the advisory smoke job; if
the four now pass on SwiftShader, drop their `ciSkip`s and consider flipping
smoke back to blocking.

Statics-by-design confirmed (0px, clean console, full-rate loop): morphtargets,
depth-texture, tonemapping, geometry-loft*(see B17 open anomaly: warning with no
suspending hook), postprocessing-ao, loader-gltf-sheen/-compressed.
Follow-up still queued: the pixel-diff "animates" smoke assertion with a
`static: true` manifest flag (probe windows must exceed stop-go periods — 4s).

## Wave 7 (same night)

8 ports, 4 pairs — postprocessing cluster (6) + TSL VFX pair (2). **57 examples
total, 57/57 smoke + contact sheet green on Metal.** Review fixes: 1 across the
wave (outline's seeded initial selection); plus two REAL shipped-bug repairs the
wave's finds triggered (below).

| Example | Notes | Cost |
|---|---|---|
| postprocessing | dotScreen+rgbShift chain; pattern (b); corrected orchestrator's own prompt error (not bloom) | 95k |
| postprocessing-dof | established dynamism pattern (c): const-wrapping factories need user uniform() via return-to-register | 85k |
| postprocessing-pixel | pixelationPass as full-pipeline PassNode; manual ortho + frustum snap; drove minZoom/maxZoom wrapper props | 123k |
| postprocessing-ao | GTAO into ambient via builtinAOContext + TRAA; found the samples:0 rule (fiber MSAA-4x default breaks depth copies) | 157k |
| postprocessing-outline | OutlineNode masks in user TSL; bubbled pointer-event selection; review fix: seed torus selection | 109k |
| postprocessing-afterimage | 50k-sprite spiral; history trails; outputNode-swap+needsUpdate bypass idiom | 112k |
| tsl-vfx-flames | fragment-stage fire; **found B17** (Canvas-boundary suspension freezes TSL time) via pixel-diff bisect | 161k |
| tsl-vfx-tornado | parabola-twisted funnel + bloom; **found B18** (useUniforms-after-suspense setState-in-render) | 140k |

**Shipped-bug repairs this wave:**
- `loader-gltf-dispersion` suite flake was NOT the cold-start transient — it was
  the B15-family PMREM destroyed-texture race under suite contention. Suspense
  gate fixed it; first back-to-back clean full-suite runs since it landed.
- **B17 latent freezes**: `sprites`, `tsl-earth`, `refraction` shipped with TSL
  `time` frozen at frame one (Canvas-boundary suspension; smoke's non-black check
  can't see it). All three repaired with explicit Suspense boundaries and
  verified animating by pixel-diff (31k–75k px/s).

Wave-7 upstream yield: B17 (fiber createRoot re-run on Canvas-boundary
suspension), B18 (useUniforms setState-in-render), the samples:0 MSAA rule, and
dynamism pattern (c). AGENTS.md v0.9→v0.12.

**Follow-up queued (test-tier gap the wave exposed): a two-frame pixel-diff
"animates" assertion** — smoke's non-black check shipped three frozen examples;
needs a manifest flag for intentionally-static examples (compute-texture, rtt…).

Cumulative: **55 agent ports across 7 waves + 2 gate ports, 1 review fix + 2
systemic-bug repairs this wave, zero manifest clobbers across 26+ concurrent
pair-registrations.**

## Wave 6 (same night)

8 ports, 4 pairs — the cluster wave: glTF loaders closed, TSL showpieces + first
compute ports opened. **49 examples total, 49/49 smoke + contact sheet green on
Metal.** ZERO review fixes across all 8 ports (doc steering fully compounding).

| Example | Notes | Cost |
|---|---|---|
| loader-gltf-dispersion | KHR dispersion test card; clamped dolly inside original's far plane | 66k |
| loader-gltf-compressed | first KTX2/Meshopt port; extendLoader wiring → Layer 1 bullet | 89k |
| tsl-galaxy | 20k GPU sprites; build-vs-run-time split visible in leva; frustumCulled rule | 74k |
| tsl-procedural-terrain | found + verified three 0.185.1 IBL race (B15); Suspense-gate fix; drag-to-scroll via pointer events | 164k |
| compute-texture | first compute port; explicit-dispatch pattern; found fiber B16 (scoped useNodes breaks WGSL) | 110k |
| compute-particles | 200k particles; three dispatch cadences; proved B16 worse (scoped useBuffers always broken) | 159k |
| tsl-raging-sea | displaced sea + emissive troughs; caught the tone-mapping parity trap (fiber ACESFilmic default vs originals' NoToneMapping) | 128k |
| tsl-compute-attractors-particles | 262k attractor sim; v0.8 compute bullets verified on first use — zero rediscovery; uniformArray type-arg gap | 114k |

Wave-6 upstream yield (best wave yet): **B15** (three: env-change rebuild misses
custom-node materials — real three.js bug, verified both ways) and **B16** (fiber:
scoped store hooks inject `.` into WGSL identifiers — caught only by the smoke
console assertion). AGENTS.md v0.6→v0.9.

Watch item: `loader-gltf-dispersion` intermittently times out ONLY on the first
full-suite pass right after new examples land (fresh Vite transforms + multi-MB GLB
under contention); passes 4/4 solo and on all clean suite runs. Documented transient
class — but if it starts failing twice in a row, investigate for real.

Cumulative: **47 agent ports across 6 waves + 2 gate ports, zero manifest clobbers
across 22+ concurrent pair-registrations.**

## Wave 5 (same night)

8 ports, 4 pairs. **41 examples total, 41/41 smoke + contact sheet green on Metal.**

| Example | Notes | Cost |
|---|---|---|
| lights-phong | pair 1 (commit 0524eb6) | — |
| materials-basic | pair 1 (commit 0524eb6) | — |
| camera-array | pair 2 (commit e882f96) | — |
| backdrop-area | pair 2; review fix: grid={false} (double grid) | — |
| loader-gltf-iridescence | KHR iridescence lamp; zero review fixes; both r185 assets existed verbatim | 84k |
| loader-gltf-sheen | KHR sheen chair; leva → plain `material.sheen` (TSL materialSheen re-reads per frame, no uniforms); review fix: grid={false} (moiré vs HDR studio floor); UltraHDR swap #3 | 103k |
| loader-gltf-anisotropy | KHR anisotropy barn lamp; zero review fixes; UltraHDR swap #4 (B13 evidence bumped) | 77k |
| textures-anisotropy | split-scissor dual-scene via phase:'render' takeover + createPortal; corner labels upgraded to live per-pane leva selects | 87k |

Wave-5 doc yield: screenshot-script WebGPU launch note (AGENTS §Verification);
B13 evidence now 4 hits — the whole glTF-material-extension cluster ships UltraHDR
upstream, so `loader-gltf-dispersion`/`-compressed` (queued candidates) will hit it
too. Cumulative: **39 agent ports across 5 waves + 2 gate ports, zero manifest
clobbers across 18+ concurrent pair-registrations.**

## Wave 4 (same night)

8 ports, 4 pairs. **33 examples total, 33/33 smoke + contact sheet green on Metal.**

| Example | Notes | Cost |
|---|---|---|
| backdrop | 8-sphere viewportSharedTexture ring; first controlsRef consumer | 122k |
| camera | split-viewport dual camera — scissor/viewport intact, first phase:'render' takeover; NO blocker | 150k |
| portal | first createPortal-second-scene port (pattern → Layer 1) | 171k |
| lights-pointlights | uniform(light.position) live-wrap pattern (→ Layer 1) | 127k |
| materials-displacementmap | first orthographic port; zoom-sync frustum derivation | 111k |
| geometry-loft | biggest port yet: 17-exhibit LoftGeometry gallery, 4 files | 186k |
| animation-retargeting | SkeletonUtils.retargetClip via useMemo + dual useAnimations | 149k |
| backdrop-water | water refraction + inlined voronoi (addon missing from npm three 0.185.1 — clone is newer; AGENTS rule added) | 178k |

New ledger items: B14 (TSL Loop/Fn-layout typed-surface lag), B9 extended (camera
union), B11 family confirmed again. Cumulative session stats: **31 agent ports across
4 waves + 2 gate ports, ~1.2 sign-off fixes per port, zero manifest clobbers across
14 concurrent pair-registrations.**

## Wave 3 (same night, Metal-oracle policy)

8 more ports, 4 parallel pairs, zero manifest clobbers again. **25 examples total,
25/25 smoke + contact sheet green.**

| Example | Notes | Cost |
|---|---|---|
| instance-mesh | JSX instancedMesh + setMatrixAt; useLoader-cache clone rule | 92k |
| morphtargets | found the useLayoutEffect-vs-first-RAF-render race (now a Layer 1 rule) | 119k |
| clipping | nested clippingGroup JSX intrinsics (auto-derived, no extend) | 105k |
| loader-gltf | live Khronos catalog (148 models); drove controlsRef escape hatch | 155k |
| lights-spotlight | SpotLight.map projection, PLY loader; drove polar-limit props | 141k |
| materials-envmaps | cube/equirect toggles; zero casts; build-vs-live semantics traced | 148k |
| depth-texture | scene-pass depth node; added raw/linear select() toggle | 138k |
| loader-gltf-transmission | KHR transmission; frame-probe correctly classified its one cold-start timeout (frames:4 = fetch crawl) | 85k |

Wrapper additions this wave (all port-flagged): `controlsRef` (imperative
fitToBox/setLookAt escape hatch), `minPolarAngle`/`maxPolarAngle`. UPSTREAM B13
added: drei /webgpu Environment lacks UltraHDRLoader wiring (hit twice, forced
HDR asset swaps). Follow-up queued: wire Box3 auto-framing in loader-gltf via
controlsRef.

## Wave 2 (added after the dry run; Metal-oracle policy per Dennis)

8 more ports, run as 4 parallel PAIRS of single-Sonnet agents (examples.json
append-discipline held — zero clobbers across 8 concurrent registrations):

| Example | Notes | Cost |
|---|---|---|
| tsl-earth | day/night terminator + atmosphere on outputNode — showpiece | 107k |
| shadowmap | maskNode discard + receivedShadowPositionNode; CORRECTED the fog rule (plain Fog auto-wraps; fogNode only for custom TSL fog) | 145k |
| procedural-texture | convertToTexture/gaussianBlur self-bake, no pipeline | 108k |
| reflection | reflector() floor, instanced voxel tree; TWEEN dropped for a useFrame ramp; drove the autoRotate util addition | 159k |
| tonemapping | runtime operator swap; draco via useGLTF; cheapest yet (86k) | 86k |
| refraction | backdropNode + viewportSharedTexture (typed! no cast needed) | 95k |
| video-panorama | VideoTexture; geometry-baked scale(-1,1,1) (mesh-scale would flip winding); muted+playsInline load-bearing | 96k |
| lights-rectarealight | LTC setup at module scope (rule clarified: idempotent lib registration ≠ mutable state) | 110k |

**17 examples total, 17/17 smoke + contact sheet green on Metal.** CameraControls
wrapper grew from real port needs: `pan` lock, `autoRotate`/`autoRotateSpeed`
(OrbitControls-parity). AGENTS.md gained: fog two-paths correction, duck-typed
`*Node` property pattern (+ check-@types-first caveat), instancedBufferAttribute
type-arg, module-scope registration clarification. UPSTREAM B11 broadened
(fogNode/backgroundNode/emissiveNode family), B12 added (useUniforms WGSL
identifier validation).

Review flags for Dennis: `tonemapping`'s HDR background reads very dark in the
contact sheet (original is also dark — eyeball live); `lights-rectarealight`
chunk is 250kB (LTC tables — expected, data not code).



Read AGENTS.md first (v0.4 — conventions + stack pins + gotchas), then
[UPSTREAM.md](UPSTREAM.md) (the patch/override ledger + upstream fix briefs Dennis
asked for), then this.

## Where we are

**M1 complete** (Dennis signed off on grid/leva/titleblock look; both gate ports
reviewed). **M2 is well underway**: repo live at
github.com/pmndrs/react-three-examples, CI green, and the 5-port dry-run wave is
merged. **9 examples total**, all green locally (tsc/lint/build/smoke 9/9).

### The M2 dry-run wave (all single-Sonnet agents, AGENTS.md-steered)

| # | Example | Notes | Agent cost |
|---|---------|-------|-----------|
| gate#2 | skinning-instancing | instancing + TSL range + blur pipeline | 146k tok |
| gate#3 | postprocessing-bloom-emissive | MRT selective bloom | 93k |
| 1 | sky | SkyMesh + CubeCamera; slug-rule violation (fixed + doc reworded) | 111k |
| 2 | rtt | pipeline subsumes manual RTT; cleanest port | 78k |
| 3 | shadow-contact | first folder-pattern; `before:'render'` capture pass | 181k |
| 4 | tsl-halftone | deepest TSL; found the WGSL-identifier trap | 201k |
| 5 | sprites | SpriteNodeMaterial + userData node + scene.fogNode | 128k |

Review cost stayed cheap: every port needed at most a slug rename / one-prop
consistency fix. Cost tracks example difficulty, not doc decay — simple ports got
cheaper as AGENTS.md absorbed each round's lessons (now at v0.4, see its changelog).

### CI (github.com/pmndrs/react-three-examples/actions)

- checks (lint+build) + smoke (headed Chromium under Xvfb + SwiftShader Vulkan) —
  **the research-designed WebGPU path is proven on free runners**.
- `packageManager` pin + vendored fiber tarball (1.3MB, UPSTREAM.md A1) were needed
  to make CI installable.
- **SwiftShader stall (open investigation — Grid hypothesis FALSIFIED)**: four
  examples hang readiness silently on SwiftShader (zero page errors, 2×180s); all
  pass on Metal. The `?nogrid` experiment disproved the Grid theory (rtt/halftone
  still stall grid-less; sprites stalls with no grid at all). Full matrix:
  - STALL: skinning-instancing, rtt, tsl-halftone, sprites
  - PASS: animation-skinning-blending (9s), hello-webgpu (5s),
    postprocessing-bloom-emissive (24s), sky (7s), shadow-contact (7s)
  - Not yet separated by: render pipeline (bloom passes, rtt stalls), Grid
    (falsified), fiber `useUniforms` (shadow-contact calls it and passes),
    animation (anim-blending passes).
  - Instrumentation added: readiness timeouts now report `__frameCount` /
    `__loadersActive` in the failure message — next red run classifies the stall
    (0 frames = dead loop; few = per-frame pipeline recompile crawl; many =
    loaders never settle). Bisect from that data.
  - Mechanisms: `ciSkip` (skip with reason) and `?nogrid`/`ciNoGrid` (run grid-less)
    both exist in the manifest + smoke spec; the four stalls currently use `ciSkip`.
  - Smoke job is `continue-on-error` (advisory) until this is resolved — no failure
    emails; flip back in ci.yml when stable.

## For Dennis

1. **Review the wave**: `pnpm contact-sheet` → screenshots/index.html (9/9), or the
   live routes. Per-port DIVERGENCE notes are in each file header.
2. **UPSTREAM.md is the ledger you asked for**: Part A = the 8 things this repo
   carries with unwind conditions; Part B = 11 agent-ready fix briefs (B1 fiber
   UniformNode types — verified still real on v10 HEAD `dc6bbd7`, the improved alias
   pins `TNodeType=unknown`; B9 useThree renderer union; B10 three Fn params;
   B11 @types/three Scene.fogNode; plus the known packaging/rename items).
3. When you push fiber/drei alphas: A1/A2 unwind steps are in the ledger.
4. Repo hygiene when you get a minute: branch protection, and whether to keep
   pushing straight to main or move to PR flow now that CI gates exist.

## Next work (M2 continuation)

1. Wave 2 (~5–10 ports) — pipeline is proven; candidates from the dual-renderer list
   (shadowmap variants, reflection, tonemapping, procedural_texture, sprites/points
   siblings). Same loop: port → review → doc amendments between waves.
2. Screenshot-regression tier (tier 2): goldens on the SwiftShader path, changed
   examples only.
3. Site v1 gallery (M2 list): gallery grid, tag filters, per-example page (code
   view + agent buttons) — the titleblock/manifest already carry the data.
4. SwiftShader stall bisection (see CI section above).

## Session environment notes

- A background `pnpm dev` may still hold :5173 — kill/restart freely.
- `git config http.postBuffer` was raised locally (tarball push exceeded 1MB buffer).
- The repo (AGENTS.md + docs/) is the single source of truth.
