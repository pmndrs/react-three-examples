// Everything that needs fiber's WebGPU hooks (`useUniforms`, `useFrame`) lives here,
// as a child of <Canvas> — those hooks require the R3F reconciler context, unlike
// leva's `useControls`, which the entry file calls one level up.
import { Suspense } from 'react'
import { useFrame, useUniforms } from '@react-three/fiber/webgpu'
import type { Vector3 } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { useHalftoneComposite } from './halftoneEffect'
import { HalftoneMichelle } from './HalftoneMichelle'
import { HalftonePrimitives } from './HalftonePrimitives'

interface HalftoneLayerControls {
  count: number
  color: string
  start: number
  end: number
  mixLow: number
  mixHigh: number
  radius: number
}

interface HalftoneSceneProps {
  ambientIntensity: number
  directionalIntensity: number
  materialColor: string
  purpleControls: HalftoneLayerControls & { direction: { x: number; y: number; z: number } }
  cyanControls: HalftoneLayerControls & { directionZ: number }
}

export function HalftoneScene({
  ambientIntensity,
  directionalIntensity,
  materialColor,
  purpleControls,
  cyanControls,
}: HalftoneSceneProps) {
  const purple = useUniforms(
    {
      count: purpleControls.count,
      color: purpleControls.color,
      direction: purpleControls.direction,
      start: purpleControls.start,
      end: purpleControls.end,
      mixLow: purpleControls.mixLow,
      mixHigh: purpleControls.mixHigh,
      radius: purpleControls.radius,
    },
    'halftonePurple',
  )

  const cyan = useUniforms(
    {
      count: cyanControls.count,
      color: cyanControls.color,
      // x/y are overwritten every frame below; only the literal here matters pre-mount.
      direction: { x: 0.5, y: 0.5, z: cyanControls.directionZ },
      start: cyanControls.start,
      end: cyanControls.end,
      mixLow: cyanControls.mixLow,
      mixHigh: cyanControls.mixHigh,
      radius: cyanControls.radius,
    },
    'halftoneCyan',
  )

  // Cast: fiber's `UniformNode<T>` pins the value type to `unknown` (documented fiber
  // typing gap, see skinning-instancing/rtt) — this uniform really is a Vector3 at
  // runtime (`direction`'s `{x,y,z}` input above auto-converts via fiber's vectorize()).
  const cyanDirection = cyan.direction as UniformNode<Vector3>

  useFrame((state) => {
    cyanDirection.value.x = Math.cos(state.elapsed)
    cyanDirection.value.y = Math.sin(state.elapsed)
  })

  const halftones = useHalftoneComposite(purple, cyan)

  return (
    <>
      <ambientLight intensity={ambientIntensity} />
      <directionalLight intensity={directionalIntensity} position={[4, 3, 1]} />
      <HalftonePrimitives materialColor={materialColor} halftones={halftones} />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <HalftoneMichelle halftones={halftones} />
      </Suspense>
      <DemoHelpers minDistance={0.1} maxDistance={50} />
    </>
  )
}
