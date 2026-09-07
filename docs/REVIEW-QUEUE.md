# Review queue — things that need Dennis's eyes

Judgment calls that agents (and I) deliberately did **not** decide alone. Each entry says
what it is, why it needs a human, and what I'd do — so a review is a yes/no, not an
investigation.

**Working agreement**: agents never resolve an entry here. They add one (or drop a
`REVIEW(<topic>):` comment in the code, which the table below mirrors) and move on.
Resolved items move to the bottom with the decision recorded, because the _reasoning_ is
what stops the same question being re-litigated three waves later.

Status: 🔴 blocking a decision · 🟡 wants a look · ⚪️ FYI, no action expected

---

## 🔴 Decisions I can't make for you

### 1. `compute-reduce`: the canvas is faithful, but the DEMO was in the DOM we dropped

I captured the live original as an oracle (`pnpm shot:original webgpu_compute_reduce`) to
check whether our flat square was a bug. **It is not** — the original's two planes are flat
white squares too. Our render is correct.

But the capture shows what that means: **the original's substance is entirely in the DOM
around the canvas** — per-side pass counts and GPU timings ("18 pass in 0.024541ms" vs
"2 pass in 0.013125ms", which is the whole point of comparing reduction kernels), a
subgroup-reduction explainer, and an animated thread-value diagram. The port dropped all
of it as "page furniture the repo shell owns", following the convention correctly.

The result is an example whose canvas conveys almost nothing on its own.

**Options:** (a) accept it — the port teaches the compute patterns in source even if the
picture is dull; (b) bring back the timing readout only, as in-example DOM, which needs a
rule since AGENTS.md currently says examples never build their own titleblock UI;
(c) drop the example. **What I'd do:** (b), scoped tightly to the timing comparison —
without it the example cannot show the thing it exists to show. But that is a new
convention, so it's yours to set.

Related: `storage-buffer` (below) dropped `trackTimestamp` readouts for the same reason,
so a decision here covers both.

### 1b. Phase 2 — three things an agent cannot decide

Filed 2026-09-03 when Phase 2 was greenlit. Each is a "do we build a capability" call,
not a porting problem.

- **`webgl_worker_offscreencanvas`** — fiber v10 ships only a type shim for
  `OffscreenCanvas`; there is no worker/`createRoot`-in-a-worker story. Porting it means
  building that. **Dennis, 2026-09-07: wanted, not skipped** — an OffscreenCanvas story would
  be useful. Stays blocked until fiber has one; the upstream audit drafts the fiber ask.
- **WebXR (26 + 3 `webgpu_xr_*`)** — `@react-three/xr` 6.6 installs against v10 (peer
  `>=8`), but nothing here can verify an XR example: no headset, and smoke/animates cannot
  enter a session (Chromium's fake-device route is a MojoJS shim we'd have to build; the
  Immersive Web Emulator extension is alpha and needs a headed persistent-context launch).
  A third reason, found 2026-09-03: `XRGPUBinding` is not something stable browsers expose,
  so even the `webgpu_xr_*` originals run sessions through `setupWebGLXRFallback`, which
  swaps in a second WebGL-backend renderer at `setSession` time — a renderer swap fiber
  cannot express. Recommendation: **leave for later; when it comes, you port and verify a
  representative 3–4 by hand** (`xr_cubes`, `xr_dragging`, `ar_hittest`, `vr_teleport`).
  **Dennis, 2026-09-07: deferred, confirmed.**
  (webaudio was in this bullet; Dennis greenlit it 2026-09-03 and it shipped — see Resolved.)
- **`@react-three/rapier` on fiber v10** — declares peer `^9`. The `rapier-basic` probe
  will report whether it works; if it doesn't, the fallback (inlined three addon over the
  installed `@dimforge/rapier3d-compat`) is already specified. **No action unless the
  probe fails in a way the fallback doesn't cover.** Listed so you know it's a known risk.

## 🟡 Worth a look

### 3. Category call: does `skinning-instancing-individual` belong in `animation/`?

It was ported in the geometry batch and the agent moved it to `animation/` to sit beside
`skinning-instancing`. Defensible — the subject is skinning, not instancing geometry — but
the technique on show is GPU instancing. Either is arguable.

### 4. `compute-rasterizer-ibl` is the biggest file in the corpus — and the line metric overstates it

