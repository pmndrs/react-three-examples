# drei: `useEnvironment`/`Environment` routes ANY 6-file array straight to `CubeTextureLoader`, so 6-face Radiance `.hdr` cube sets can't load

**Versions**: `@react-three/drei@11.0.0-alpha.7`, `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

## Repro

```tsx
import { Canvas } from '@react-three/fiber/webgpu';
import { Environment } from '@react-three/drei/webgpu';

// Six faces of an HDR (Radiance .hdr) cubemap set — NOT six .jpg/.png cube faces.
const HDR_CUBE_FACES = ['px.hdr', 'nx.hdr', 'py.hdr', 'ny.hdr', 'pz.hdr', 'nz.hdr'].map((f) => `/cube/${f}`);

export default function App() {
  return (
    <Canvas renderer={{}}>
      <Environment files={HDR_CUBE_FACES} background />
      <mesh>
        <sphereGeometry />
        <meshStandardNodeMaterial roughness={0} metalness={1} />
      </mesh>
    </Canvas>
  );
}
```

## Observed vs Expected

- **Observed**: `getExtension()` computes `isCubemap = isArray(files) && files.length === 6`
  **before** ever inspecting the individual filenames, so any 6-entry array — regardless of whether
  the files are `.jpg`, `.png`, or `.hdr` — is unconditionally assigned `extension: "cube"` and
  routed to `CubeTextureLoader`. `CubeTextureLoader` decodes standard 8-bit image formats; it does
  not know how to parse Radiance `.hdr` data, so a 6-face `.hdr` cubemap either errors or silently
  produces garbage/black faces.
- **Expected**: for a 6-file array, sniff each entry's own extension (as already happens for the
  single-file branches) and choose `HDRCubeTextureLoader`-equivalent handling when the faces are
  `.hdr`, falling back to `CubeTextureLoader` only for standard image cube faces.

## Root cause

- `node_modules/@react-three/drei/webgpu/index.mjs:10138-10146` (packaged `/webgpu` build):
  ```js
  function getExtension(files) {
    const isCubemap = isArray(files) && files.length === 6;
    const isGainmap = isArray(files) && files.length === 3 && files.some((file) => file.endsWith("json"));
    const firstEntry = isArray(files) ? files[0] : files;
    const extension = isCubemap ? "cube" : isGainmap ? "webp" : /* ...per-extension sniff... */;
    return { extension, isCubemap, isGainmap };
  }
  function getLoader(extension) {
    const loader = extension === "cube" ? CubeTextureLoader : extension === "hdr" ? RGBELoader : /* ... */;
    return loader;
  }
  ```
  The `isCubemap` check short-circuits before `firstEntry`'s own extension is ever consulted, so a
  6-entry `.hdr` array can never reach the `"hdr"` branch.

Unchanged between alpha.6 and alpha.7 — identical logic in both packaged builds.

**Fiber's half (for completeness, as requested)**: `@react-three/fiber`'s `/webgpu` build carries
what looks like the same `getExtension`/`getLoader` pair, used for the Canvas `background` prop's
own loader selection:

- `node_modules/@react-three/fiber/dist/webgpu/index.mjs:1637` —
  `const isCubemap = isArray(files) && files.length === 6;` (same short-circuit-before-sniff shape).
- `node_modules/@react-three/fiber/dist/webgpu/index.mjs:1644` —
  `const loader = extension === "cube" ? CubeTextureLoader : extension === "hdr" ? HDRLoader : extension === "exr" ? EXRLoader : extension === "jpg" || extension === "jpeg" ? UltraHDRLoader : ...`
  Notably fiber's copy uses three's own `UltraHDRLoader` for the `jpg`/`jpeg` branch, where drei's
  copy (see the separate B13 finding) uses `@monogrid/gainmap-js`'s `HDRJPGLoader` instead — the two
  packages independently reimplemented very similar `getExtension`/`getLoader` logic and diverged on
  which JPEG-gainmap library to use, while both still have the identical 6-file-cubemap gap. `three`
  wasn't part of this bump (fiber is pinned at alpha.4 in this repo), so this half is unaffected by
  the drei alpha.6→alpha.7 bump too.

## Proposed fix

In `getExtension`, only fall back to `isCubemap`/`"cube"` after checking whether `firstEntry` (or
all entries) end in `.hdr`/`.exr`; when they do, load each face with the matching per-face loader
(three has no single "HDRCubeTextureLoader" export in this version, so this likely means loading
each face with `RGBELoader` and assembling a `CubeTexture` manually, or wiring
`HDRCubeTextureLoader` if/when three ships one).

## Workaround

None found in this repo yet (no example currently needs a 6-face `.hdr` cubemap) — noting for
completeness per the brief.

## Prior art

No matching open issue/PR found on `pmndrs/drei` (`useEnvironment cube`, `cubemap hdr`) or
`pmndrs/react-three-fiber` (`background cubemap hdr`).
