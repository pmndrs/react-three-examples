# [DUPLICATE — DO NOT FILE] drei: `<Hud>` renders the default scene twice per frame on v10 (already tracked as pmndrs/drei#2820)

**Versions**: `@react-three/drei@11.0.0-alpha.7`, `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

**This brief is already filed upstream, nearly verbatim, as
[pmndrs/drei#2820](https://github.com/pmndrs/drei/issues/2820) ("[v11] Verify Hud: double render
and autoClear juggling on WebGPU"), opened 2026-09-02 by maintainer `DennisSmolek`, OPEN, part of a
"WebGPU Correctness" milestone. Do not file a second issue — this draft is kept only as a record of
this repo's independent confirmation, and to hand to that existing issue thread if useful.**

## Repro

```tsx
import { Canvas } from '@react-three/fiber/webgpu';
import { Hud, PerspectiveCamera } from '@react-three/drei/webgpu';

export default function App() {
  return (
    <Canvas renderer={{}}>
      <mesh>
        <boxGeometry />
        <meshStandardNodeMaterial color="orange" />
      </mesh>
      <Hud>
        <PerspectiveCamera makeDefault position={[0, 0, 5]} />
        <mesh>
          <planeGeometry args={[1, 1]} />
          <meshBasicNodeMaterial color="white" />
        </mesh>
      </Hud>
    </Canvas>
  );
}
```

## Observed vs Expected

- **Observed**: the main (default) scene draws once via fiber's own automatic per-frame render,
  and then AGAIN inside `RenderHud`'s `useFrame` callback (when `renderPriority === 1`, the
  default) — two full renders of the default scene per frame, before the Hud scene is layered on
  top.
- **Expected**: exactly one render of the default scene per frame, then the Hud scene composited
  on top.

## Root cause

`RenderHud` assumes fiber v9's behavior, where giving a `useFrame` callback a nonzero numeric
priority disables fiber's own internal auto-render for that root. fiber v10 (alpha.4) replaced
priorities with a phase-based scheduler; **only `phase: 'render'` takes over rendering** — a
`priority` option alone (now considered a v9-ism, and fiber even emits a runtime deprecation
warning naming `phase: "render"` as the replacement — `node_modules/@react-three/fiber/dist/webgpu/index.mjs:1178`)
no longer disables auto-render.

- `node_modules/@react-three/drei/webgpu/index.mjs:2910-2927` (packaged `/webgpu` build):
  ```js
  function RenderHud({ defaultScene, defaultCamera, renderPriority = 1 }) {
    const { renderer, scene, camera } = useThree();
    let oldCLear;
    useFrame(
      () => {
        oldCLear = renderer.autoClear;
        if (renderPriority === 1) {
          renderer.autoClear = true;
          renderer.render(defaultScene, defaultCamera);
        }
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(scene, camera);
        renderer.autoClear = oldCLear;
      },
      { after: 'render', priority: renderPriority },
    );
    return React.createElement('group', { onPointerOver: () => null });
  }
  ```
  `{ after: "render", priority: renderPriority }` is not `{ phase: "render" }`, so fiber's own
  auto-render still fires, and this callback's own `renderer.render(defaultScene, defaultCamera)`
  (gated on the DEFAULT `renderPriority === 1`) draws the same scene a second time.

Confirmed byte-identical between drei alpha.6 and alpha.7 — this is not something the bump changed.

## Proposed fix

Per the fiber-recommended replacement, `RenderHud` should register its render-takeover with
`{ phase: 'render' }` (which suppresses fiber's auto-render for that root) and do exactly one
`renderer.render(defaultScene, defaultCamera)` + Hud composite pass, instead of relying on the
retired priority-disables-autorender behavior.

## Workaround

None applied in this repo yet; `geometry-colors-lookuptable.tsx` uses `<Hud>` for its legend and
currently pays the double-render cost silently (no visible artifact for that particular scene, but
it is real wasted GPU work, and could show as z-fighting/flicker artifacts on a scene sensitive to
being drawn twice).

## Prior art

- **pmndrs/drei#2820** (open) — the near-exact upstream report of this bug, filed by a maintainer,
  citing the identical code path and the identical WebGPU `render()` init-gate concern
  (`Renderer.js:1362` throws if called before the backend initializes, unlike WebGL). Also links
  **pmndrs/drei#2402** ("GizmoHelper Hud Takes over RenderLoop Breaking Postprocessing
  w/EffectComposer (Legacy)") as the WebGL-side twin of this same double-render bug class.