`src/examples/compute/compute-rasterizer-ibl/` — **1535 lines vs 1092 (+40.6%)**, six
files, `RasterizerIbl.tsx` alone 577 code lines against a ~200 split guideline.

**By content it is +8.5%, not +40.6%.** `pnpm compare` now prints a second metric —
non-whitespace characters — precisely because of this example. Prettier wraps at 120 cols
and the original is 4-space-tab HTML with long lines, so a deeply-nested TSL graph costs
us several lines where the original spent one. The two metrics agree on every other
example measured; this is the one where they diverge, which is what makes it a
measurement artifact rather than bloat. Even so, +8.5% of real content is an overrun.

It is also the most technique-dense port in the repo: meshopt LOD/meshlets, an HZB
occlusion pyramid, a packed visibility buffer, GPU-written indirect draw, and
visibility-buffer shading fed into the standard IBL pipeline through `overrideNodes`.

**What I'd do:** keep it, and treat `RasterizerIbl.tsx` at 577 lines as the real issue
rather than the total — it already split four ways by scene role and the remainder is one
component. Splitting further would be splitting to hit a number, which rule 7 says not to
do. Worth your eyes because it is the clearest test of where "parity is success" stops.

### 5. `tsl/shadertoy` runs `eval` at graph-build time — new precedent

`src/examples/tsl/shadertoy/shadertoy.tsx:53` evaluates JavaScript that three's own
`TSLEncoder` generates from the GLSL in `shaders.ts`. **The transpile IS the demo** — the
original does the same thing, and there is no way to show it without executing generated
code.

Not the same shape as the CDN question you just settled: nothing is fetched. The GLSL is
in our repo, the encoder is in `node_modules`, and the output never leaves the process.
The port uses indirect `(0, eval)` rather than the original's direct `eval`, so the
generated source closes over nothing but the `TSL` namespace handed to it, and the
production bundle was checked to confirm Rolldown preserves that namespace across the
boundary (a real risk — it could have worked in dev and broken in `pnpm build`).

**What I'd do:** keep it, and don't generalise. It's the only `eval` in 172 examples and
it is load-bearing for this one. Worth your yes/no because it's a first.

### 6. `storage-buffer` drops the original's WebGL-vs-WebGPU comparison

`webgpu_storage_buffer` renders its scene TWICE — once on a `forceWebGL` backend — and
`.setPBO(true)` exists only for that path. The port is WebGPU-only, following the call
`compute-reduce` already made.

**Why it's arguable:** the backend comparison is arguably the point of that demo, so this
is closer to "dropped a feature" than "dropped page furniture". Doing it properly is a
two-root job (`logarithmicDepthBuffer`-style, since the backend is a construction-time
renderer parameter) PLUS per-canvas store scopes, and our smoke/screenshot tiers only ever
see canvas one.

**What I'd do:** leave it WebGPU-only. This repo is WebGPU-first by charter, and a
half-tested second canvas showing a backend we don't otherwise ship is a poor trade. Your
call, since it's the second time we've silently narrowed a demo this way.

### 7. Two examples ship the same ~60-line smoke shader

`postprocessing-retro/Smoke.tsx` and `postprocessing-3dlut/Smoke.tsx` are the same TSL
graph. **The two upstream originals also duplicate it**, so this is faithful.

The agent kept them separate because cross-example imports aren't a sanctioned pattern and
`src/utils/` is documented as "reusable pieces _drei_ lacks" — a shared example asset is
neither. **What I'd do:** leave duplicated. But if a third example wants it, that's the
signal for a `src/assets/`-style home for shared scene pieces, and it'd be worth deciding
the rule before then rather than after.

### 8. Shared-instance markers — is `<Instances>` the real answer?

Rule 3's carve-out (performance beats declarative when sharing is real) is working, but
every marker is also a hint the scene may want instancing. Seven live:

| file                                           | what's shared                                 |
| ---------------------------------------------- | --------------------------------------------- |
| `postprocessing-ao/Furniture.tsx:51`           | 3 materials across ~20 meshes                 |
| `postprocessing-ao/Gallery.tsx:160`            | wall material ×3, column material ×N          |
| `scene/backdrop-water/WaterScene.tsx:51`       | 1 geometry + 1 material across 100 icosahedra |
| `scene/backdrop-area.tsx:94`                   | 4 materials, picked by prop — see #5          |
| `compute-particles-snow/SnowParticles.tsx:207` | 1 sphere across both instanced meshes         |
| `compute-particles-snow/SnowScenery.tsx:27`    | 1 material for 8 tree cones + trunk           |
| `tsl/tsl-angular-slicing.tsx:73`               | 2 physical materials over a traversed GLTF    |

