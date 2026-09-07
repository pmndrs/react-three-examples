# drei: `/webgpu` `Grid`'s line antialiasing uses `fwidth()`, which is a coarse per-quad derivative on WGSL/Metal

**Versions**: `@react-three/drei@11.0.0-alpha.7`, `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

## Repro

```tsx
import { Canvas } from '@react-three/fiber/webgpu';
import { Grid } from '@react-three/drei/webgpu';

export default function App() {
  return (
    <Canvas renderer={{}} camera={{ position: [5, 5, 5] }}>
      <Grid args={[10, 10]} cellSize={0.5} cellThickness={0.5} sectionSize={3} sectionThickness={1} fadeDistance={30} />
    </Canvas>
  );
}
```

Orbit the camera slowly, or let it drift under `<CameraControls autoRotate>` — the thin cell/section
lines shimmer/crawl noticeably more than the same `Grid` on the WebGL renderer, most visible on
Metal.

## Observed vs Expected

- **Observed**: thin grid lines shimmer under camera movement on WebGPU/Metal.
- **Expected**: antialiasing quality comparable to the WebGL `Grid` (which used GLSL's per-fragment
  `fwidth`).

## Root cause

`Grid`'s line coverage function divides by `fwidth()` of the local-space coordinate to get an
analytic-AA line width:

- `node_modules/@react-three/drei/webgpu/index.mjs:11825` (packaged `/webgpu` build; corresponds to
  drei's TSL port of `Grid`'s `getGrid` helper):
  ```js
  const getGrid = Fn((inputs) => {
    const [localPosition, size, thickness] = inputs;
    const r = vec2$2(localPosition.x, localPosition.z).div(size);
    const grid = abs(fract(r.sub(0.5)).sub(0.5)).div(fwidth(r));
    const line = min(grid.x, grid.y).add(float(1).sub(thickness));
    return float(1).sub(min(line, float(1)));
  });
  ```

WGSL's `fwidth`/`dpdx`/`dpdy` are defined as **coarse** derivatives by default (computed once per
2x2 pixel quad, not per-pixel) unless a backend explicitly requests fine derivatives, and Metal's
MSL backend (what `three/webgpu`'s WGSL output compiles to via WebGPU on macOS) is a well-known
case where this coarseness is visually worse than desktop GL's typical fine-derivative behavior.
That mismatch is exactly what produces extra shimmer on thin analytic-AA lines that depend on
`fwidth` being a good local slope estimate.

This is unchanged between drei `11.0.0-alpha.6` and `11.0.0-alpha.7` — byte-identical
`getGrid`/`fwidth` usage in both packaged builds — so the alpha.6→alpha.7 bump has no bearing on
this one.

## Proposed fix

Options used elsewhere for exactly this class of problem: widen the line by a fixed small margin
that tolerates coarse derivatives, blend using `screenCoordinate`-based pixel width instead of
`fwidth`, or accept a slightly thicker default `cellThickness`/`sectionThickness` on WebGPU. Any
fix needs a visual A/B against the WebGL `Grid` on the same hardware to confirm it actually
resolves the shimmer without over-thickening lines on WebGL.

## Workaround

None applied in this repo — the example ports the original `Grid` usage as-is and treats the
shimmer as a known, cosmetic WebGPU/Metal artifact, not something blocking the port.

## Prior art

No matching open issue or PR found on `pmndrs/drei` after several keyword searches (`Grid fwidth`,
`Grid shimmer`, `Grid line antialiasing`, `Grid webgpu`). This is a rendering-quality nuance that is
hard to surface via text search; recommend filing with a captured screenshot/video comparison
(WebGL vs WebGPU, same camera path) since the bug is otherwise very easy for a maintainer to
dismiss as "looks fine to me" from source alone.
