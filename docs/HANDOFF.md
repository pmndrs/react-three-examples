# Session Handoff — 2026-07-27/29 (overnight, continued: repo live + M2 waves 1–2)

## Wave 13 (2026-07-29) — the CHEAP-MODE wave: cluster batches, 95 → 131

Dennis approved resuming under the cost plan from the 07-28 policy change. This wave
changed HOW we port, not just what:

| Change | Effect |
|---|---|
| **4 sibling examples per agent** (was 1) | The ~15k-token doc read + pattern discovery amortize across the batch |
| **Agents own visual review** | Screenshots never enter the orchestrator context; justified by 40 consecutive zero-review-fix ports |
| **Scoped tests during the batch** (`-g "<slug>"`) | Full suite runs ONCE at wave end |
| **Agents don't commit or edit docs** | Rule candidates reported; one batched doc pass (this entry + AGENTS.md v0.26) instead of 4 per wave |
| **`model: 'sonnet'` pinned explicitly** | Session parent is Opus; unpinned agents would inherit it |

**Measured result: ~115k → ~60k tokens per port**, roughly 2× cheaper, on top of a
much smaller orchestrator burn (no per-pair screenshot reads, gate output, or doc
edits).

| Quartet | Ports | Tokens | Per port |
|---|---|---|---|
| postprocessing | sobel, fxaa, smaa, ca | 171k | 43k |
| lights | selective, ies-spotlight, projector, physical | 209k | 52k |
| bloom/glow | bloom, bloom-selective, anamorphic, lensflare | 230k | 58k |
| materials-texture | arrays, video, texture-manualmipmap, cubemap-mipmaps | 162k | 41k |
| shadowmap | opacity, array, csm, progressive | 317k | 79k |
| compute | points, geometry, texture-pingpong, texture-3d | 352k | 88k |
| MRT/render-target | mrt, mrt-mask, multiple-rendertargets, …-readback | 271k | 68k |
| volume | perlin, caustics, lighting, lighting-rectarea | 269k | 67k |
| array-texture | partialupdate, 2d-array, 2d-array-compressed, rendertarget-2d-array-3d | (stalled 3×) | — |

Hard clusters (shadowmap, compute) ran hot as expected — thin training data, three
folder-pattern ports, addons with no `.d.ts`. Routine clusters landed near 40k.

**Findings worth keeping:**
- **A real bug in a shipped three.js example** (UPSTREAM B22): `MRTNode.setup()`
  name-matches outputs against the bound target's textures and silently drops
  unmatched ones; `webgpu_multiple_rendertargets_readback` never names its readback
  target's textures, so that path compiles to an empty struct. Our port fixes it.
- Two originals carried dead/no-op code (unused floor texture in `volume_caustics`,
  no-op per-frame `lookAt()` in `volume_lighting`), plus unreachable animation code in
  `postprocessing_ca`. All dropped with DIVERGENCE bullets → new AGENTS.md rule.
- `compute-points` shipped a pointer-uniform bug that collapsed 300k particles into
  the origin in ~2s — **caught by the animates tier, invisible to smoke**. Second time
  that tier has paid for itself.
- `shadowmap-csm`'s tone-mapping error was caught **only by the agent's screenshot** —
  both test tiers passed it. Evidence that agent-owned visual review is load-bearing,
  not ceremony.
- New util extracted: `src/utils/VolumetricFog.ts` (the tiled-3D-Perlin density block
  three volume originals duplicate verbatim).
- Flagged once, not yet a rule: drei's `useKTX2` types its result's `image` as
  `unknown` (documented cast in `textures-2d-array-compressed`).

**Process notes for next time:**
- The array-texture agent **stalled three times**, always on an open-ended screenshot
  wait. Resuming via message preserved its context and lost no work, but the fix is
  prescriptive: screenshot scripts need a hard timeout + always-run `browser.close()`
  (now in AGENTS.md §Verification). Its 4th port needed a `tsc` fix by hand — an agent
  that stalls before its own verification step can leave a registered-but-unverified
  example, so the wave-end full gate is non-negotiable.