`WaterScene`'s 100 icosahedra is the strongest `<Instances>` candidate.

### 9. A third material pattern the doc doesn't name

`scene/backdrop-area.tsx` builds four materials up front and picks one by prop at runtime
(a leva switcher). That is neither "declarative JSX child" nor "one instance shared by many
meshes" — it's N instances, one live. Currently marked `REVIEW(shared-instance)` because
that was the closest existing label. If this recurs it deserves its own name in rule 3.

### 10. `loader-texture-ktx2` introduces `ErrorBoundary` — new precedent

First use in the corpus. Per-texture, so an unsupported KTX2 variant degrades instead of
killing the page. Reasonable for a 16-variant format gallery; worth blessing (or not)
before it spreads.

### 11. Files over the ~200 code-line split guideline

Not necessarily wrong — the guideline says split _by scene role_, not to hit a number.

| file                                                | code lines |
| --------------------------------------------------- | ---------- |
| `compute/compute-rasterizer-ibl/RasterizerIbl.tsx`  | 577        |
| `compute/compute-rasterizer/*` (largest)            | see #3a    |
| `volume/volume-fire/VolumeFire.tsx`                 | 367        |
| `compute/compute-water/Water.tsx`                   | 362        |
| `geometry/geometry-loft/Exhibits.tsx`               | 257        |
| `animation/skinning-instancing-individual/Herd.tsx` | 233        |
| `compute/compute-birds/Birds.tsx`                   | 232        |
| `compute/compute-cloth/Cloth.tsx`                   | 225        |

The first three are yours (hand-tuned), so they're presumably deliberate.

### 12. Site: search filters the sidebar, not the home gallery

Typing in the search box narrows the sidebar list but the home page's category gallery is
unaffected. Arguably it should filter too. Small change, purely a taste call.

---

### 13. drei `<Html>` (non-transform) loses a label on a STATIC object under StrictMode

Found porting `css2d_label` (`scene/label.tsx`): the Earth's two labels never appeared; the
Moon's did. Probed the DOM — the Earth labels sat at drei's parking transform
`translate3d(0,-9999px,0)`, and a single camera drag brought them back.

Mechanism (verified, `drei/webgpu/index.mjs` `Html`): the per-frame DOM write is gated on
`|oldPosition - projected| > eps`, with `oldPosition` in a ref. StrictMode's dev-only effect
re-run happens in the PASSIVE flush, i.e. after fiber's first RAF frames have already
written the transform and filled `oldPosition`. The re-run unmounts and recreates Html's
React root and resets `el.style.cssText` to the parking transform — but the ref survives,
so an object that never moves never passes the eps gate again. Anything that moves (the
Moon, a camera being orbited by `target=`) recovers on its next frame, which is why
`loader-texture-ktx2`'s static labels never showed it: its DemoHelpers `target` nudges the
camera. `transform` mode is unaffected (it writes unconditionally).

Shipped: `eps={-1}` on the four labels, with a `REVIEW(drei-html-eps):` comment — forces
the write every frame, which for four labels is free. Production builds don't need it.

**Needs you:** an UPSTREAM B-entry for drei — either reset `oldPosition` where `cssText`
is reset (`if (!root.current)` branch), or skip the cssText reset on remount. **What I'd
do:** file it; keep the `eps={-1}` workaround until the fix lands, and add one line to
AGENTS.md § React and the ecosystem so the next `<Html>` port on a static object doesn't
spend the round-trip.

### 14. `css3d_sprites` → slug `css3d-sprites` (prefix kept)

The rule is "slug = original name minus the prefix", which gives `sprites` — already
taken by `webgpu_sprites`. Kept the prefix as the disambiguator for this one only
(`label`, `periodictable`, `molecules`, `youtube` follow the rule). **What I'd do:** accept
it and add the collision rule to AGENTS.md § Files, routes, manifest: "when the bare name
collides, keep the original's prefix".

### 15. `webgl_batch_lod_bvh` — blocked, not ported (Phase 2)

