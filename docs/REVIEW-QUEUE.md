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

### 1. `skinning-instancing-individual` is 44% over its original

`src/examples/animation/skinning-instancing-individual/` — **462 code lines vs 320**
(`pnpm compare skinning-instancing-individual`). Worst overrun in the corpus.

I checked whether it was padding: `rig.ts` (161 lines) is genuine CPU-side rig/proportion
data the original also builds — verified against the original source, not assumed. It also
carries the StrictMode fix described in AGENTS.md (the silent-black-screen case).

**What I'd do:** keep it. Compute-instanced skinning is the irreducible-work category, and
the demo genuinely does more per line than the original. But it's the single clearest
place to check whether "parity is success" is being stretched too far.

### 2. Category call: does `skinning-instancing-individual` belong in `animation/`?

It was ported in the geometry batch and the agent moved it to `animation/` to sit beside
`skinning-instancing`. Defensible — the subject is skinning, not instancing geometry — but
the technique on show is GPU instancing. Either is arguable.

### 3. Rule 4: sliders for constants the original hard-codes

Rule 4 allows a slider that "makes a hidden constant explorable", and that clause is the
one that historically produced bloat. Three ports leaned on it:

| example              | added            | original GUI      |
| -------------------- | ---------------- | ----------------- |
| `pmrem-cubemap`      | PMREM blur level | none — hard-coded |
| `cubemap-mix`        | PMREM blur level | none — hard-coded |
| `compute-texture-3d` | `animationSpeed` | none — hard-coded |

All three follow the precedent already set by the shipped `pmrem-equirectangular`, and each
costs a handful of lines. **What I'd do:** allow it, and tighten rule 4 to say "one slider,
for a constant the demo is _about_" — otherwise the clause keeps getting stretched.

---

## 🟡 Worth a look

### 3b. 🔴 `materials-texture-html` loads EXECUTABLE JS from a CDN at runtime

`src/examples/materials/materials-texture-html.tsx` dynamically imports
`three-html-render@0.1.2` from jsdelivr (pinned, `/* @vite-ignore */`). The original does
exactly this — real browser support for `HTMLCanvasElement.prototype.requestPaint` is
still unshipped, so the polyfill is feature-detected and fetched at runtime.

**This is a new category of dependency.** AGENTS.md § Assets covers hotlinking _data_
(textures, models, HDRs) pinned to the three.js release. Executable third-party JS,
fetched at runtime, from a package that is not in our lockfile, is a different thing —
supply-chain-wise and offline-wise.

**Options:** (a) allow it, amend § Assets to say runtime JS must be version-pinned and
named in the header; (b) add `three-html-render` as a real dependency and import it
normally; (c) drop the example. **What I'd do:** (b) if the package is sane, else (a) —
the demo is genuinely about HTML-as-texture and there is no way to show it without the
polyfill. Flagging rather than setting tacit precedent.

### 4. Shared-instance markers — is `<Instances>` the real answer?

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

### 5. A third material pattern the doc doesn't name

`scene/backdrop-area.tsx` builds four materials up front and picks one by prop at runtime
(a leva switcher). That is neither "declarative JSX child" nor "one instance shared by many
meshes" — it's N instances, one live. Currently marked `REVIEW(shared-instance)` because
that was the closest existing label. If this recurs it deserves its own name in rule 3.

### 6. `loader-texture-ktx2` introduces `ErrorBoundary` — new precedent

First use in the corpus. Per-texture, so an unsupported KTX2 variant degrades instead of
killing the page. Reasonable for a 16-variant format gallery; worth blessing (or not)
before it spreads.

### 7. Files over the ~200 code-line split guideline

Not necessarily wrong — the guideline says split _by scene role_, not to hit a number.

| file                                                | code lines |
| --------------------------------------------------- | ---------- |
| `volume/volume-fire/VolumeFire.tsx`                 | 367        |
| `compute/compute-water/Water.tsx`                   | 362        |
| `geometry/geometry-loft/Exhibits.tsx`               | 257        |
| `animation/skinning-instancing-individual/Herd.tsx` | 233        |
| `compute/compute-birds/Birds.tsx`                   | 232        |
| `compute/compute-cloth/Cloth.tsx`                   | 225        |

The first three are yours (hand-tuned), so they're presumably deliberate.

### 8. Site: search filters the sidebar, not the home gallery

Typing in the search box narrows the sidebar list but the home page's category gallery is
unaffected. Arguably it should filter too. Small change, purely a taste call.

---

## ⚪️ FYI — known, tracked, no decision needed

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
- **Deferred follow-ups** (recorded, not lost): `tsl-vfx-flames/Flames.tsx` and
  `tsl-vfx-tornado/Tornado.tsx` still build materials with `new SpriteNodeMaterial()` +
  post-construction `.colorNode =` (the rule-3 pattern fixed in `Terrain.tsx`);
  `volume-caustics` calls `useUniforms` after suspending loaders (reverse of B18-safe
  order — works today, wants a dedicated audit).

---

## Resolved

| decided    | what                                                                   | outcome                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | Rule 3 vs `useMemo`'d materials shared across many meshes              | **Performance wins when sharing is real**, but flag it with `REVIEW(shared-instance):` so a human can check whether `<Instances>` is the better answer. Rule 3 amended. |
| 2026-09-02 | `postprocessing.tsx`'s 4 sliders for constants the original hard-codes | **Keep.** They adjust hidden constants and cost ~8 lines.                                                                                                               |
| 2026-09-02 | Formatter                                                              | **Prettier, r3f's config, with `semi: true`** — Dennis writes semicolons and `semi: false` was deleting them.                                                           |
| 2026-09-02 | Which unported examples to cut                                         | **10 excluded** (renderer-internal/benchmark pages) + **7 deferred** by rules SPEC §4 already had (WebXR, webaudio, TSL tooling). Enumerated in SPEC §4.                |
| 2026-09-02 | Action-bar buttons                                                     | **Real brand icons**, not text monograms.                                                                                                                               |