- Full smoke is now **18.7m** locally and animates **1.4h** at 131 examples. Both
  produce contention flakes (1 smoke, 5 animates this run — all passing in isolation).
  The suites need sharding or a scoped default before the corpus grows much further.
- **Watch item: `loader-gltf-iridescence`** failed animates TWICE (full suite, then
  again immediately after 16.8m of same-process loader-gltf runs), then passed 4/4
  consecutively in isolation. Both failures followed long multi-example processes, so
  the read is contention — but it is the only example to fail twice, so re-check it
  before assuming. Every other failure this run passed first retry.

Cumulative: **131 examples**, 36 ports this wave.


## POLICY CHANGE — porting cadence + CI cost (2026-07-28, Dennis)

Dennis hit Claude usage limits and called a slowdown. Two decisions:

1. **CI smoke no longer runs on push.** ~30 min per run at corpus scale (95
   examples × SwiftShader software raster). Now: PRs + nightly 04:00 UTC +
   `gh workflow run ci.yml`. The fast `checks` job (lint/build, ~2 min) still
   gates every push. Local Metal remains the oracle (SPEC §10) — every port is
   verified green on smoke + animates + contact sheet before it lands, so
   per-push SwiftShader was belt-and-braces. Revisit when the corpus is complete
   and pushes drop to a few a month.
   - Cloudflare Workers were considered and rejected: Workers are V8 isolates
     with no browser/GPU, and Browser Rendering is headless Chrome — which never
     presents the WebGPU canvas on Linux (the reason our CI runs headed under
     Xvfb; see research/webgpu-ci-github.md). No offload path exists; running it
     less often IS the fix.

2. **Porting waves paused.** The 8-ports-per-wave cadence is what consumes the
   budget: ~120k subagent tokens per port, ~1M per wave, and 95 examples ≈ 11M
   tokens of agent work. Everything else (CI polling, screenshot review, gates)
   is under ~5% combined. Marginal doc/upstream yield has also plateaued — the
   last several waves were zero-review-fix AND zero-rediscovery.
   - **Cost lever for resumption: pin `model: 'sonnet'` on port agents.** They
     were Sonnet all session by inheriting a Sonnet parent; the session is now
     Opus, so unpinned agents would inherit Opus and cost several times more per
     port. Never launch an unpinned port agent again.
   - Resume shape when Dennis says go: 1 pair (2 ports) per check-in, ~250-300k
     tokens, Sonnet-pinned; scope smoke/contact-sheet to the new slugs during the
     pair and run the full sweep only at wave end.

## Wave 11 (into the early hours of 07-28)

8 ports, 4 pairs. **89 examples total, 89/89 smoke + contact sheet + animates
green on Metal. FIFTH consecutive zero-review-fix wave** (one retrofit landed
alongside: skinning-instancing now plays SambaDance by name).

| Example | Notes | Cost |
|---|---|---|
| postprocessing-godrays | raymarch vs cube shadow map; samples:0 extended to arbitrary-UV depth sampling | 118k |
| postprocessing-motion-blur | first setupCB MRT on main pass; third cold-start signature isolated (falsified own hypothesis) | 124k |
| mesh-batch | 20k BatchedMesh + radix custom sort; remount-over-dispose | 114k |
| skinning-points | compute kernel AS positionNode; **found B21** (fiber module augmentation shadows @types Fn); .mix landmine | 161k |
| occlusion | WebGPU occlusion queries; state flip captured live; occlusionTest DT gap flagged | 91k |
| layers | blossom storms on camera layers; first consumer of the fresh .mix rule | 114k |
| pmrem-equirectangular | pmremTexture live level uniform; **B13 sharpened** (UltraHDRLoader works via useLoader) | 101k |
| reflection-blurred | depth-masked hashBlur reflector; @types-newer-than-runtime drift found; reflection retrofit candidate | 131k |

Cumulative: **95 agent ports across 11 waves + 2 gate ports, zero manifest
clobbers across 48+ concurrent pair-registrations.** AGENTS.md v0.21→v0.24;
UPSTREAM briefs at B21.

## Wave 10 (same night) — and the animates tier