Two independent, stacked blockers, checked directly against what's installed:

1. **`@three.ez/batched-mesh-extensions`'s WebGPU build is not importable.** The installed
   package (0.0.12) DOES ship a WebGPU build (`build/webgpu.js`, `src/index.webgpu.js`,
   `src/patch/ExtendBatchedMeshPrototype.webgpu.js` all exist on disk) — but its
   `package.json` `"exports"` field maps `"."` to `build/webgl.js`/`.cjs` ONLY; there is no
   `"webgpu"` export condition and no subpath export at all. Node/Vite's `"exports"`
   resolution refuses any path not listed there, so a plain
   `import '@three.ez/batched-mesh-extensions'` gets the WebGL build (which patches
   `BatchedMesh.prototype` with WebGL-specific internals), and there is no sanctioned way
   to reach `build/webgpu.js` instead — a deep `/build/webgpu.js` import would need to
   bypass package resolution entirely (a bare relative `node_modules/...` import), which
   isn't a real fix, just a private-path hack against someone else's package layout.
   This is an upstream packaging gap (the exports map is almost certainly just a
   published-package oversight — the source clearly builds both targets), not something
   portable to work around from here.
2. **Two more dependencies the original needs aren't installed**: `@three.ez/simplify-geometry`
   (generates the demo's 4 extra LOD levels from the base mesh) and `meshoptimizer` (the
   simplifier's backend). Neither is in `package.json` — adding them needs `pnpm install`,
   which is outside an agent's rules of engagement this wave.

Also note (not a blocker, just evidence this was checked, not assumed): the original is
itself `WebGLRenderer`-only despite the `webgl_` prefix pattern holding here too — it
explicitly imports the `@three.ez/batched-mesh-extensions@0.0.11/build/webgl.js` CDN URL,
i.e. even upstream picks the WebGL build on purpose.

**What I'd do:** (a) file an issue/PR upstream against `@three.ez/batched-mesh-extensions`
adding a `"webgpu"` export condition — cheap, and unblocks this immediately once released;
(b) in the meantime, `pnpm add @three.ez/simplify-geometry meshoptimizer` and a local
`declare module` shim reaching `build/webgpu.js` by relative path would technically work
but is exactly the kind of fragile, non-portable hack AGENTS.md's "no dependency patches"
rule exists to keep out — I'd rather wait for (a) or skip the example than ship it. **Not
touched**, no partial file on disk.

### 16. `as unknown as X` vs plain `as X` — should the corpus prefer the minimal cast?

R3 sweep of the 97 `as unknown as` sites found several documented-legitimate casts (real
`@types/three` gaps: `PassNode.options` — B11, `BloomNode.highPassFn` — B24, `Points.count`
— B34) that typecheck fine with the `unknown` intermediate hop DROPPED — a plain
`as { options: … }` / `as ReturnType<typeof …>` compiles clean, because the target type
still overlaps the source closely enough for TS's single-step assertion rule. The double
hop isn't WRONG (it's the maximally-permissive form and never fails), but it's stronger
than the gap requires and reads as "TS is fighting me here" when a lighter cast would do.
Left as-is everywhere except the sites that turned out to be fully removable (see AGENTS.md
amendment proposal, backgroundNode/fogNode/environmentNode family) — didn't want to
speculatively touch ~10 more files under a task whose ask was "remove the unnecessary
ones," not "minimize the necessary ones." **What I'd do:** if you want the lighter form as
house style, it's a mechanical follow-up (test each site with `as X`, keep `as unknown as X`
only where the compiler demands it) — worth doing in the same pass as whatever normalizes
the B11 comment wording post this sweep, not a new one.

## ⚪️ FYI — known, tracked, no decision needed

- **Per-object `onPointerMissed` is not "click on nothing".** fiber calls it for every
  interactive object a pointer event did not hit — including on `pointerover`, before any
  click — so `<mesh onPointerMissed={deselect}>` fires the instant a hover selects the mesh.
  Only the Canvas-level `onPointerMissed` is click-gated (`isClickEvent && !hits.length &&
delta <= 2`). Cost `geometry-spline-editor` a round of debugging; its selection state now
  lives with the `<Canvas>` for that reason. Worth one sentence under § React and the
  ecosystem.

