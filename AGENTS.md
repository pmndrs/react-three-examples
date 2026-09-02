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

## Commands

- Package manager: **pnpm only**
- `pnpm dev` — Vite dev server, port 5173
- `npx tsc --noEmit` / `pnpm lint` / `pnpm build` — typecheck / lint / build
- `pnpm test:changed <slug>` — smoke + animates for one example
- `pnpm shot <slug>` — screenshot to `screenshots/`

Definition of done: typechecks, lints, builds, renders on WebGPU (real `webgpu`
canvas context, console clean), registered in the manifest, header block present.

## Stack pins (Sept 2026 — alpha era, versions matter)

- `@react-three/fiber` **10.0.0-alpha.4** (npm) · `@react-three/drei`
  **11.0.0-alpha.6** (npm) · `three` **0.185.1** · React 19.2 (fiber peer is
  `>=19.0 <19.3`)
- `leva`, `camera-controls` v3, react-router **7** (pinned `version-7` dist-tag; npm
  latest is v8 — do not bump), TypeScript strict, Tailwind v4, single flat tsconfig
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
  const { color, roughness, ...waveValues } = useControls('Raging Sea', seaControls)
  const uniforms = useUniforms(waveValues)
  const matNodes = useNodes(() => makeSeaNodes(uniforms))
  return (
    <mesh>
      <TerrainGeometry />
      <meshStandardNodeMaterial color={color} {...matNodes} />
    </mesh>
  )
}

// BAD — controls at the page root, values drilled down as props
```

The only hard constraint: **fiber hooks (`useUniforms`, `useNodes`, `useFrame`,
`useThree`, …) must be inside `<Canvas>`.** Outside it you get
`R3F: Hooks can only be used within the Canvas component!` at runtime. So the
consuming component is a Canvas child — that is where the controls go too.

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
}))

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
const woodMaterial = useMemo(() => new MeshStandardMaterial({ color: '#8b5a2b' }), [])
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
  Pick<ThreeElements['meshPhongNodeMaterial'], 'shininess' | 'specularNode' | 'normalNode'>
```

Real node classes (`LightsNode`, `TextureNode`, `NormalMapNode`) do **not** satisfy a
guessed `Node<'vec3'>`; guessing is what forces casts into examples.

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
const localRef = useRef<PointLight>(null)
const lightRef = ref ?? localRef
```

Type the exposed prop `React.RefObject<T | null>`, not `React.Ref<T>` — `React.Ref`
admits callback refs, which have no `.current` to read.

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
- **Build-time vs run-time**: JS `if`/`for` in a node builder runs ONCE at graph build.
  Use TSL `If()`/`Loop()`/`select()` for anything that must react to a uniform.
- TSL helpers that internally `.toVar()`/`.assign()` (`RaymarchingBox` et al.) need an
  active stack — call them inside `Fn()`. The originals' `Fn` wrappers are
  load-bearing. Fails only at runtime (`No stack defined for assign operation`).
- `useNodes`' returned wrapper has a fresh identity every render (members are
  store-stable, the spread isn't) — key downstream `useMemo`s on individual nodes.
- Prefer TSL built-ins (`time`, `cameraPosition`) over hand-driven uniforms.
- `uniform(someObject.vector3)` wraps the LIVE object — mutate it in `useFrame` and
  the shader sees it, zero sync code (pattern: `lights-pointlights`).
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
  `uniformArray<'vec3'>(…)`.
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

`useRenderPipeline(mainCB, setupCB)` — setupCB is where MRT config goes
(`scenePass.setMRT(…)`). See `reference/react-three-fiber/docs/webgpu/render-pipeline.mdx`.

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
- StrictMode double-invokes effects: never `dispose()` a `useMemo`'d instance in an
  effect cleanup. Use symmetric connect/disconnect (see `src/utils/CameraControls.tsx`).
- Non-node instances captured by create-once hook closures (RenderTargets, cameras,
  override materials) must be identity-stable — hold them in lazy `useState(() => …)`,
  not `useMemo`.
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
- **Acronym class names lowercase only the FIRST character**: `IESSpotLight` is
  `<iESSpotLight>`, not `<iesSpotLight>`.
- A light attached to the camera IS declarative:
  `<PerspectiveCamera makeDefault><pointLight …/></PerspectiveCamera>`.
- `object.layers` has no JSX prop — ref + `useLayoutEffect` is the standing pattern.
- Addons shipped as `.js` with no `.d.ts` still typecheck (TS infers from JSDoc). A
  missing `.d.ts` is not a reason to reach for `any`.
- Addon nodes configured at CONSTRUCTION (`TileShadowNode` tiles, `CSMShadowNode`
  cascades) need a node+helper rebuild when those change; everything else is a
  mutation + `updateFrustums()`. Their helpers need the first `.update()` skipped a
  frame, and `updateFrustums()` dereferences lazily-`_init()`ed state — guard it.
- `scene.overrideMaterial` pre-passes: the renderer transfers each object material's
  `positionNode` onto the override material, which is what makes GPU-displaced
  geometry participate in top-down height renders.
- No module-scope mutable state. One-time idempotent registration at module scope IS
  fine (`RectAreaLightNode.setLTC`, `extend({ SomeAddon })`).

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
- Slug = the original three.js name, kebab-case, with the `webgpu_`/`webgl_` prefix
  **always dropped**. `webgpu_skinning_instancing` → `skinning-instancing`.
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
  runtime source, not just the types.

## Changelog

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