8 ports, 4 pairs, plus two infra items between pairs. **81 examples total,
81/81 smoke + contact sheet green on Metal, 80/81 animates (+1 ledgered
skip). Fourth consecutive zero-review-fix wave** (rain self-fixed its own
find pre-report).

| Example | Notes | Cost |
|---|---|---|
| compute-particles-rain | live scene collision via layer-routed height prepass; **found the B18→B17 sibling escalation** | 131k |
| compute-particles-snow | self-feeding accumulation (settled flakes render into the collision map); lazy-useState rule | 149k |
| materials-transmission | 10 knobs → plain JSX props (reference-backed rule now default, 3rd confirmation); B13 hit #5 | 102k |
| materials-alphahash | ssaaPass joins the samples:0 list (self-corrected mis-reasoning → bullet hardened) | 102k |
| cubemap-dynamic | live CubeCamera reflections; pure pattern reuse, zero rediscovery | 108k |
| materials-envmaps-groundprojected | Ferrari beach classic; TSL ground projection with live uniforms | 126k |
| materials-lightmap | baked castle scene; slider starts at the value the JSON ships (upstream GUI quirk fixed) | 99k |
| parallax-uv | ice-sheet parallaxUV + blendOverlay; zero rediscovery | 89k |

**Infra shipped mid-wave:**
- **The animates tier** (tests/animates.spec.ts, `pnpm test:animates`): two-frame
  pixel diff + frame-loop liveness + dual-root-warning capture. 18 confirmed
  statics flagged in the manifest; geometry-loft carries the one animatesSkip
  (ledgered B17 anomaly). Port checklist gained step 0; local-only pending
  SwiftShader window tuning. SPEC §10 tier-1.5 amendment is a candidate for
  Dennis.
- custom-fog ciSkip #3 (deterministic WebGPU Device Lost on SwiftShader).

Cumulative: **79 agent ports across 10 waves + 2 gate ports, zero manifest
clobbers across 40+ concurrent pair-registrations.** AGENTS.md v0.18→v0.21.

## Wave 9 (same night) — and the CI milestone

8 ports, 4 pairs. **73 examples total, 73/73 smoke + contact sheet green on
Metal. Third consecutive zero-review-fix wave.** And the big one: **CI smoke is
BLOCKING and green** — the B17 repair resolved the SwiftShader stall matrix
(all four former stalls pass; run 30261064018), exception list down to 2
legitimate ciSkips (volume-fire perf, geometry-loft B17-anomaly).

| Example | Notes | Cost |
|---|---|---|
| ocean | WaterMesh/SkyMesh + per-sun-move PMREM bake; safe primitive-reparenting pattern | 95k |
| clearcoat | 4 physical spheres over Pisa HDR cube; found B20 (Environment can't load HDR cubemaps) | 114k |
| mirror | two TSL reflectors (decal-masked floor, rippled blue wall) | 108k |
| materials-sss | first FBX port; MeshSSSNodeMaterial, zero casts | 111k |
| custom-fog | showpiece: procedural alpine valley, 500k trees, triNoise3D fog wisps; leva onEditEnd bake gate | 132k |
| fog-height | exponential height fog, uniform-driven (no rebuilds) | 89k |
| instance-points | PointsNodeMaterial fat points + compute pulse + inset (top-origin fix reapplied) | 121k |
| instance-uniform | custom InstanceUniformNode (per-object uniform updates) ported faithfully | 115k |

Watch: custom-fog (500k trees) may time out on blocking SwiftShader CI — if
the next run goes red there, add its ciSkip (agent correctly didn't preempt).

Cumulative: **71 agent ports across 9 waves + 2 gate ports, zero manifest
clobbers across 36+ concurrent pair-registrations.** AGENTS.md v0.16→v0.18.

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

**RESOLVED: the SwiftShader stall matrix WAS B17.** After the repair + ciSkip
removal, all four former stalls PASS on SwiftShader (CI run 30261064018:
skinning-instancing 27.9s, rtt 3.3s, tsl-halftone 7.4s, sprites 4.3s). The
smoke job is BLOCKING again. Exception list is down to 2 legitimate ciSkips:
volume-fire (perf) and geometry-loft (B17 open anomaly + 17-graph compile —
the one remaining investigation thread).

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
