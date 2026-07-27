/**
 * tsl-galaxy
 * R3F port of three.js `webgpu_tsl_galaxy`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_tsl_galaxy (~100 lines of JS)
 *
 * DEMONSTRATES
 * - A 20k-particle spiral galaxy where the CPU never touches a single particle:
 *   `SpriteNodeMaterial`'s `positionNode`/`scaleNode`/`colorNode` compute every
 *   sprite's placement, size, and color on the GPU from `range()` per-instance
 *   randoms — the InstancedMesh's instance matrices stay identity forever
 * - `range(min, max)` as the TSL "give each instance its own random" primitive:
 *   one scalar range drives radius+spin+size+color-mix, a `range(0, branches)
 *   .floor()` picks the spiral arm, and a `range(vec3(-1), vec3(1)).pow3()`
 *   vector range fuzzes particles off their arm (cubed to cluster near it)
 * - Animation with zero per-frame JS: the TSL `time` built-in feeds the angle
 *   term, scaled by `radiusRatio.oneMinus()` so the core spins faster than the
 *   rim — the classic differential-rotation galaxy trick
 * - The build-time vs run-time split, both sides shown deliberately: `size`,
 *   `spinSpeed`, and the two colors are `useUniforms` values mutated live, while
 *   `branches` and `count` are JS constants baked into the node graph at build
 *   (leva changes to them rebuild mesh + material via the `useMemo` key)
 * - Soft round particles from pure fragment math — `0.1 / distance(uv, center)
 *   - 0.2` as alpha over a unit plane, additive-blended with `depthWrite` off
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` panel becomes leva
 *   (`size`, `colorInside`, `colorOutside` — same defaults); the Inspector addon
 *   itself is dropped (this repo's shell has no inspector; leva is the panel)
 * - Added `spinSpeed` (uniform multiplying the `time` term) plus `branches` and
 *   `count` (graph-rebuild controls) — the original hard-codes all three; the
 *   rebuild pair exists to make the build-time/run-time distinction visible
 * - `useUniforms`' `UniformNode<T>` pins its TSL type param to `unknown`
 *   (documented fiber typing gap, see tsl-earth et al.) — cast to
 *   `Node<'float'>`/`Node<'vec3'>` where uniforms feed TSL math
 * - `mesh.frustumCulled = false`: particle positions exist only in the shader,
 *   so three's culling sphere (built from the tiny unit-plane geometry at the
 *   origin) would pop the whole galaxy out when panning the origin off-screen —
 *   the original has the same latent bug and just never pans
 * - DemoHelpers grid disabled (galaxy floats in a void); dolly range set to the
 *   original OrbitControls' minDistance/maxDistance (0.1 / 50)
 */
import { useMemo } from 'react'
import { Canvas, useUniforms } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { cos, float, mix, range, sin, time, TWO_PI, uv, vec3, vec4 } from 'three/tsl'
import { AdditiveBlending, InstancedMesh, PlaneGeometry, SpriteNodeMaterial } from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

interface GalaxyProps {
  size: number
  spinSpeed: number
  colorInside: string
  colorOutside: string
  branches: number
  count: number
}

function Galaxy({ size, spinSpeed, colorInside, colorOutside, branches, count }: GalaxyProps) {
  // Run-time knobs: create-or-update semantics sync the leva values into the live
  // uniforms on every re-render — no graph rebuild.
  const { uSize, uSpinSpeed, uColorInside, uColorOutside } = useUniforms(
    {
      uSize: size,
      uSpinSpeed: spinSpeed,
      uColorInside: colorInside,
      uColorOutside: colorOutside,
    },
    'galaxy',
  )

  // Casts: `useUniforms` pins its TSL type param to `unknown` — see header DIVERGENCE.
  const uSizeNode = uSize as unknown as Node<'float'>
  const uSpinSpeedNode = uSpinSpeed as unknown as Node<'float'>
  const uColorInsideNode = uColorInside as unknown as Node<'vec3'>
  const uColorOutsideNode = uColorOutside as unknown as Node<'vec3'>

  // Build-time constants: `branches` and `count` are baked into the node graph /
  // instance allocation, so changing them re-runs this memo (fresh material + mesh,
  // fresh `range()` randoms). The uniform nodes are identity-stable across renders.
  const mesh = useMemo(() => {
    const material = new SpriteNodeMaterial({
      depthWrite: false,
      blending: AdditiveBlending,
    })

    // Per-instance random size, scaled by the live `size` uniform.
    material.scaleNode = range(0, 1).mul(uSizeNode)

    // Radial placement: pow(1.5) biases particles toward the dense core.
    const radiusRatio = range(0, 1)
    const radius = radiusRatio.pow(1.5).mul(5).toVar()

    // Arm selection (build-time constant `branches`) + differential rotation:
    // inner particles (radiusRatio → 0) get the biggest time term, so the core
    // winds up faster than the rim.
    const branchAngle = range(0, branches).floor().mul(TWO_PI.div(branches))
    const angle = branchAngle.add(time.mul(uSpinSpeedNode).mul(radiusRatio.oneMinus()))

    const position = vec3(cos(angle), 0, sin(angle)).mul(radius)

    // Cubed random offset clusters particles near their arm; grows with radius.
    const randomOffset = range(vec3(-1), vec3(1)).pow3().mul(radiusRatio).add(0.2)

    material.positionNode = position.add(randomOffset)

    // Core→rim color ramp (eased toward the outside color), soft round falloff alpha.
    const colorFinal = mix(uColorInsideNode, uColorOutsideNode, radiusRatio.oneMinus().pow(2).oneMinus())
    const alpha = float(0.1).div(uv().sub(0.5).length()).sub(0.2)
    material.colorNode = vec4(colorFinal, alpha)

    const instanced = new InstancedMesh(new PlaneGeometry(1, 1), material, count)
    // Positions live only in the shader — see header DIVERGENCE.
    instanced.frustumCulled = false
    return instanced
  }, [branches, count, uSizeNode, uSpinSpeedNode, uColorInsideNode, uColorOutsideNode])

  return <primitive object={mesh} />
}

export default function TslGalaxy() {
  const { size, spinSpeed, colorInside, colorOutside, branches, count } = useControls('tsl-galaxy', {
    size: { value: 0.08, min: 0, max: 1, step: 0.001 },
    spinSpeed: { value: 1, min: 0, max: 3, step: 0.05 },
    colorInside: '#ffa575',
    colorOutside: '#311599',
    branches: { value: 3, min: 2, max: 8, step: 1 },
    count: { value: 20000, min: 1000, max: 100000, step: 1000 },
  })

  return (
    <Canvas renderer background="#201919" camera={{ position: [4, 2, 5], fov: 50, near: 0.1, far: 100 }}>
      <Galaxy
        size={size}
        spinSpeed={spinSpeed}
        colorInside={colorInside}
        colorOutside={colorOutside}
        branches={branches}
        count={count}
      />
      <DemoHelpers grid={false} minDistance={0.1} maxDistance={50} />
    </Canvas>
  )
}