- **The whole corpus, measured both ways** (`pnpm compare --all`, 196 examples with an
  `original` URL): **29,788 vs 34,069 code lines (−12.6%)** and **925,251 vs 1,197,585
  non-whitespace chars (−22.7%)**. 159 are smaller by line; **191 are smaller by content**.
  The gap is prettier's 120-col wrapping of dense TSL — 32 examples read as bloated by line
  and lean by content (`volume-fire` +24.3% / −4.8%, `lights-rectarealight` +20.4% / −17.8%,
  `postprocessing-ao` +14.5% / −15.9%). If any of those were reported to you as regressions
  during the restyle, they weren't.
  The only **five** genuinely larger by content:

  | example                          | lines  | chars  |
  | -------------------------------- | ------ | ------ |
  | `backdrop-water`                 | +59.2% | +18.0% |
  | `geometry-loft`                  | +24.7% | +11.6% |
  | `compute-rasterizer-ibl`         | +40.6% | +8.5%  |
  | `backdrop`                       | +37.0% | +5.1%  |
  | `skinning-instancing-individual` | +44.4% | +3.9%  |

  Three of the five are hand-tuned files of yours, so they are presumably deliberate.

- **Multi-`<Canvas>` examples are half-tested.** Smoke and contact-sheet both capture
  `locator('canvas').first()`, so `camera-logarithmicdepthbuffer`'s second canvas is never
  asserted or photographed. Documented in AGENTS.md § Verification.
- **B28 flakes**: `tsl-wood` (~1 in 5) and `loader-gltf-dispersion` (~3 in 5) fail smoke on
  `PMREM.cubeUv`. Console-only — the canvas renders. 27 examples use drei `<Environment>`,
  so any of them can hit it.
- **`loader-materialx` ships 28 of 31 upstream samples.** Three
  (`standard_surface_brass_tiled`, `_brick_procedural`, `_wood_tiled`) reference sibling
  texture files that don't exist at that path in the upstream `materialx/MaterialX` repo —
  the images live under `resources/Images/`. Verified via the GitHub API; the official
  three.js demo points at the same raw path and 404s identically today. Dropped rather
  than fabricating a corrected path.
- **Tag vocabulary grew by five this wave**: `upscaling` (2 uses), `color-grading`, `crt`,
  `dithering`, `blur` (1 each). Consistent with the ~70 existing single-use effect tags,
  but the vocabulary is meant to be tight — worth a pass once porting is done.
- **Deferred follow-ups** (recorded, not lost): `tsl-vfx-flames/Flames.tsx` and
  `tsl-vfx-tornado/Tornado.tsx` still build materials with `new SpriteNodeMaterial()` +
  post-construction `.colorNode =` (the rule-3 pattern fixed in `Terrain.tsx`);
  `volume-caustics` calls `useUniforms` after suspending loaders (reverse of B18-safe
  order — works today, wants a dedicated audit).

- **B11's `Scene` half is fixed in `@types/three` 0.185.1 — the currently installed
  version, not a future bump.** `declare module "../../scenes/Scene.js" { interface
Scene { environmentNode?; backgroundNode?; fogNode?; } }` lives in
  `renderers/common/Renderer.d.ts` right now (verified: a bare `scene.backgroundNode =
node` with no cast typechecks clean against the installed package). Every
  `scene as unknown as { backgroundNode: Node | null }` cast in the corpus (34 sites,
  33 files) was dead weight — removed in the R3 sweep, comments updated to say so instead
  of "documented cast." `NodeMaterial.colorNode` is ALSO now declared on the base class
  (not just `MeshStandardNodeMaterial`), so a `material` typed as `NodeMaterial` needs no
  cast for `.colorNode` either — checked case by case, since a `material` typed as the
  classic `MeshStandardMaterial`/generic `Material` (the GLTF-loader-return shape) still
  needs one. `emissiveNode`/`clearcoatNode`/light `.colorNode` remain undeclared — B11
  is NOT fully closed, only the `Scene` + base-`NodeMaterial.colorNode` slice of it.
  AGENTS.md's B11 bullet needs a wording pass so the next agent doesn't re-add the cast
  by copying an older example (proposed wording handed to Dennis with the R3 report).

---

## Resolved

