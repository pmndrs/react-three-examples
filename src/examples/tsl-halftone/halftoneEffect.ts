// Halftone TSL graph: a reusable per-layer dot-grid `Fn`, plus a hook that composites
// N such layers over a material's existing shaded output. No JSX here — this module is
// the "effect" scene role, kept separate from the components that consume it.
import { useMemo } from 'react'
import { Fn, mix, normalWorld, rotate, screenCoordinate, screenSize, vec4 } from 'three/tsl'
import type { Node } from 'three/webgpu'

// A `useUniforms` scope, typed the same way the hook itself returns it
// (`Record<string, UniformNode>`) — a stricter named-fields interface would NOT be
// assignable from that return type, since an index signature doesn't statically prove
// specific keys exist, even though at runtime this module only ever reads
// `count`/`color`/`direction`/`start`/`end`/`mixLow`/`mixHigh`/`radius` off it (the
// fields every call site below actually provides).
export type HalftoneLayerUniforms = Record<string, UniformNode>

// One halftone "ink layer": a rotated screen-space dot grid, masked by how much the
// surface normal faces `direction` (remapped `end..start` -> `0..1`), tinted `color`.
const halftoneLayer = Fn(([countIn, colorIn, directionIn, startIn, endIn, radiusIn, mixLowIn, mixHighIn]) => {
  // Casts: the Fn's array-destructured params come back as bare `ShaderNodeObject<Node>`
  // (no vec/float type parameter), which is too loose for TSL's typed math overloads
  // (`rotate()` in particular) to resolve correctly — same class of gap as fiber's
  // `UniformNode<T>` cast (see tsl-halftone.tsx), but on three's own Fn typings.
  const count = countIn as unknown as Node<'float'>
  const color = colorIn as unknown as Node<'vec3'>
  const direction = directionIn as unknown as Node<'vec3'>
  const start = startIn as unknown as Node<'float'>
  const end = endIn as unknown as Node<'float'>
  const radius = radiusIn as unknown as Node<'float'>
  const mixLow = mixLowIn as unknown as Node<'float'>
  const mixHigh = mixHighIn as unknown as Node<'float'>

  let gridUv = screenCoordinate.xy.div(screenSize.yy).mul(count)
  gridUv = rotate(gridUv, Math.PI * 0.25).mod(1)

  const orientationStrength = normalWorld.dot(direction.normalize()).remapClamp(end, start, 0, 1)

  const mask = orientationStrength
    .mul(radius)
    .mul(0.5)
    .step(gridUv.sub(0.5).length())
    .mul(mix(mixLow, mixHigh, orientationStrength))

  return vec4(color, mask)
})

// Composites both layers over a material's existing shaded `input` (its own `output`
// node), each layer alpha-blended on top in turn — same accumulation as the original.
export function useHalftoneComposite(purple: HalftoneLayerUniforms, cyan: HalftoneLayerUniforms) {
  return useMemo(
    () => {
      const layers = [purple, cyan]
      return Fn(([input]) => {
        const result = input
        for (const layer of layers) {
          const dots = halftoneLayer(
            layer.count,
            layer.color,
            layer.direction,
            layer.start,
            layer.end,
            layer.radius,
            layer.mixLow,
            layer.mixHigh,
          )
          result.rgb.assign(mix(result.rgb, dots.rgb, dots.a))
        }
        return result
      })
    },
    // Depend on the individual uniform NODE identities (stable across re-renders, per
    // fiber's create-if-not-exists uniform cache), not their `.value`s, so this graph
    // builds exactly once and leva edits only ever mutate GPU-side values afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      purple.count,
      purple.color,
      purple.direction,
      purple.start,
      purple.end,
      purple.mixLow,
      purple.mixHigh,
      purple.radius,
      cyan.count,
      cyan.color,
      cyan.direction,
      cyan.start,
      cyan.end,
      cyan.mixLow,
      cyan.mixHigh,
      cyan.radius,
    ],
  )
}

export type HalftonesFn = ReturnType<typeof useHalftoneComposite>
