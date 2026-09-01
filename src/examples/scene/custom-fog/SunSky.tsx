// SunSky — the directional key light and the physical-sky IBL bake. The SkyMesh is
// never part of the visible scene (the fog gradient is the background) — it lives in
// a bare env scene and is baked into `scene.environment` via PMREMGenerator on every
// sun move, the original's updateSun() dance.
import { useLayoutEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber/webgpu'
import { SkyMesh } from 'three/addons/objects/SkyMesh.js'
import {
  Color,
  MathUtils,
  PMREMGenerator,
  Scene,
  Vector3,
  type DirectionalLight,
  type RenderTarget,
  type WebGPURenderer,
} from 'three/webgpu'
import type { RefObject } from 'react'

export interface SunSkyProps {
  /** Sun height above the horizon, in degrees (low = golden hour). */
  elevation: number
  /** Sun compass direction, in degrees. */
  azimuth: number
  /** Shared handle to the key light, so the terrain rebuild can refresh its shadow map. */
  sunRef: RefObject<DirectionalLight | null>
}

export function SunSky({ elevation, azimuth, sunRef }: SunSkyProps) {
  const scene = useThree((s) => s.scene)
  // PMREMGenerator (three/webgpu) wants the common Renderer; useThree types the union
  // even on the /webgpu entry — cast once (upstream fiber gap, UPSTREAM.md B9).
  const renderer = useThree((s) => s.renderer) as WebGPURenderer

  const sky = useMemo(() => {
    const mesh = new SkyMesh()
    mesh.scale.setScalar(10000)
    mesh.turbidity.value = 12
    mesh.rayleigh.value = 2
    mesh.mieCoefficient.value = 0.005
    mesh.mieDirectionalG.value = 0.88
    mesh.showSunDisc.value = false // bake the sky without the sun disc
    return mesh
  }, [])

  // Env-bake plumbing, one instance per renderer (never disposed in cleanup —
  // StrictMode would kill the memoized generator for good).
  const env = useMemo(
    () => ({
      pmremGenerator: new PMREMGenerator(renderer),
      envScene: new Scene(),
      renderTarget: undefined as RenderTarget | undefined,
    }),
    [renderer],
  )

  // Unit sun direction from the two angles — feeds the sky uniform, the light
  // position and the env bake alike.
  const sunDir = useMemo(
    () =>
      new Vector3().setFromSphericalCoords(
        1,
        MathUtils.degToRad(90 - elevation),
        MathUtils.degToRad(azimuth),
      ),
    [elevation, azimuth],
  )

  // A dim, cool sky fill so the warm sun stays the key and shadows read.
  useLayoutEffect(() => {
    scene.environmentIntensity = 0.16
    return () => {
      scene.environmentIntensity = 1
    }
  }, [scene])

  // updateSun(): aim the sky's sun, refresh the on-demand shadow map, and re-bake the
  // sky into scene.environment. Layout effect, not passive: the terrain/forest's first
  // shader build must already see the environment (AGENTS.md B15/useLayoutEffect).
  useLayoutEffect(() => {
    const { pmremGenerator, envScene } = env
    sky.sunPosition.value.copy(sunDir)

    // The sun moved, so the on-demand shadow map needs one refresh (the light's own
    // props were committed just before this effect ran).
    if (sunRef.current) sunRef.current.shadow.needsUpdate = true

    envScene.add(sky) // the sky lives only here — it is never added to the visible scene
    env.renderTarget?.dispose()
    env.renderTarget = pmremGenerator.fromScene(envScene)
    scene.environment = env.renderTarget.texture
  }, [env, scene, sky, sunRef, sunDir])

  // The longer air path near the horizon dims and warms the sun. It stays far
  // brighter than the sky fill, so it reads as the key and casts firm shadows.
  const transmittance = Math.sqrt(Math.max(Math.sin(MathUtils.degToRad(elevation)), 0))
  const sunColor = useMemo(
    () => new Color(0xff7a2f).lerp(new Color(0xfff2e0), transmittance), // deep orange → warm white
    [transmittance],
  )

  return (
    <directionalLight
      ref={sunRef}
      color={sunColor}
      intensity={11 * transmittance + 0.3}
      position={[sunDir.x * 900, sunDir.y * 900, sunDir.z * 900]}
      castShadow
      shadow-camera-left={-420}
      shadow-camera-right={420}
      shadow-camera-top={420}
      shadow-camera-bottom={-420}
      shadow-camera-near={200}
      shadow-camera-far={1800}
      shadow-mapSize-width={4096}
      shadow-mapSize-height={4096}
      shadow-bias={-0.0004}
      shadow-normalBias={0.15}
      // The scene is static — render the shadow map only when the sun moves or the
      // terrain regenerates (imperative shadow.needsUpdate), not every frame.
      shadow-autoUpdate={false}
    />
  )
}