| 2026-09-07 | 1c `webgl_morphtargets_webcam` (MediaPipe + webcam) | **Skip.** Not ported; struck in the Phase 2 backlog with the reason. |
| 2026-09-07 | 1d loader gallery: `gltf_progressive_lod`, `gltf_animation_pointer` (Needle packages + off-mirror assets), `loader_3dtiles` (five packages, Cesium key) | **Skip.** Struck in the Phase 2 backlog with the reason. |
| 2026-09-07 | 2 — a slider for a constant the original hard-codes (`pmrem-cubemap`, `cubemap-mix`, `compute-texture-3d`) | **Allowed.** The three keep their slider; rule 4 now says ONE slider, on a constant the demo is about, a handful of lines. |
| 2026-09-07 | 1 `compute-reduce` DOM timing readout | **Dennis takes it himself**; the in-example DOM readout path is agreed as the likely shape. Entry stays open until he does. |
| 2026-09-03 | webaudio (from 1b) | **Greenlit and ported** — 5 examples in the new `audio/` category, `startClick` manifest field + `<StartOverlay>`; WebXR stays in 1b. |
| 2026-09-03 | `@types/three` `AudioContext.getContext()` mistyped (was #16) | **Ledgered as UPSTREAM B53**; the documented cast stays in `src/utils/resumeAudioContext.ts` until it lands. |

| decided    | what                                                                    | outcome                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | Rule 3 vs `useMemo`'d materials shared across many meshes               | **Performance wins when sharing is real**, but flag it with `REVIEW(shared-instance):` so a human can check whether `<Instances>` is the better answer. Rule 3 amended.                                                                                                                                                                                                                           |
| 2026-09-02 | `postprocessing.tsx`'s 4 sliders for constants the original hard-codes  | **Keep.** They adjust hidden constants and cost ~8 lines.                                                                                                                                                                                                                                                                                                                                         |
| 2026-09-02 | Formatter                                                               | **Prettier, r3f's config, with `semi: true`** — Dennis writes semicolons and `semi: false` was deleting them.                                                                                                                                                                                                                                                                                     |
| 2026-09-02 | Which unported examples to cut                                          | **10 excluded** (renderer-internal/benchmark pages) + **7 deferred** by rules SPEC §4 already had (WebXR, webaudio, TSL tooling). Enumerated in SPEC §4.                                                                                                                                                                                                                                          |
| 2026-09-02 | Action-bar buttons                                                      | **Real brand icons**, not text monograms.                                                                                                                                                                                                                                                                                                                                                         |
| 2026-09-02 | `materials-texture-html`'s runtime CDN import of `three-html-render`    | **Keep the CDN import, matching the original.** The rule Dennis set: a stable library gets installed properly; a shim for an unshipped browser API does what upstream does. WICG HTML-in-Canvas ships nowhere stable, so the polyfill stays a pinned, feature-detected runtime import rather than a 0.1.x lockfile entry we'd remove once the API lands. AGENTS.md § Repo format now states this. |
| 2026-09-02 | `skinning-instancing-individual` at "+44%, worst overrun in the corpus" | **Closed — the premise was a measurement artifact.** +44.4% by line but **+3.9% by content**; `pnpm compare` now prints both. Corpus-wide, 191 of 196 examples are smaller than their original by content and only 5 are genuinely larger. Compute-instanced skinning at +3.9% is squarely the irreducible-work category.                                                                         |
| 2026-09-03 | `<threeLine>` crashes on its first prop update (fiber alpha.4)          | **Fixed in code + filed as B44.** `src/assets/ThreeLine.ts` shims `extend({ ThreeLine: Line })`; imported by `decals`, `geometry-nurbs`, `lines-dashed`, `modifier-curve`.                                                                                                                                                                                                                        |
| 2026-09-03 | drei `<TransformControls>` never mounts `getHelper()` — no gizmo        | **Fixed in code + filed as B46.** `geometry-spline-editor` and `modifier-curve` both render `{gizmo && <primitive object={gizmo.getHelper()} />}` via the setter-as-ref pattern, marked `TODO(drei-gap):`.                                                                                                                                                                                        |
| 2026-09-03 | fiber `diffProps` resets a dropped node-material prop to `0`            | **Fixed in code + filed as B47.** `BlobMaterial.tsx` remounts on switch (`<Fragment key={name}>`) instead of relying on the diff; AGENTS.md § React and the ecosystem documents the trap.                                                                                                                                                                                                         |
