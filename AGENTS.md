# AGENTS.md — r3f-examples conventions

R3F v10 ports of the official three.js examples, WebGPU-first.

**The point of this repo**: show that the same demo is _clearer_ in React than in
vanilla three.js. A port that is longer, more indirect, or more imperative than the
original has failed even if it renders perfectly. Read [House style](#house-style)
before writing a line.

Contract: [docs/SPEC.md](docs/SPEC.md) · Milestones: [docs/ROADMAP.md](docs/ROADMAP.md)
· Session state: [docs/HANDOFF.md](docs/HANDOFF.md) · Patch/upstream ledger:
[docs/UPSTREAM.md](docs/UPSTREAM.md).

When a port forces a divergence from this doc, that divergence must end up as an
example fix OR an amendment here (with a changelog entry) — never silent.

**A judgment call you cannot make from the rules goes in
[docs/REVIEW-QUEUE.md](docs/REVIEW-QUEUE.md), not into the code silently.** Add the entry
(and a `REVIEW(<topic>):` comment at the site if there is one), say what you'd do and why,
and move on. Never resolve someone else's entry there.

## Commands

- Package manager: **pnpm only**
- `pnpm dev` — Vite dev server, port 5173
- `npx tsc --noEmit` / `pnpm lint` / `pnpm build` — typecheck / lint / build
  (`pnpm lint` runs eslint **and** `prettier --check`)
- `pnpm format` — prettier `--write`. Formatting is not a review topic; run it.
- `pnpm test:changed <slug>` — smoke + animates for one example
- `pnpm shot <slug>` — screenshot to `screenshots/`

**Formatting is prettier's job, and the config is deliberate.** `.prettierrc` is r3f's
own, with one intentional divergence: **`semi: true`** — Dennis writes semicolons and
`semi: false` was silently deleting them. **Write semicolons.** Everything else
(single quotes, 120 cols, trailing commas, `bracketSameLine`) matches r3f upstream.
Never hand-format to match; `pnpm format` is the source of truth.

Definition of done: typechecks, lints, builds, renders on WebGPU (real `webgpu`
canvas context, console clean), registered in the manifest, header block present.

## Stack pins (Sept 2026 — alpha era, versions matter)

- `@react-three/fiber` **10.0.0-alpha.4** (npm) · `@react-three/drei`
  **11.0.0-alpha.6** (npm) · `three` **0.185.1** · React 19.2 (fiber peer is
  `>=19.0 <19.3`)
- `leva`, `camera-controls` v3, react-router **7** (pinned `version-7` dist-tag; npm
  latest is v8 — do not bump), TypeScript strict, Tailwind v4, single flat tsconfig
- `@perplexdotgg/bounce` **^1.10.0** — a rigid-body engine used by exactly one example
  (`postprocessing-ssgi-ballpool`), whose original loads it from a CDN import map. Installed
  rather than hotlinked because it is an ordinary library, not a browser-API polyfill
  (§ Repo format). Newer than the original's 1.8.1; follow the installed types.

**Verification tooling** (§ Verification has the workflow): `pnpm compare <slug>` prints
code lines AND non-whitespace chars against the original — **believe chars when they
disagree**, because prettier's 120-col wrapping inflates lines on dense TSL and says
nothing about verbosity. `pnpm shot:original <three.js name>` captures the LIVE original,
which is the oracle the tone-mapping and visual-parity rules keep asking you to compare
against. `SHOT_DELAY_MS=6000 pnpm shot <slug>` captures later than the default 800ms, for
a demo whose picture only develops over seconds.

- `typescript` pinned **^6** (not 7): typescript-eslint has no TS7 support yet
  (typescript-eslint#10940)
- **No dependency patches.** `patches/` and the vendored fiber tarball are both gone
  (UPSTREAM A1 + A2 unwound). The one local shim left is
  `scripts/patch-fiber-types.mjs` (postinstall, types-only — UPSTREAM B1/A9).
- Reference clones (gitignored, `reference/`): `react-three-fiber` v10 branch — its
  `example/src/demos/webgpu/` is the **house-style reference**, and `docs/webgpu/*.mdx`
  is the only v10 API documentation that exists (the public site 404s on v10).

---

# House style

These are the rules that decide whether a port is good. They came from reviewing the
corpus; violations of them are what "needs restyling" means.

## 1. Controls live next to what they control

**Never drill leva values through props.** leva's `useControls` works anywhere, and
multiple `useControls` calls merge into one panel — that is the whole point of it.
Put the controls in the component that consumes them and feed `useUniforms` directly.

```tsx
// GOOD — one component owns the knobs, the uniforms and the mesh
function SeaSurface() {
  const { color, roughness, ...waveValues } = useControls('Raging Sea', seaControls);
  const uniforms = useUniforms(waveValues);
  const matNodes = useNodes(() => makeSeaNodes(uniforms));
  return (
    <mesh>
      <TerrainGeometry />
      <meshStandardNodeMaterial color={color} {...matNodes} />
    </mesh>
  );
}

// BAD — controls at the page root, values drilled down as props
```

The only hard constraint: **fiber hooks (`useUniforms`, `useNodes`, `useFrame`,
`useThree`, …) must be inside `<Canvas>`.** Outside it you get
`R3F: Hooks can only be used within the Canvas component!` at runtime. So the
consuming component is a Canvas child — that is where the controls go too.

**Writing values BACK into the panel** uses leva's function form:
`const [values, set] = useControls('Folder', () => ({ … }))`. Legitimate when the original
does it and the write is slow and event-shaped (a selection cycling every few seconds —
`postprocessing-transition`). Never for a per-frame value: that re-renders the panel every
frame. Drive those from a uniform and leave the panel out of it.

Corollary: several `useEffect`s pointed at the same object is a smell. It usually
means state was lifted too far and is being reassembled.

**When TWO siblings consume the same value**, it stays at their shared parent — one hop
up, passed down. Do not duplicate the `useControls` call: the same leva key registered
twice renders two sliders. "Next to its consumer" means _as close as it can go_, not
"always in a leaf".

**Repeated instances take DATA, not controls.** A component rendered N times
(`<OrbitLight>` x4) does not get N leva folders — that would need a dynamic key
(`useControls('light' + id)`), a pattern that appears nowhere in this corpus and should
not be introduced. Pass the varying values as plain props from a small legible array;
`lights-phong` is the reference:

```tsx
<OrbitLight color="#0040ff" orbit={[{ s: 0.7 }, { c: 0.5 }, { c: 0.3 }]} />
<OrbitLight color="#ffaa00" orbit={[{ s: 0.3 }, { c: 0.7 }, { s: 0.5 }]} />
```

If the original had GUI for the whole set, that is ONE `useControls` at the shared
parent. Props carrying per-instance data are not prop drilling — the rule is about leva
values threaded through components that don't consume them.

**Hazard when you colocate**: moving controls into a component usually makes it a
creator-hook component (it now calls `useUniforms`/`useNodes`). A creator-hook component
mounted AFTER a Suspense-gated suspending sibling is the B18 trigger that escalates into
a B17 pixel freeze. If you colocate into a component that renders after a `<Suspense>`,
move it before the boundary (pattern: `postprocessing-sobel`, `postprocessing-ao`).

## 2. Use the v10 hooks, not `useMemo` + `useEffect`

`useNodes`, `useUniforms`, `useTexture`, `useBuffers`, `useGPUStorage` exist precisely
to replace hand-rolled memoization. `useNodes`' creator receives `{ uniforms, nodes,
buffers, gpuStorage, scene, … }`, so it can reach the store itself instead of closing
over drilled props.

```tsx
// GOOD
const { checkerSpecular, waterNormalNode } = useNodes(() => ({
  checkerSpecular: mix(color('#00f'), color('#f00'), checker(uv().mul(5))),
  waterNormalNode: normalMap(texture(waterNormal)),
}));

// BAD — three separate useMemos doing the same thing
```

`useMemo` is still correct for values that must be rebuilt when a runtime _instance_
changes (e.g. `lights([instance])`) — `useNodes` is create-once and can't express that.

## 3. Declarative first

Build the scene in JSX. Imperative three.js is an intentional, _showcased_ escape
hatch — keep it visible in the component that owns it, never hidden in a helper.

- No `useMemo(() => new SomeMaterial())` + `material={…}`. Write
  `<meshPhongNodeMaterial …/>` as a child.
- No `<primitive object={new X()}>` when an intrinsic element exists.
- Loops are fine — prefer mapping over a small data array to four near-identical JSX
  blocks — but keep the data legible.
- If React genuinely cannot express it, use vanilla and say why in a comment.

**Exception — one instance genuinely shared by many meshes.** A JSX material child
creates one material per mesh. When a scene points dozens of meshes at the same
material, `useMemo(() => new SomeMaterial())` + `material={…}` is the correct call:
**performance wins over declarative when the sharing is real.** Same for a shared
geometry.

But take it as a smell, not a free pass — wide sharing often means the scene wants an
`<Instances>`/`InstancedMesh`, or a component boundary in the wrong place. So do it the
performant way AND flag it for a human:

```tsx
// REVIEW(shared-instance): one MeshStandardMaterial across ~20 meshes; a JSX child
// would create 20. Worth checking whether this wants <Instances> instead.
const woodMaterial = useMemo(() => new MeshStandardMaterial({ color: '#8b5a2b' }), []);
```

`REVIEW(<topic>):` is the repo's flag-for-human marker (cf. `TODO(drei-gap):` in
`src/utils/CameraControls.tsx`) — greppable, and it must say what the reviewer should
weigh. Never add one silently to dodge a rule.

**The win is lopsided by category, and that is expected.** Scene-graph-heavy demos
(hierarchies, lights, events, animation wiring) collapse hard in JSX — vanilla spends
its lines on `add()`/`position.set()`/listener plumbing. Pipeline- and TSL-heavy demos
(post-processing, compute, shader graphs) do NOT: the graph is irreducible work we need
too, so a good port lands near parity with the original. **That is a success, not a
regression.** Never simplify a TSL graph, drop a pass, or cut comments to chase a line
count — the demo has to still be the demo.

## 4. Don't add features the original doesn't have

We are comparing _this demo_ to _that demo_. A leva selector that triples the code is
a net loss even if it's fun. Add controls only where the original had GUI, or where
one slider makes a hidden constant explorable. If a control forces state lifting,
registries, or instance plumbing, it is not worth it — drop it.

## 5. Types come from the elements, never hand-written

If you are writing `Node<'vec3'>` by hand you are about to fight the compiler. Derive
prop types from the JSX element that will receive them:

```tsx
type TeapotProps = ThreeElements['mesh'] &
  Pick<ThreeElements['meshPhongNodeMaterial'], 'shininess' | 'specularNode' | 'normalNode'>;
```

Real node classes (`LightsNode`, `TextureNode`, `NormalMapNode`) do **not** satisfy a
guessed `Node<'vec3'>`; guessing is what forces casts into examples.

**The rule is about props you RECEIVE, not node values you PRODUCE.** Deriving from the
element works because you want whatever that prop accepts. It does not invert: material
node props are declared loosely (`NonNullable<ThreeElements['meshBasicNodeMaterial']['colorNode']>`
resolves to roughly `{ nodeType?: string | null; uuid?: string }`), so using it as the
return type of something you built strips the fluent surface and `.mix()` stops resolving.
For a node you construct and then chain on, write the concrete `Node<'vec4'>` — that is
not the hand-written guess the rule warns about (pattern: `tsl/shadertoy`).

**Casts are a bug report.** If an example needs `as unknown as`, that is an upstream
gap — file it in [docs/UPSTREAM.md](docs/UPSTREAM.md) with the evidence rather than
sprinkling casts. Same for importing `Mesh`/`Material` classes just to type a ref: if
the JSX types don't cover it, something is wrong.

## 6. Comments: shorter, friendlier, once

- The header block is an orientation for an intermediate R3F user, not a spec. Lead
  with plain language; put detail inline where it applies.
- **Say it once.** If an inline comment explains the trick, the header shouldn't
  repeat it.
- No boilerplate DIVERGENCE bullets. Tone mapping, CameraControls, camera near/far,
  file splitting and "leva replaces the Inspector" are repo-wide conventions covered
  in the README — not per-example divergences. Only list a difference a reader would
  otherwise be confused by. **DIVERGENCE is optional**; a faithful port says nothing.

Header block:

```
/**
 * <slug>
 * <one or two plain sentences: what you are looking at>
 * Original: <threejs.org URL>
 *
 * DEMONSTRATES
 * - <what this teaches, R3F angle first — aim for 3-6 bullets>
 *
 * DIVERGENCE from original   (omit entirely if there is nothing real to say)
 * - <differences a reader would trip over>
 */
```

## 7. Section breaks inside files

Big undifferentiated blocks are hard to scan. Use a consistent marker:

```tsx
//* Controls ======================================================
//* Shader graph ==================================================
//* Scene =========================================================
```

**File level only** — between top-level declarations. A marker inside a function body is
noise, not a scanning aid. A file with two short components doesn't need any.

## 8. Import hierarchy

Broadest/most fundamental first, local last. **Order is what matters and is what
`corpus/import-hierarchy` enforces**; a blank line between tiers is optional — the
hand-tuned corpus does both (`lights-phong` separates, `materials-basic`/`tsl-earth`
run one block). Don't churn a file just to add or remove them.

```
react
three (three, three/tsl, three/webgpu, three/addons)
@react-three/fiber
@react-three/drei, other third-party r3f (leva, camera-controls)
global utils (src/utils, src/assets, src/types)
parent-relative, then sibling-relative
```

## 9. Name refs for what they hold

`const meshRef = useRef<Mesh>(null)`, not `const ref = …`. Console errors and
`ref.current` reads are unreadable otherwise. A component that _exposes_ a ref should
still have a local one to work with:

```tsx
// Hooks can't be conditional — always make the local ref, then pick.
const localRef = useRef<PointLight>(null);
const lightRef = ref ?? localRef;
```

Type the exposed prop `React.RefObject<T | null>`, not `React.Ref<T>` — `React.Ref`
admits callback refs, which have no `.current` to read.

**A drei controls ref is typed from the element**, not from a class import:
`useRef<React.ComponentRef<typeof OrbitControls>>(null)`. That is rule 5 applied to
drei — no `import type { OrbitControls as Impl } from 'three/addons/…'` needed
(pattern: `camera/controls`, `camera/controls-transform`).

## 10. `useFrame` destructuring

`useFrame(({ elapsed, delta }) => …)`. Don't write `(_, delta)` to skip state —
`state.elapsed` (s), `state.delta` (s) and `state.time` (ms) all live on state.
`state.clock` is gone.

---

# R3F v10 idioms

> Written against fiber **alpha.4**. Anything here contradicting the reference demos
> in `reference/react-three-fiber/example/src/demos/webgpu/` — trust the demos.

## Entry point and renderer

- Import `Canvas` and all hooks from **`@react-three/fiber/webgpu`**. Never mix entry
  points in one app.
- Write `renderer` on the Canvas even though `/webgpu` implies it — that prop is where
  parameters land. `renderer={{ … }}` passes WebGPURenderer parameters.
- `state.renderer` is typed `WebGPURenderer` on the `/webgpu` entry (alpha.4). **No
  cast.** `gl` is a deprecated alias — don't write it.
- `background` prop (color / hex / HDR URL / environment preset) replaces
  `<color attach="background">`. `shadows` takes variant strings.
  `flat`/`linear`/`colorSpace`/`toneMapping` Canvas props are gone — use
  `renderer={{ toneMapping, outputColorSpace }}`.
- **Canvas `shadows` variants map by NAME, not by resemblance**: `"basic"` →
  `BasicShadowMap`, `"percentage"` → `PCFShadowMap` (the three default an original gets
  from `shadowMap.enabled = true`), `"variance"` → `VSMShadowMap`; `"soft"` is a deprecated
  alias of PCF. An original's `PCFShadowMap` is `shadows="percentage"`, not `"basic"` —
  verified in fiber's dist; an agent nearly shipped the wrong one.
- **fiber aims the default camera at the ORIGIN.**
  `if (!state.camera && !cameraOptions?.rotation) camera.lookAt(0, 0, 0)` — so an original
  whose camera sits above the origin but looks LEVEL (`camera.lookAt(0, height/2, 0)`)
  silently comes out tilted down. Pass an explicit `rotation: [0, 0, 0]` in the `camera`
  prop to suppress the `lookAt`; that beats reaching for drei's
  `<PerspectiveCamera makeDefault>`, which adds a mount-order hazard against
  `useRenderPipeline` capturing `state.camera` (pattern: `postprocessing-ssgi-ballpool`).
  Costs a screenshot round-trip to notice, because nothing errors.
- **Tone-mapping parity trap**: fiber defaults to ACESFilmic; three.js originals use
  the WebGPURenderer default (NoToneMapping) unless they set one. An unexamined
  default visibly mutes emissive palettes. Decide deliberately on every port and
  compare against the LIVE original, not the (stale) gallery thumbnail.

## Frame loop

- Phase-based scheduler: `{ phase: 'input' | 'physics' | 'update' | 'render' }`, plus
  `before`/`after` and `{ fps: n }`. Numeric priorities are a v9-ism.
- **`phase: 'render'` takes over rendering** — only for examples about custom
  rendering, and never alongside `renderer.render()`.
- **Never `await` inside a `phase: 'render'` callback.** The scheduler doesn't await
  it, so frame N+1 races frame N on renderer global state. Keep it synchronous and
  kick async GPU work off as a throttled promise that touches only its own data
  (pattern: `multiple-rendertargets-readback`).
- `setViewport`/`setScissor` y-origin is **TOP-left** on WebGPU, unlike WebGL.
  Originals doing bottom-origin inset math land in the wrong corner — recompute
  (pattern: `lines-fat/InsetView.tsx`).
- **`state.pointer` is (0,0) until the first pointer event.** For fields that must be
  off-scene when idle, track the pointer from events instead (invisible plane +
  `onPointerMove`) — otherwise "no signal yet" reads as "at the origin".
- `useFrame` returns pause/resume controls; prefer them to ad-hoc booleans.

## TSL and the store hooks

- All creator hooks are create-if-not-exists and StrictMode-safe; calling twice shares
  the instance. **`useLocalNodes` is the exception in one useful way**: it is a pure
  `useMemo` wrapper with no `store.setState`, so unlike `useUniforms`/`useNodes` it is
  safe to call after a suspending sibling — the B18 hazard does not apply to it.
- **Scoped stores are safe** (alpha.4 sanitises names into valid WGSL identifiers).
  `useNodes(creator, 'scope')` to create, `useNodes('scope')` to read back elsewhere —
  that read-back is the idiomatic alternative to prop-drilling nodes. Skip the scope
  when one component both creates and consumes.
  **The stores are PRIMARY-canvas scoped, not per-root** (`useBuffers` → `usePrimaryStore()`).
  Two `<Canvas>` roots share one device and one buffer/node store, so a component rendered
  once per canvas MUST take a distinct scope per canvas or the second silently reuses the
  first's buffers — same root cause as the `renderer.domElement` trap in § Verification
  (pattern: `compute-reduce`).
- **Build-time vs run-time**: JS `if`/`for` in a node builder runs ONCE at graph build.
  Use TSL `If()`/`Loop()`/`select()` for anything that must react to a uniform.
- TSL helpers that internally `.toVar()`/`.assign()` (`RaymarchingBox` et al.) need an
  active stack — call them inside `Fn()`. The originals' `Fn` wrappers are
  load-bearing. Fails only at runtime (`No stack defined for assign operation`).
- `useNodes`' returned wrapper has a fresh identity every render (members are
  store-stable, the spread isn't) — key downstream `useMemo`s on individual nodes.
- Prefer TSL built-ins (`time`, `cameraPosition`) over hand-driven uniforms.
- **`useUniforms` takes VALUES, not nodes.** Passing a TSL node
  (`useUniforms({ tint: color('#f00') })`) throws `Uniform node not implemented` at
  shader-build time — a node cannot be the `.value` of another uniform. Pass the plain
  three object instead: `useUniforms({ tint: new Color('#f00') })`, which is what
  `UniformValue` already documents. Easy trap, and it fails late.
- **A uniform the FRAME LOOP owns must not be a `useUniforms` input.** `useUniforms`
  reconciles on every React re-render: it compares the declared input against the node's
  current `.value` and, when they differ, writes the declared value back
  (`reconcile: … if (!equals) existing.value = newVal`, verified in fiber's source). So a
  value your `useFrame` advances gets SNAPPED BACK the next time anything re-renders the
  component — dragging an unrelated leva slider resets it. For frame-driven state, create a
  plain three/tsl `uniform()` inside `useNodes` (create-once, never reconciled) and mutate
  `.value` in the loop. `useUniforms` is for values REACT owns; `uniform()` in `useNodes`
  is for values the frame loop owns (pattern: `tsl-vfx-linkedparticles`).
- `uniform(someObject.vector3)` wraps the LIVE object — mutate it in `useFrame` and
  the shader sees it, zero sync code (pattern: `lights-pointlights`).
- `useNodes` creators must return a FLAT record — nesting
  (`{ wgsl: {…}, tsl: {…} }`) fails against `TSLNodeLike`.
- `Loop(n, …)` yields `Node<'int'>`, which will not add to a `uint` index derived from
  `instanceIndex`. The object form `Loop({ start: 0, end: 4, type: 'uint' }, …)` fixes it
  without a cast; originals mix int/uint freely because untyped TSL lets them.
- A mesh whose `positionNode` relocates its geometry needs **`frustumCulled = false`**
  — three builds the culling sphere from CPU-side geometry, so the object pops out of
  view (pattern: `tsl-galaxy`; several upstream originals carry this latent bug).
- Chained `.mix` is `mixElement` — **the calling node is the FACTOR**
  (`speed.mix(a, b)` ≡ `mix(a, b, speed)`). Wrong order renders plausibly wrong
  colors and errors nothing.
- Fog: plain `<fog attach="fog" args={…} />` IS auto-wrapped into a fog node by the
  WebGPU renderer — **prefer it**. Only a custom TSL fog graph needs `scene.fogNode`
  (which needs a documented cast — `@types/three` doesn't declare it).
- Node materials are auto-extended: `<meshStandardNodeMaterial>` just works.

### Known typed-TSL gaps (cast, with a comment, and check UPSTREAM first)

- `Fn(([a, b]) => …)` params type as bare `ShaderNodeObject<Node>` — typed math may
  not resolve through them (B10).
- Duck-typed `*Node` fields: `scene.fogNode`, `scene.backgroundNode`,
  `light.colorNode` need casts. **Already typed (no cast)**: `backdropNode`,
  `backdropAlphaNode`, `mrtNode`, `castShadowNode`, `depthNode`, `emissiveNode`,
  `Texture3DNode.sample()/.normal()`. Check `@types/three` before reaching (B11).
- Struct storage (`instancedArray(data, Struct)`) has no typed overload; `.get(name)`
  returns bare `Node`.
- No integer `min`/`max`/`mod` in typed TSL — do it in float (exact below 2^24) and
  `uint()` where an index is needed.
- Typed-TSL creators don't infer: `instancedBufferAttribute<T>(…)`,
  `uniformArray<'vec3'>(…)`, `attribute<'vec3'>('offset')`. Passing the type as the second
  ARGUMENT (`attribute('offset', 'vec3')`) widens to `AttributeNode<string>` and loses the
  whole fluent surface — three still infers the real type from the geometry at runtime, so
  this is purely a types-side trap that compiles into something useless.
- `float()` is typed for scalars only, so the original's `float(someVec4Element)` — which
  `NodeBuilder.format()` resolves as `.x` — will not compile. Write `.x` at the call site;
  that is the fix, not a cast.
- **`useUniforms` output does NOT need `as unknown as Node<'float'>`.** fiber's
  `MappedUniforms<T>`/`UniformNodeFor<V>` infer a concrete node type per input
  (`number` -> `UniformNode<'float', number>`, a hex string -> `UniformNode<'color', Color>`),
  and `UniformNode<'float', number>` structurally satisfies `Node<'float'>` — chaining
  `.mul()`/`.mix()`/`Fn()` args works uncast. A comment claiming _"`UniformNode<T>` pins
  its TSL type param to `unknown`"_ propagated this cast to **87 sites**; it was false,
  and 64 of them were swept 2026-09-02. **Try removing the cast first.**
  After the sweep, the 23 surviving `as unknown as Node<…>` casts are a DIFFERENT family
  and are correct: struct member access (`duckElement.get('position')` types as bare
  `Node`), custom node classes (`new InstanceUniformNode()`), `cubeTexture()`, and one
  `select()` wanting `bool` — i.e. the B10/B11 gaps, not the uniform gap. They live in
  `compute-water/Water.tsx`, `compute-particles-rain/Rain.tsx`, `skinning-points`,
  `geometry/instance-uniform.tsx`, `tsl-vfx-tornado/Tornado.tsx`.
  Related: a `color`-typed uniform will not unify as a `vec3()` ARGUMENT. Dropping the
  `vec3()` wrapper beats casting — a color node already behaves like a vec3 downstream.
- `.assign()` is typed `Node | number` — a raw JS boolean fails; use `bool(true)`.
- **A field declared as a bare `Node` has no fluent surface.** `add`/`mul`/`addAssign`/
  `context` are declared on the typed extension interfaces, so they resolve for
  `Node<'vec3'>` but not for a plain `Node`. `LightingModelReflectedLight.directDiffuse`
  is a bare `Node`, so `reflectedLight.directDiffuse.addAssign(…)` — the canonical custom
  lighting line — needs a `Node<'vec3'>` cast, or use the standalone `context()` function
  instead of the chain method (`lights-custom`, UPSTREAM B35).
- **Never type anything as `ReturnType<typeof uniform>`** — `uniform` is overloaded
  and `ReturnType` resolves only the last overload, discarding what your call
  inferred. Write the concrete type.
- A shared `mrt()` across MORE THAN ONE target needs matching `texture.name`s on
  **every** target, or outputs are silently dropped into an empty struct (B22).

## Compute

Kernels are `Fn(() => …)().compute(count)` built once in `useNodes`; storage lives in
`useBuffers` (`instancedArray`) / `useGPUStorage` (`StorageTexture`). fiber has no
dispatch hook — dispatch via `renderer.compute()` at three cadences:

- **once** in a `useEffect` (safe: fiber awaits `renderer.init()` before children
  render; StrictMode double-runs it, so the kernel must be idempotent)
- **per frame** in `useFrame({ phase: 'update' })` — compute is not a render takeover,
  never `phase: 'render'`
- **on demand** from event handlers (pointer → `uniform(Vector3)` → dispatch)

## Post-processing

v10's `useRenderPipeline` (wraps `THREE.RenderPipeline`). NOT
`@react-three/postprocessing` (WebGL-only). Pipeline callbacks don't re-run on HMR or
on React re-render — **any dynamic value must flow through a uniform, never a
closed-over prop.** `renderPipeline` is non-null as of alpha.4 (no guard needed).

Four dynamism patterns. **The selection rule is what matters** — read the factory source
in `node_modules/three/examples/jsm/tsl/display/` and pick by what it actually does:

- **(a)** values you introduce → fiber `useUniforms`, no cast.
- **(b)** _default for node-class passes._ The pass keeps its knob in a public writable
  field holding a `uniform()` node (`bloom().strength`, `dotScreen().scale`,
  `dof().bokehScaleNode`) AND the field is float-typed → construct with defaults, then
  assign your `useUniforms` node onto the field inside the mainCB **before** shader
  compilation. Every node-class factory this corpus imports works this way.
  **Never pass your uniform as a factory _argument_.** Whether identity survives is
  inconsistent per factory and invisible at the call site: `bloom()` guards with
  `strength.isNode ? strength : uniform(strength)` and `dof()` uses `nodeObject()` (both
  preserve), but `dotScreen()`/`rgbShift()` call `uniform(angle)` unconditionally, which
  rewraps your node into a NEW uniform and silently drops every later write (B29).
  Construct with defaults, then assign onto the field — correct for all of them.
  **Precondition — WHEN the node reads the field.** (b) only works if the node reads
  `this.<field>` in `setup()` (at shader compile), like `BloomNode` does. A class that
  builds its graph in its CONSTRUCTOR has already captured the original uniform node by
  reference, and replacing the field afterwards changes nothing — `SkyMesh` assigns
  `material.colorNode` inside `constructor()`, closing over `this.turbidity`/`this.rayleigh`
  on the spot (`objects/SkyMesh.js`), and `WaterMesh` is the same shape. For those,
  **mutate `.value` in place** — the field swap fails silently, which is the worst
  failure mode there is. Check where the graph is built before choosing.

- **(c)** _fallback, three cases._ There is no instance to assign onto — an
  `Fn()`-style helper taking an options object (`depthAwareBlend`) — or the field is
  **int/uint** (`godrays().raymarchSteps` is `uniform(uint(60))`) and `useUniforms` can
  only produce `UniformNode<'float'>` for a JS number; or the graph was built in the
  constructor (above). → create three/tsl `uniform()`
  nodes inside the mainCB, pass them in, register via return-to-register, mutate
  `.value` in an effect.
- **(d)** _structural toggle._ A boolean that swaps the whole `outputNode` between two
  different node graphs (`enabled ? sobelPass : outputPass`) has no field to assign onto
  → register both from the mainCB, read them back off `passes` in an effect, set
  `outputNode` and `renderPipeline.needsUpdate = true`. That read-back needs
  `passes.xPass as ReturnType<typeof x> | undefined`. **Keep that cast** — it is exempt
  from House style rule 5: `useRenderPipeline` is non-generic and `PassRecord =
Record<string, any>`, so the cast ADDS type information to an `any` rather than hiding
  an error. There is no way to write it without one (UPSTREAM B30).

Verified against r185; re-verify the field types on a three bump.

**Not every pass knob is a uniform.** Some are BUILD-TIME constants whose setter rebakes
the material (`ssr().blurQuality`, `.binaryRefine`, `.stepExponent`; `ssgi().sliceCount`).
Assign a plain JS value in an effect — routing one through `useUniforms` is a type error,
not a silent failure, so this is cheap to get wrong and cheap to notice. Same treatment
for int/uint fields, which is why (c) exists.

`useRenderPipeline(mainCB, setupCB)` — setupCB is where MRT config goes
(`scenePass.setMRT(…)`). See `reference/react-three-fiber/docs/webgpu/render-pipeline.mdx`.

**`passes.scenePass` is `undefined` on the FIRST render** — the mainCB has not run yet.
Reading it in an effect without a guard throws `Cannot read properties of undefined`,
which surfaces as a readiness timeout rather than an obvious error. Pattern (d) always
needs the scene pass in an effect, so it always needs the guard
(`if (!renderPipeline || !scenePass) return;` — `postprocessing-smaa` is the model).

**MSAA**: fiber defaults to 4x and every `pass()` inherits `renderer.samples`. TRAA,
`ssaaPass`, and anything copying depth need single-sampled targets
(`passes.scenePass.options.samples = 0`, `pass(scene, camera, { samples: 0 })`) or
WebGPU throws a sample-count validation error. If the pass copies or samples depth,
set samples 0.

## React and the ecosystem

- drei is renderer-split: import **`@react-three/drei/webgpu`** (or `/core`); never the
  root or `/legacy` in WebGPU code.
- **Suspense**: alpha.4 no longer tears down the renderer root when a child suspends,
  so the old "every suspending subtree needs its own boundary, no exceptions" rule is
  **retired**. Gate where it buys something: an async `Environment` in front of
  custom-node materials still needs the lit scene gated on the HDR, or three 0.185.1
  intermittently never folds IBL in (B15; pattern `tsl-procedural-terrain`). Do NOT
  reflexively split boundaries — two independently-suspending resources in ONE boundary
  can be _protective_, because the boundary delays first render until both resolve
  (B28).
  **B15 also bites at scale, in a shape that looks unrelated**: `loader-materialx` renders
  28 independently-suspending samples, each in its own boundary, beside an `<Environment>`
  in a SEPARATE boundary. Some samples built their `MeshPhysicalNodeMaterial` graph before
  `scene.environment` existed and permanently baked in "no IBL" — rendering solid black,
  with no error. Fix: nest the per-item boundaries INSIDE the same outer `<Suspense>` as
  the `<Environment>`, so the environment gates first while each item still pops in
  individually. Many-small-boundaries is the risky shape, not just one.
- StrictMode double-invokes effects: never `dispose()` a `useMemo`'d instance in an
  effect cleanup. Use symmetric connect/disconnect (see `src/utils/CameraControls.tsx`).
- **Never mutate a Suspense-CACHED scene graph from `useMemo`.** `useGLTF`/`useLoader`
  results are shared across every consumer and survive unmount, so
  `source.visible = false` or `parent.add(mesh)` inside a `useMemo` leaks across
  StrictMode's mount → unmount → remount. Do it in a `useEffect` with a symmetric cleanup
  (detach, restore visibility).
  **The failure mode is silent**: `skinning-instancing-individual` rendered a black scene
  in dev and worked perfectly in a production build, because two transiently-coexisting
  compute-kernel/storage-buffer sets pointed at the same skeleton and the surviving
  mount's compute writes never reached the renderer — no thrown error, no console warning,
  and `getArrayBufferAsync` readback showed all zeros. If a compute example is black in
  dev but fine in `pnpm build`, look here first.
- Non-node instances captured by create-once hook closures (RenderTargets, cameras,
  override materials) must be identity-stable — hold them in lazy `useState(() => …)`,
  not `useMemo`. **But lazy `useState` is not enough for anything the GPU binds.**
  StrictMode double-invokes the initializer, and a create-once hook keeps the FIRST
  instance while the component commits the SECOND — they diverge silently. A
  `BufferAttribute`/`IndirectStorageBufferAttribute` held that way reaches the graph with
  no GPU buffer behind it and dies at dispatch
  (`dispatchWorkgroupsIndirect: parameter 1 is not of type 'GPUBuffer'`). Put those in
  `useBuffers`, which accepts a `BufferAttribute` and is create-if-not-exists like the
  rest (pattern: `compute-particles-fluid`). `useState` stays right for plain CPU-side
  objects the graph only reads through.
- **Some setup cannot move into an effect at all — it belongs in the renderer FACTORY.**
  `renderer` accepts `(defaultProps) => renderer`, and that is the only hook that runs
  before fiber builds anything. Anything the original does at renderer CONSTRUCTION and
  that something reads once, early, needs to stay at construction: `renderer.lighting =
new ClusteredLighting()` is the worked case — three caches the scene's lights node in a
  module-level WeakMap the first time a render list is built, so a late install is
  silently ignored (B41). **Measured ordering, which inverts the obvious guess: a Canvas
  child's `useLayoutEffect` runs BEFORE `onCreated`.** Neither is early enough here.
  Translating a construction-time concern into a React effect is the mistake; when a fix
  keeps failing with the identical error, probe the ordering rather than moving the call
  again (pattern: `lights-clustered`).
- **Imperative setup that must precede the first render goes in `useLayoutEffect`.**
  The WebGPU shader-graph build reads mesh state ONCE on the first RAF render and
  caches it (`morphReference()` caches `morphTargetInfluences` — `null` forever if
  unset then). Same for renderer flags the first render reads
  (`renderer.shadowMap.transmitted`).
- **A callback ref never triggers a re-render.** A component that must hand its mounted
  object to something else mirrors it into `useState` — or, simpler, pass the
  `useState` setter _as_ the ref: `<pointLight ref={setLight} />`.
- `useAnimations`: play clips **by name**, never `Object.values(actions)` — GLTFs ship
  rest/utility clips that pollute the blend at weight 1.
- `useGLTF` takes an **options object**: `useGLTF(url, { draco: true, meshopt: true,
ktx2: <transcoder path> })`. drei wires KTX2 itself (shared loader,
  `setTranscoderPath` from the string, automatic `detectSupport`). Positional booleans
  are deprecated. Pass the explicit transcoder path — the default resolves via
  `import.meta.url` and is unreliable under Vite.
- `useLoader(Loader, [urls])` takes N resources in one call and returns N results.
- Derived textures (clone/mutate of a loader result) must be `useMemo`'d off the
  loader's stable return.
- **`<Html transform distanceFactor={400}>` is the CSS3DRenderer scale** — drei's ratio
  is `(distanceFactor || 10) / 400`, so 400 makes 1 world unit = 1 CSS px, which is what
  every `css3d_*` original assumes. Without it the elements come out at 1/40 scale
  (pattern: `periodictable`, `molecules`).
- **drei's `<TransformControls>` draws NO gizmo on three ≥ r169, so drag cannot work.**
  `TransformControls` is a `Controls` now, not an `Object3D`; the arrows live in
  `controls.getHelper()`, which the original adds with `scene.add(…)` and drei never adds
  (zero `getHelper` calls in the `/webgpu` bundle — verified). Without it the picker
  meshes never get world matrices, so nothing is hit-testable. Until B46 lands:
  `ref={setGizmo}` + `{gizmo && <primitive object={gizmo.getHelper()} />}`, marked
  `TODO(drei-gap)` (pattern: `geometry-spline-editor`). Both test tiers pass without the
  gizmo — only a drag probe or a screenshot catches it.
- **Removing a prop resets it to literal `0` on any class whose constructor takes
  arguments** — which is every node material. fiber's `diffProps` restores a removed
  prop from the memoized prototype only when `constructor.length === 0`; otherwise
  `changedProps[prop] = 0` (verified, `diffProps`). So swapping
  `<meshStandardNodeMaterial color="red" />` for `<meshStandardNodeMaterial />` renders
  BLACK, and dropping `map` sets it to `0`. Key the element on the selection so it
  remounts instead of diffing (pattern: `modifier-subdivision`). B47.
- **Per-object `onPointerMissed` is NOT click-gated.** fiber fires it on every registered
  object that a pointer event did not hit whenever the event hit some other object with a
  handler — hover included. Only the Canvas-level `onPointerMissed` is gated to clicks
  within 2px. If you mean "clicked elsewhere", use the Canvas prop or check
  `event.type === 'click'`.
- **`@react-three/rapier` auto-colliders wrap EVERY descendant mesh.** `<RigidBody
colliders="cuboid">` around a chassis with child wheel meshes gives each wheel its own
  collider too — visible only in the `debug` view, and it passes both test tiers. Write
  `colliders={false}` and one explicit `<CuboidCollider>` (pattern:
  `rapier-vehicle-controller`). r3r 2.2 runs on fiber v10 alpha.4 unchanged; it bundles
  its own rapier WASM (0.19.2), so never import `@dimforge/rapier3d-compat` directly.
- **sRGB is auto-assigned only when a colour map is a PROP** (`<meshStandardNodeMaterial
map={tex} />` — fiber's `applyProps` checks `colorMaps.includes(key)`). A
  `<texture attach="map">` / `<canvasTexture attach="map">` CHILD goes through `attach`
  and skips it — the texture stays linear and renders washed out, with no error. Set
  `colorSpace={SRGBColorSpace}` on the child explicitly. Caught only by screenshot
  (`raycaster-texture`).
- **Hover that must update while the camera moves under a still cursor** needs fiber's
  per-frame re-raycast: `events={(store) => ({ ...createPointerEvents(store),
updateOnFrame: true })}` on the Canvas. Default events fire only on pointer movement
  (pattern: `interactive-cubes`).
- **`once()` with a multi-arg geometry method does not typecheck in the working form.**
  `once<T>(...args: T[]): T` — so `translate={once(0, 50, 0)}` (runtime-correct: the
  reconciler spreads `args` into `translate(x, y, z)`) types as `number` against
  `translate?: [x, y, z]`, while `once([0, 50, 0])` typechecks and calls
  `translate([0,50,0])` → NaN geometry (`computeBoundingSphere(): Computed radius is NaN`
  in smoke). Single-arg forms (`rotateX={once(x)}`) are fine. Until B42 lands, transform
  multi-arg geometry in a `useMemo` (pattern: `geometry-terrain-raycast`).
- **`<line>` is `<threeLine>` — and `<threeLine>` needs `import '../../assets/ThreeLine'`.**
  fiber omits `line`, `path`, `audio` and `source` from `ThreeElements` (they collide with
  SVG/DOM intrinsics) and re-adds the first as `threeLine`; `<line>` compiles as an SVG
  element and renders nothing. But in alpha.4 `createInstance` strips the `three` prefix
  and `commitUpdate` does not, so `<threeLine>` mounts fine and then throws
  `R3F: ThreeLine is not part of the THREE namespace` on the first re-render of any parent,
  unmounting the Canvas. Smoke and animates never re-render, so the tiers can't see it —
  a click did. The shim registers the prefixed name so both paths agree (B44). Delete the
  import when fiber fixes it.
- **`<points>` always draws 1px on WebGPU.** `PointsNodeMaterial.setupVertex` takes the
  plain path for any `isPoints` object — `size`/`sizeAttenuation` are ignored, and with
  `map` + `alphaTest` the points are discarded entirely, silently. Sized or textured
  points are `<sprite count={n}>` + `<pointsNodeMaterial positionNode={…}>` (pattern:
  `skinning-points`, `geometry-convex`).
- **`attach="material-0"` / `"material-1"` builds a material ARRAY** for multi-material
  geometry (a `TextGeometry` front/side pair) — fiber auto-creates the array. First use:
  `geometry-text`.
- **Acronym class names lowercase only the FIRST character**: `IESSpotLight` is
  `<iESSpotLight>`, not `<iesSpotLight>`.
- A light attached to the camera IS declarative:
  `<PerspectiveCamera makeDefault><pointLight …/></PerspectiveCamera>`.
- `object.layers` has no JSX prop — ref + `useLayoutEffect` is the standing pattern.
- **An addon with no `.d.ts` in `@types/three` does NOT typecheck.** This tsconfig has no
  `allowJs`, so TS never reads the addon's JSDoc; the import is `TS7016: Could not find a
declaration file`. (Verified — an earlier version of this bullet claimed the opposite and
  was wrong.) `@types/three` covers nearly every addon, so this is rare: r185's
  `meshopt_clusterizer.module.js` / `meshopt_simplifier.module.js` ship with no
  declarations while `meshopt_decoder` has them. A missing `.d.ts` is still not a reason to
  reach for `any` — write a scoped `declare module 'three/addons/…'` in `src/types/`
  declaring ONLY the surface you use, say in a comment that it is deletable when the types
  land, and ledger it in [docs/UPSTREAM.md](docs/UPSTREAM.md) (pattern:
  `src/types/meshopt.d.ts`). That is a different thing from the per-example JSX
  `declare module` block, which is still banned.
- Addon nodes configured at CONSTRUCTION (`TileShadowNode` tiles, `CSMShadowNode`
  cascades) need a node+helper rebuild when those change; everything else is a
  mutation + `updateFrustums()`. Their helpers need the first `.update()` skipped a
  frame, and `updateFrustums()` dereferences lazily-`_init()`ed state — guard it.
- `scene.overrideMaterial` pre-passes: the renderer transfers each object material's
  `positionNode` onto the override material, which is what makes GPU-displaced
  geometry participate in top-down height renders.
- No module-scope mutable state. One-time idempotent registration at module scope IS
  fine (`RectAreaLightNode.setLTC`, `extend({ SomeAddon })`). **Patching a three.js
  PROTOTYPE is not**, even though several originals do it at module scope: this gallery is
  one SPA, so the patch follows the user into every later example they navigate to.
  Install and remove it symmetrically in a `useLayoutEffect` on a small component inside
  the Canvas (pattern: `postprocessing-ssr-denoise`'s `<NoEnvSpecular />`, which zeroes
  `PhysicalLightingModel.prototype.indirectSpecular` so SSR supplies the specular instead).

---

# Repo format

## Files, routes, manifest

- Examples live in **category folders**: `src/examples/<category>/<slug>.tsx`, or
  `src/examples/<category>/<slug>/<slug>.tsx` when the example needs several files
  (entry filename must match the folder). Routes stay `/examples/<slug>` — the slug is
  globally unique and the category never appears in the URL.
- Categories (15): `animation` `camera` `compute` `geometry` `lights` `loaders`
  `materials` `postprocessing` `reflections` `render-targets` `scene` `shadows`
  `textures` `tsl` `volume`. Add one only if 3+ examples justify it.
- A slug may equal its category (`camera`, `postprocessing`). Those live at
  `src/examples/camera/camera/camera.tsx` and
  `src/examples/postprocessing/postprocessing.tsx` — the route is still
  `/examples/camera`.
- Split a file when it passes **~200 lines**, and split by scene role — the split
  itself is a taught pattern, not a size workaround.
- Slug = the original three.js name, kebab-case, with the `webgpu_`/`webgl_`/`misc_`/
  `physics_`/`css3d_`… prefix **always dropped**. `webgpu_skinning_instancing` →
  `skinning-instancing`. **When the bare name collides with a shipped slug, keep the
  original's prefix** — `css3d_sprites` → `css3d-sprites`, because `sprites` is
  `webgpu_sprites`. The route is the slug, so a collision is a broken example, not a
  warning.
- Register in [src/examples.json](src/examples.json):
  `{ slug, title, tags, original?, credits? }`. The shell renders the titleblock from
  this — **never build title/credits UI inside an example**.
- Shared JSX type augmentation for extended addons goes in
  [src/types/r3f.d.ts](src/types/r3f.d.ts); the `extend()` call goes in
  `src/assets/<Addon>.ts` and examples `import '../assets/<Addon>'`. Do NOT write a
  per-example `declare module` block.
- Reusable pieces drei lacks go in `src/utils/` with a doc comment naming the gap they
  fill (each is a candidate upstream brief).

## Example shape

- **The example owns its `<Canvas>`**; the scene is self-contained inside.
- `<DemoHelpers>` goes in every example (grid + CameraControls baseline, toggleable).
  It also carries the render-readiness signal, so include it even with everything
  visual off. Use its `controlsRef` escape hatch for imperative camera moves
  (`fitToBox`) — writing `camera.position` is futile, camera-controls overwrites it.
- Assets: hotlink jsdelivr pinned to the release —
  `https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/<path>`. No vendored
  binaries. **curl-check the URL** — the mirror doesn't carry every asset variant.
- **Executable JS from a CDN: only to shim an unshipped browser API, and only where
  the original does it too.** A library that is merely third-party goes in
  `package.json` and is imported normally — the CDN form is for polyfills whose whole
  reason to exist is that the platform hasn't shipped the feature yet, which makes
  installing them a lockfile entry we'd have to remove again later. Pin the exact
  version (upstream's import maps usually don't), keep the feature detect that gates
  it, and say so in the header. Sole instance: `materials-texture-html`
  (`three-html-render`, polyfilling WICG HTML-in-Canvas).
- **Verify dead or no-op code before porting it faithfully.** three.js examples are
  demo-quality: `volume_caustics` loads a texture it never assigns; `volume_lighting`
  calls `spotLight.lookAt()` every frame, which does nothing. Drop it and say so.

## Verification

Run for YOUR example only — `pnpm test:changed <slug>` (smoke + animates).

1. `npx tsc --noEmit && pnpm lint && pnpm build`
2. **animates tier** — two-frame pixel diff + dual-root capture, catches freezes the
   smoke console assertion can't see. Static-by-design examples declare
   `"static": true` in the manifest; long stop-go easings declare `"animationWindowMs"`.
3. **smoke tier** — readiness signal fires, canvas context is `webgpu`, canvas
   non-black, console clean.
4. **Screenshot**: `pnpm shot <slug>`. **Never hand-roll a screenshot script** —
   `scripts/contact-sheet.mjs` already handles `channel: 'chromium'` +
   `--enable-unsafe-webgpu` (plain `chromium.launch()` has no WebGPU on macOS and
   silently never reaches readiness), hiding leva, `localStorage.clear()` (leva
   persists control values across launches), a hard timeout, and an always-run
   `browser.close()`.
5. Look at the screenshot. Both test tiers passed `shadowmap-csm`'s tone-mapping bug;
   only the screenshot caught it.

**Multi-`<Canvas>`: `renderer.domElement` is the PRIMARY canvas.** In fiber's
multi-canvas mode every root shares one `WebGPURenderer`, whose `domElement` is fixed at
construction — so on a secondary canvas `state.renderer.domElement` resolves to the
primary's element, not its own. Anything that attaches DOM listeners (camera-controls,
custom pointer handling) needs an explicit per-canvas target; the shared
`src/utils/CameraControls.tsx` cannot be reused as-is there. Pattern: `scene/multiple-canvas`.

**Multi-`<Canvas>` examples are only partly covered.** `tests/smoke.spec.ts` and
`scripts/contact-sheet.mjs` both capture `locator('canvas').first()`, so a second root is
never asserted on or photographed. `camera-logarithmicdepthbuffer` is the first example
that genuinely needs two (`logarithmicDepthBuffer` is a construction-time renderer
parameter, so one canvas cannot show both sides). If you write another, say so in the
header and verify the second canvas by hand — the automated tiers will report green while
seeing half the demo.

**Full sweeps are wave-end only.** Running many heavy WebGPU examples in one process
produces contention flakes on a different example each run. Test scoped, one at a time
(`-g "<slug>"`). Local Metal is the oracle — land nothing not green here. An example
that verifiably cannot reach readiness on SwiftShader declares `"ciSkip": "<reason>"`.
CI runs smoke on PRs, nightly, and on demand — not every push.

Expected cold-start transients (first-ever run of an example with multi-MB assets or a
fresh shader build) — **one occurrence is not a bug, a recurrence is**:

- readiness timeout, then passes in ~1s thereafter
- `Destroyed texture [PMREM.cubeUv] used in a submit` (but see B28 — on `tsl-wood` this
  RECURS and is a known flake)
- one-time `R3F.createRoot should only be called once!` on a heavy example

## Environment gotchas

Every patch/override/pin is ledgered in [docs/UPSTREAM.md](docs/UPSTREAM.md) (Part A:
what + unwind condition; Part B: agent-ready upstream fix briefs). **House rule: any
new patch, pin, or override lands with an UPSTREAM.md entry in the same commit.**

- **After ANY dependency bump, kill the dev server and `rm -rf node_modules/.vite`.**
  Vite keeps serving the previously pre-bundled dep. **Kill the server FIRST** — wiping
  the cache underneath a running server puts it into exactly the broken state you were
  trying to fix, serving `504 (Outdated Optimize Dep)` for every dynamic import. The
  smoke tests run against that server, so this presents as a batch of unrelated examples
  failing readiness. A sweep that suddenly takes 10x longer is the tell that the
  environment is broken, not the code — re-run one example scoped before believing it. The drei alpha.5→.6 bump presented
  as two phantom runtime errors against source that was already correct.
- fiber `.` vs `./webgpu` are two builds of one runtime — the regex alias in
  [vite.config.ts](vite.config.ts) forces one; keep it.
- `optimizeDeps.entries` scopes Vite's dep scanner away from `reference/**/*.html`;
  don't remove.
- The `reference/three.js` clone is NEWER than npm `three@0.185.1` — an addon the
  original imports may not exist in `node_modules`. Check before importing; if missing,
  inline it with attribution (pattern: `backdrop-water/voronoiNoise.ts`). Never import
  from the gitignored clone.
- Mirror image: installed `@types/three` can be NEWER than the npm runtime for jsm
  addons. When a typed surface rejects the original's exact arguments, check the
  runtime source, not just the types. It also goes the other way — the types can declare
  exports the runtime doesn't HAVE: `CurveModifierGPU.d.ts` declares `initSplineTexture`,
  `updateSplineTexture`, `getUniforms` and `modifyShader`, and the shipped `.js` exports
  only `Flow`. That one typechecks and dies at import.

## Changelog

- **2026-09-02 — v1.2, amended by porting wave 3** (the last 31 examples; corpus 168 → 198).
  Three rules here were **wrong**, not merely incomplete, and each had already cost an agent:
  (1) _"addons with no `.d.ts` still typecheck, TS infers from JSDoc"_ — there is no
  `allowJs`, so it is `TS7016`; verified by probe. (2) _"hold non-node instances in lazy
  `useState`"_ — safe for CPU-side objects, **not** for anything the GPU binds: StrictMode
  double-invokes the initializer and a create-once hook keeps the first instance while the
  component commits the second; use `useBuffers`. (3) `useUniforms` **reconciles on every
  React re-render** and writes the declared value back over whatever the frame loop wrote,
  so frame-driven uniforms must be plain `uniform()` inside `useNodes` (verified in fiber's
  source). Added: `<line>` is `<threeLine>`; `passes.scenePass` is `undefined` on the first
  render; not every pass knob is a uniform (build-time constants rebake the material);
  prototype patching is module-scope mutable state and leaks across the SPA; scoped stores
  are PRIMARY-canvas scoped; leva write-back via the function form; rule 5 does not invert
  for node values you produce; `@types/three` can declare exports the runtime lacks.
  New UPSTREAM briefs **B36–B39**. New tooling: `pnpm compare` gained a chars metric after
  two ports read as bloated by line and lean by content, plus `pnpm shot:original`.
- **2026-09-02 — § Repo format gained the runtime-CDN-JS rule.** `materials-texture-html`
  loads the HTML-in-Canvas polyfill from jsdelivr, which the assets rule (about _data_
  pinned to the three.js release) did not cover. Decided (Dennis): the API is a WICG
  proposal shipping nowhere stable, so **match the original** rather than adding a 0.1.x
  shim to the lockfile; an ordinary third-party library still gets installed normally.
- **2026-09-01 — v1.1, amended by the `postprocessing` restyle pilot.** 17 examples
  restyled against v1.0; the doc changed where the pilot proved it wrong.
  **§ Post-processing: three dynamism patterns → four, and the SELECTION RULE is now
  stated** — that omission was the pilot's single biggest source of agent guessing.
  `dof()` was **misfiled** under (c): it exposes public writable `*Node` fields like
  every other node-class factory, so (b) is the default and (c) narrows to two verified
  cases — `Fn()` helpers with no instance to assign onto (`depthAwareBlend`), and
  int/uint fields `useUniforms` cannot produce (`godrays().raymarchSteps`). B29's wording
  corrected: what freezes a knob is passing a **raw number**, not passing a uniform.
  Added **(d) structural toggle** with an explicit carve-out from rule 5 — its read-back
  cast is forced by `PassRecord = Record<string, any>` and is not a bug report (B30).
  **Rule 1** gained the two-sibling-consumer case and the colocation→B18 hazard (found as
  a live bug in `postprocessing-ao`). **Rule 7** now says markers are file-level.
  Pilot result: 2641 → 2395 code lines (−9.3%), 131/131 smoke, 130 animates + 1 skipped.
  **Rule 3 amended** (Dennis, same day): performance wins over declarative when an
  instance is genuinely shared by many meshes — but it is a smell, so it ships with a
  `REVIEW(shared-instance):` comment naming what the reviewer should weigh. Introduced
  `REVIEW(<topic>):` as the repo's flag-for-human marker.
- **2026-09-01 — v1.0, full rewrite.** Rebuilt against fiber alpha.4 + drei alpha.6 and
  Dennis's style review of the first 16 hand-tuned examples. Added the **House style**
  section as the primary contract. **Retired** the alpha.3-era rules alpha.4 fixed: the
  `useThree` renderer cast (B9), the WGSL no-hyphen scope rule (B12), the scoped-store
  ban (B16), the blanket "every suspending subtree needs its own Suspense" rule (B17),
  and the `useRenderPipeline` null guard. **Inverted** the controls rule — controls now
  live with their consumer, not the page root (the old rule was the direct cause of
  corpus-wide prop drilling). Header schema slimmed and DIVERGENCE made optional. Added
  folder categories, import hierarchy, ref naming, and the derive-types-from-elements
  rule. Pre-v1.0 changelog (v0.1–v0.27) is in git history.
