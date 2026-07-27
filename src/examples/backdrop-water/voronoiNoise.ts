// Inlined from three.js's own `examples/jsm/tsl/math/voronoiNoise.js` addon.
//
// GAP 1: the original example (`webgpu_backdrop_water.html`) imports
// `voronoi2d`/`voronoi3d` from `three/addons/tsl/math/voronoiNoise.js`, but that file
// is NOT present in the npm `three@0.185.1` package's `examples/jsm/tsl/math/`
// (verified: only `Bayer.js`/`curlNoise.js` ship there) even though it exists in this
// repo's `reference/three.js` sparse clone (a slightly newer snapshot on the same
// release line). Rather than reach into `reference/` at runtime (gitignored, not part
// of the installed package), the two Fn() graphs are reproduced here — pure TSL built
// from `three/tsl` primitives, no addon-internal APIs involved.
// Source: reference/three.js/examples/jsm/tsl/math/voronoiNoise.js
//
// GAP 2 (`@types/three` strict-tsc gap, same family as UPSTREAM.md B10):
// - `Fn()`'s abbreviated-layout 3rd argument (`{ p: 'vec2', return: 'vec2' }` in the
//   source addon) doesn't resolve against any of `@types/three`'s three `Fn` overloads
//   here — dropped; it's optional and JS-runtime-only (return/param typing), inference
//   from usage still works.
// - `Loop()`'s typed surface has no `name` option (the source addon renames its loop
//   variable to `x`/`y`/`z` via `{ name: 'x', ... }`) and no 3-parameter overload for
//   triple-nested loops — only unnamed single (`{i}`) and flattened-double (`{i,j}`)
//   forms are typed. Reworked below into strictly-nested single/double `Loop()` calls,
//   aliasing the typed `i`/`j` names back to `x`/`y`/`z` at each destructure — same
//   generated shader (JS-level variable shadowing across nested scopes is ordinary and
//   safe; three's `LoopNode.getVarName()` free-names unnamed loops `i`/`j`/`k`... per
//   call anyway), just typed.
import { Fn, Loop, TWO_PI, dot, float, fract, int, min, sin, vec2, vec3 } from 'three/tsl'

const hash2d = /*@__PURE__*/ Fn(([p]) => {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))).mul(18.5453))
})

export const voronoi2d = /*@__PURE__*/ Fn(([p, time]) => {
  const n = p.floor().toConst()
  const f = p.fract().toConst()
  const minDist = float(8).toVar()

  Loop(
    { start: int(-1), end: int(1), condition: '<=' },
    { start: int(-1), end: int(1), condition: '<=' },
    ({ i: x, j: y }) => {
      const g = vec2(float(x), float(y)).toConst()
      const o = hash2d(n.add(g)).toConst()
      const r = g.sub(f).add(sin(time.add(o.mul(TWO_PI))).mul(0.5).add(0.5))
      minDist.assign(min(minDist, dot(r, r)))
    },
  )

  return minDist
})

const hash3d = /*@__PURE__*/ Fn(([p]) => {
  return fract(
    sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))).mul(
      18.5453,
    ),
  )
})

export const voronoi3d = /*@__PURE__*/ Fn(([p, time]) => {
  const n = p.floor().toConst()
  const f = p.fract().toConst()
  const minDist = float(8).toVar()

  Loop({ start: int(-1), end: int(1), condition: '<=' }, ({ i: x }) => {
    Loop(
      { start: int(-1), end: int(1), condition: '<=' },
      { start: int(-1), end: int(1), condition: '<=' },
      ({ i: y, j: z }) => {
        const g = vec3(float(x), float(y), float(z)).toConst()
        const o = hash3d(n.add(g)).toConst()
        const r = g.sub(f).add(sin(time.add(o.mul(TWO_PI))).mul(0.5).add(0.5))
        minDist.assign(min(minDist, dot(r, r)))
      },
    )
  })

  return minDist
})
