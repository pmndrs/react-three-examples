// Sea scene role: the TSL wave-displaced plane — position/normal/emissive node graph
// on a single MeshStandardNodeMaterial. Everything here needs fiber hooks
// (`useUniforms`), so it lives inside <Canvas>, not in the page shell.
import { useMemo } from 'react'
import { useUniforms } from '@react-three/fiber/webgpu'
import {
  Fn,
  Loop,
  float,
  mul,
  mx_noise_float,
  positionLocal,
  sin,
  time,
  transformNormalToView,
  vec3,
} from 'three/tsl'
import { MeshStandardNodeMaterial, PlaneGeometry } from 'three/webgpu'
import type { Node } from 'three/webgpu'

export interface SeaProps {
  color: string
  roughness: number
  emissiveColor: string
  emissiveLow: number
  emissiveHigh: number
  emissivePower: number
  largeSpeed: number
  largeMultiplier: number
  largeFrequencyX: number
  largeFrequencyY: number
  smallIterations: number
  smallFrequency: number
  smallSpeed: number
  smallMultiplier: number
  normalComputeShift: number
}

export function Sea({
  color,
  roughness,
  emissiveColor,
  emissiveLow,
  emissiveHigh,
  emissivePower,
  largeSpeed,
  largeMultiplier,
  largeFrequencyX,
  largeFrequencyY,
  smallIterations,
  smallFrequency,
  smallSpeed,
  smallMultiplier,
  normalComputeShift,
}: SeaProps) {
  // Run-time knobs: create-or-update semantics sync the leva values into the live GPU
  // uniforms on every re-render — the node graph below never rebuilds.
  const {
    uEmissiveColor,
    uEmissiveLow,
    uEmissiveHigh,
    uEmissivePower,
    uLargeSpeed,
    uLargeMultiplier,
    uLargeFrequencyX,
    uLargeFrequencyY,
    uSmallIterations,
    uSmallFrequency,
    uSmallSpeed,
    uSmallMultiplier,
    uNormalComputeShift,
  } = useUniforms(
    {
      uEmissiveColor: emissiveColor,
      uEmissiveLow: emissiveLow,
      uEmissiveHigh: emissiveHigh,
      uEmissivePower: emissivePower,
      uLargeSpeed: largeSpeed,
      uLargeMultiplier: largeMultiplier,
      uLargeFrequencyX: largeFrequencyX,
      uLargeFrequencyY: largeFrequencyY,
      uSmallIterations: smallIterations,
      uSmallFrequency: smallFrequency,
      uSmallSpeed: smallSpeed,
      uSmallMultiplier: smallMultiplier,
      uNormalComputeShift: normalComputeShift,
    },
    'ragingSea',
  )

  // Casts: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`, so the
  // uniforms won't feed typed TSL math under strict tsc (upstream fiber gap — same
  // cast family as tsl-galaxy / tsl-procedural-terrain).
  const uEmissiveColorNode = uEmissiveColor as unknown as Node<'vec3'>
  const uEmissiveLowNode = uEmissiveLow as unknown as Node<'float'>
  const uEmissiveHighNode = uEmissiveHigh as unknown as Node<'float'>
  const uEmissivePowerNode = uEmissivePower as unknown as Node<'float'>
  const uLargeSpeedNode = uLargeSpeed as unknown as Node<'float'>
  const uLargeMultiplierNode = uLargeMultiplier as unknown as Node<'float'>
  const uLargeFrequencyXNode = uLargeFrequencyX as unknown as Node<'float'>
  const uLargeFrequencyYNode = uLargeFrequencyY as unknown as Node<'float'>
  const uSmallIterationsNode = uSmallIterations as unknown as Node<'float'>
  const uSmallFrequencyNode = uSmallFrequency as unknown as Node<'float'>
  const uSmallSpeedNode = uSmallSpeed as unknown as Node<'float'>
  const uSmallMultiplierNode = uSmallMultiplier as unknown as Node<'float'>
  const uNormalComputeShiftNode = uNormalComputeShift as unknown as Node<'float'>

  // Built once — `useUniforms` returns stable node instances across re-renders (leva
  // edits mutate `.value` in place), so this graph never rebuilds after the first
  // pass, matching the original's single `init()`.
  const rig = useMemo(() => {
    // Elevation at any local-space point: two crossed sines (large swell) minus a
    // fractal stack of |mx_noise_float| octaves (small chop).
    const wavesElevation = Fn(([positionIn]) => {
      // Fn's destructured params come back as bare `ShaderNodeObject<Node>` — too
      // loose for the swizzles/typed math below (three-side gap, UPSTREAM.md B10).
      const position = positionIn as unknown as Node<'vec3'>

      // large waves
      const elevation = mul(
        sin(position.x.mul(uLargeFrequencyXNode).add(time.mul(uLargeSpeedNode))),
        sin(position.z.mul(uLargeFrequencyYNode).add(time.mul(uLargeSpeedNode))),
        uLargeMultiplierNode,
      ).toVar()

      // small waves — run-time loop: the octave count is a uniform, so the bound must
      // be a TSL `Loop` (a JS `for` here would bake the count at graph build).
      Loop({ type: 'float', start: float(1), end: uSmallIterationsNode, condition: '<=' }, ({ i }) => {
        const noiseInput = vec3(
          position.xz
            .add(2) // avoids a-hole pattern (original comment)
            .mul(uSmallFrequencyNode)
            .mul(i),
          time.mul(uSmallSpeedNode),
        )

        const wave = mx_noise_float(noiseInput, 1, 0).mul(uSmallMultiplierNode).div(i).abs()

        elevation.subAssign(wave)
      })

      return elevation
    })

    const material = new MeshStandardNodeMaterial({ color, roughness })

    // position — displace the flat plane vertically by the elevation field
    const elevation = wavesElevation(positionLocal)
    const position = positionLocal.add(vec3(0, elevation, 0))
    material.positionNode = position

    // normals — rebuilt from two neighbour elevation taps (finite differences): the
    // geometry's authored normals are meaningless once the surface is displaced
    const shiftedA = positionLocal.add(vec3(uNormalComputeShiftNode, 0, 0))
    const shiftedB = positionLocal.sub(vec3(0, 0, uNormalComputeShiftNode))
    const positionA = shiftedA.add(vec3(0, wavesElevation(shiftedA), 0))
    const positionB = shiftedB.add(vec3(0, wavesElevation(shiftedB), 0))

    const toA = positionA.sub(position).normalize()
    const toB = positionB.sub(position).normalize()
    material.normalNode = transformNormalToView(toA.cross(toB))

    // emissive — remap runs high→low so the TROUGHS glow (the light shining through
    // the thin water between waves), shaped by a pow falloff
    const emissive = elevation.remap(uEmissiveHighNode, uEmissiveLowNode).pow(uEmissivePowerNode)
    material.emissiveNode = vec3(uEmissiveColorNode).mul(emissive)

    const geometry = new PlaneGeometry(2, 2, 256, 256)
    geometry.rotateX(-Math.PI * 0.5)

    return { geometry, material }
    // color/roughness are plain Standard-material fields applied via <primitive>
    // props below — they must not rebuild the graph, so they're not deps here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    uEmissiveColorNode,
    uEmissiveLowNode,
    uEmissiveHighNode,
    uEmissivePowerNode,
    uLargeSpeedNode,
    uLargeMultiplierNode,
    uLargeFrequencyXNode,
    uLargeFrequencyYNode,
    uSmallIterationsNode,
    uSmallFrequencyNode,
    uSmallSpeedNode,
    uSmallMultiplierNode,
    uNormalComputeShiftNode,
  ])

  return (
    <mesh geometry={rig.geometry}>
      {/* leva → plain material accessors: color/roughness are ordinary Standard
          fields (no node graph involvement) — fiber prop application on the
          primitive updates them live, no uniform plumbing needed. */}
      <primitive object={rig.material} attach="material" color={color} roughness={roughness} />
    </mesh>
  )
}
