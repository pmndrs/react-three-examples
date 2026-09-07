# `useTexture`'s `onLoad` receives the raw positional array, not the keyed record, for Record-shaped input

**Versions**: `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

## Minimal reproduction

```tsx
import { useTexture } from '@react-three/drei/webgpu';

function Material() {
  const textures = useTexture({ diffuse: '/diffuse.jpg', normal: '/normal.jpg' }, (loaded) => {
    // Declared type: MappedTextureType<Url> — a KEYED record, e.g.
    //   { diffuse: Texture, normal: Texture }
    // Actual runtime value: a positional ARRAY,
    //   [Texture, Texture] — `loaded.diffuse` is undefined at runtime.
    console.log(loaded.diffuse); // undefined, despite typing fine
  });
  return null;
}
```

(`useTexture` here is drei's wrapper, but the bug is in fiber's `useTexture`
underneath, which drei's `/webgpu` build re-exports/wraps.)

## Observed vs expected

- **Observed**: for a Record input, `onLoad` fires as `onLoadRef.current?.(loadedTextures)`
  where `loadedTextures` is the direct, unmodified result of
  `useLoader(TextureLoader, Object.values(stableInput))` — i.e. a plain array in
  `Object.values()` order, not keyed by the original input's property names.
- **Expected**: `onLoad` should receive the same keyed record shape that
  `useTexture`'s own return value uses (`MappedTextureType<Url>`) — consistent with
  its declared TypeScript type.

## Root cause

Packaged output at `node_modules/@react-three/fiber/dist/webgpu/index.mjs:1329-1355`:

```js
function useTexture(input, optionsOrOnLoad) {
  // ...
  const loadedTextures = useLoader(TextureLoader, IsObject(stableInput) ? Object.values(stableInput) : stableInput);
  useLayoutEffect(() => {
    if (cachedResult) return;
    if (onLoadCalledForRef.current === inputKey) return;
    onLoadCalledForRef.current = inputKey;
    onLoadRef.current?.(loadedTextures); // <-- raw array, line 1354
  }, [cachedResult, loadedTextures, inputKey]);
  // ...
  const mappedTextures = useMemo(() => {
    // <-- keyed record built HERE, line 1374
    if (cachedResult) return cachedResult;
    if (IsObject(stableInput)) {
      const keyed = {};
      const textureArray = loadedTextures;
      let i = 0;
      for (const key in stableInput) keyed[key] = textureArray[i++];
      return keyed;
    } else {
      return loadedTextures;
    }
  }, [stableInput, loadedTextures, cachedResult]);
  // ...
  return mappedTextures; // the hook's own RETURN value is correctly keyed
}
```

The `useLayoutEffect` that invokes `onLoad` runs BEFORE `mappedTextures` is computed
(it depends only on `loadedTextures`, the raw loader output), and it passes
`loadedTextures` — not `mappedTextures` — straight to the callback. The hook's own
return value is correct; only the `onLoad` callback argument is wrong.

This is a distinct bug from the CLOSED **#3849** ("useTexture with an array/record
argument loops forever") — that was an infinite `setState` loop in the same function,
fixed by commit `d5d52297` ("stop useTexture's array/record forms looping forever").
The onLoad-shape bug described here survives that fix; the two are in the same
function but are separate defects.

## Proposed fix

Compute `mappedTextures` (or an equivalent keyed view) before invoking `onLoad`, and
pass that instead of the raw `loadedTextures` array when `stableInput` is
Record-shaped.

## Workaround

None in this repo currently (no example destructures `onLoad`'s argument by key for a
Record input) — this is a documentation-vs-runtime mismatch that would surface as soon
as a Record-shaped `useTexture` call's `onLoad` tries to key into its argument.

## Prior art

No matching issue found via `gh search issues` for "useTexture onLoad". #3849 covers a
different bug in the same function (infinite loop, already closed/fixed) and does not
address this onLoad-shape mismatch.
