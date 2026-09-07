# drei: the `/webgpu` build still reads the deprecated `state.gl` alias in 32 places (was 33 on alpha.6 — one migrated)

**Versions**: `@react-three/drei@11.0.0-alpha.7`, `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

## Repro

Not a runtime repro — this is a forward-compatibility / code-health finding from source
inspection.

```bash
grep -c "state\.gl\b" node_modules/@react-three/drei/webgpu/index.mjs   # 32 on alpha.7 (was 33 on alpha.6)
grep -c "state\.renderer\b" node_modules/@react-three/drei/webgpu/index.mjs  # 24 on alpha.7 (was 23 on alpha.6)
```

## Observed vs Expected

- **Observed**: 32 call sites in the packaged `/webgpu` bundle read `state.gl` (via `useThree((s) =>
s.gl)` or destructuring `{ gl }` from `useThree()`) — controls' `domElement` resolution,
  `PointerLockControls`, FBO helpers, `Hud`'s `RenderHud`, etc. `fiber` v10's `state.gl` is
  documented (in this repo's own `AGENTS.md`) as a **deprecated alias** of `state.renderer`,
  kept only for backward compatibility.
- **Expected**: `/webgpu`-targeted code should read `state.renderer` (the non-deprecated,
  `/webgpu`-typed field) exclusively, so that removing the `gl` alias in a future fiber major does
  not silently break every one of these call sites.

## Root cause

Packaged `/webgpu` build output at `node_modules/@react-three/drei/webgpu/index.mjs`; representative
sites (grep -n "state\.gl\b" for exact hits):

- Various `const gl = useThree((state) => state.gl);` (e.g. lines 232, 512, 934 in the alpha.7
  build) feeding controls' DOM-element resolution.
- `state.gl.setRenderTarget(...)`, `state.gl.render(...)` sequences inside FBO/render-to-texture
  helpers (e.g. around line 2507-2514).

## What changed between alpha.6 and alpha.7

The brief this audit re-verifies claimed **33** occurrences. That number matches alpha.6 EXACTLY
(`grep -c "state\.gl\b"` on the alpha.6 tarball also returns 33). On alpha.7 the count dropped to
**32**, and `state.renderer` occurrences rose from 23 to 24 in the same file — i.e., exactly one
call site was migrated from the deprecated `state.gl` alias to `state.renderer` between the two
releases. This is a real, if tiny, sign of an in-progress migration rather than a stale count — but
32 of 33 (97%) of the original surface remains on the deprecated alias.

## Proposed fix

Bulk-replace remaining `state.gl` / `{ gl }` reads with `state.renderer` / `{ renderer }` across the
`/webgpu` source tree (the `/core` and legacy builds presumably should keep `gl`, since that's the
correct, non-deprecated field there). A search-and-verify pass (each site needs to confirm
`renderer` has the same members being used off `gl` — e.g. `.domElement`, `.setRenderTarget`,
`.render` are common to both APIs, but not every WebGL-only `gl.*` method has a `renderer.*`
equivalent) would be the safe way to do this incrementally, matching the one site alpha.7 already
converted.

## Workaround

None needed today (the alias still works); this is purely a forward-compatibility flag for when
fiber eventually removes the `gl` alias.

## Prior art

No matching open issue/PR found on `pmndrs/drei` (`state.gl deprecated`, `gl deprecated renderer`).
