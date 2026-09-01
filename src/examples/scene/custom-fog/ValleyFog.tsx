// ValleyFog — the example's namesake: a custom TSL fog graph on `scene.fogNode`.
// An animated two-octave triNoise3D haze that settles into the valley as a level
// band: solid below `base` (down under the mountains) and fading out by `top`
// (around mid-height), so the peaks rise clear above it. The band sits at a fixed
// altitude whatever the distance, and the noise wobbles its top edge and drifts it
// through world space, so it reads as slow-moving cloud. (The peaks reach ~130.)
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber/webgpu'
import {
  color,
  densityFogFactor,
  fog,
  normalWorld,
  positionWorld,
  time,
  triNoise3D,
  uniform,
} from 'three/tsl'
import type { Node } from 'three/webgpu'

const SKY_COLOR = 0xf0f5f5
const GROUND_COLOR = 0xd0dee7

export interface ValleyFogProps {
  /** World-y the fog is solid below (the valley floor). */
  base: number
  /** World-y the fog fades out by (mid-mountain). */
  top: number
  /** Distance haze density, so the far peaks dissolve into the same grey. */
  haze: number
}

export function ValleyFog({ base, top, haze }: ValleyFogProps) {
  const scene = useThree((s) => s.scene)

  // Live-tunable knobs of the fog graph — leva changes mutate `.value`, no rebuild.
  const uniforms = useMemo(
    () => ({
      fogBase: uniform(-20),
      fogTop: uniform(55),
      fogHaze: uniform(0.0012),
    }),
    [],
  )

  useEffect(() => {
    uniforms.fogBase.value = base
    uniforms.fogTop.value = top
    uniforms.fogHaze.value = haze
  }, [uniforms, base, top, haze])

  // Build the graph once and hand it to the scene. Layout effect, not passive: the
  // first shader build (first RAF after commit) must already see the fog node.
  useLayoutEffect(() => {
    const { fogBase, fogTop, fogHaze } = uniforms

    const groundColor = color(GROUND_COLOR)
    const skyColor = color(SKY_COLOR)

    const fogNoiseA = triNoise3D(positionWorld.mul(0.005), 0.2, time)
    const fogNoiseB = triNoise3D(positionWorld.mul(0.01), 0.2, time.mul(1.2))
    const fogNoise = fogNoiseA.add(fogNoiseB)

    // The noise lifts and drops the top of the band so it breaks into wisps.
    const bandTop = fogTop.add(fogNoise.sub(0.7).mul(22))
    const groundFogArea = bandTop
      .sub(positionWorld.y)
      .div(bandTop.sub(fogBase))
      .saturate()
      .mul(0.98)

    // The valley band plus a distance haze, so the far peaks dissolve into the grey too.
    const fogArea = groundFogArea.oneMinus().mul(densityFogFactor(fogHaze).oneMinus()).oneMinus()

    // Cast: @types/three's Scene declares neither `fogNode` nor `backgroundNode`, but
    // the WebGPU renderer reads both off the live instance (NodeManager.updateFog /
    // updateBackground — AGENTS.md B11; same cast family as sprites.tsx).
    const fogged = scene as unknown as { fogNode: Node | null; backgroundNode: Node | null }
    fogged.fogNode = fog(groundColor, fogArea)
    // The visible background IS the fog gradient — a vertical ground→sky mix.
    fogged.backgroundNode = normalWorld.y.max(0).mix(groundColor, skyColor)

    return () => {
      fogged.fogNode = null
      fogged.backgroundNode = null
    }
  }, [scene, uniforms])

  return null
}
