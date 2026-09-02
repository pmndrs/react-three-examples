// OceanSky — the water plane, the sky dome, and the PMREM environment they produce
// together. Both addon meshes carry their parameters as `uniform()`-backed instance
// fields (three.js TSL) — leva changes mutate `.value` directly, nothing rebuilds.
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { SkyMesh } from 'three/addons/objects/SkyMesh.js'
import { WaterMesh } from 'three/addons/objects/WaterMesh.js'
import {
  MathUtils,
  PlaneGeometry,
  PMREMGenerator,
  type RenderTarget,
  RepeatWrapping,
  Scene,
  Vector3,
} from 'three/webgpu'

import { useThree } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { folder, useControls } from 'leva'

const WATER_NORMALS_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/waternormals.jpg'

export function OceanSky() {
  const scene = useThree((s) => s.scene)
  const renderer = useThree((s) => s.renderer)

  const { elevation, azimuth, distortionScale, size, cloudCoverage, cloudDensity, cloudElevation } = useControls(
    'ocean',
    {
      sky: folder({
        elevation: { value: 2, min: 0, max: 90, step: 0.1 },
        azimuth: { value: 180, min: -180, max: 180, step: 0.1 },
      }),
      water: folder({
        distortionScale: { value: 3.7, min: 0, max: 8, step: 0.1 },
        size: { value: 1, min: 0.1, max: 10, step: 0.1 },
      }),
      clouds: folder({
        cloudCoverage: { value: 0.4, min: 0, max: 1, step: 0.01 },
        cloudDensity: { value: 0.5, min: 0, max: 1, step: 0.01 },
        cloudElevation: { value: 0.5, min: 0, max: 1, step: 0.01 },
      }),
    },
  )

  const waterNormals = useTexture(WATER_NORMALS_URL)

  const water = useMemo(() => {
    waterNormals.wrapS = waterNormals.wrapT = RepeatWrapping
    return new WaterMesh(new PlaneGeometry(10000, 10000), {
      waterNormals,
      sunDirection: new Vector3(),
      sunColor: 0xffffff,
      waterColor: 0x001e0f,
      distortionScale: 3.7,
    })
  }, [waterNormals])

  const sky = useMemo(() => {
    const mesh = new SkyMesh()
    mesh.scale.setScalar(10000)
    mesh.turbidity.value = 10
    mesh.rayleigh.value = 2
    mesh.mieCoefficient.value = 0.005
    mesh.mieDirectionalG.value = 0.8
    return mesh
  }, [])

  // Env-bake plumbing, one instance per renderer (never disposed in cleanup —
  // StrictMode would kill the memoized generator for good).
  const env = useMemo(
    () => ({
      pmremGenerator: new PMREMGenerator(renderer),
      sceneEnv: new Scene(),
      sun: new Vector3(),
      renderTarget: undefined as RenderTarget | undefined,
    }),
    [renderer],
  )

  useEffect(() => {
    water.distortionScale.value = distortionScale
    water.size.value = size
  }, [water, distortionScale, size])

  useEffect(() => {
    sky.cloudCoverage.value = cloudCoverage
    sky.cloudDensity.value = cloudDensity
    sky.cloudElevation.value = cloudElevation
  }, [sky, cloudCoverage, cloudDensity, cloudElevation])

  // The original's updateSun(): point sky + water at the sun, then bake the sky into
  // scene.environment. Layout effect, not passive: the box's first shader build (first
  // RAF after commit) must already see the environment (AGENTS.md useLayoutEffect/B15).
  // Reparenting the LIVE sky into the bare env scene and back is the original's own
  // dance — fiber only re-checks parents on React commits, so this is safe.
  useLayoutEffect(() => {
    const { pmremGenerator, sceneEnv, sun } = env
    sun.setFromSphericalCoords(1, MathUtils.degToRad(90 - elevation), MathUtils.degToRad(azimuth))
    sky.sunPosition.value.copy(sun)
    water.sunDirection.value.copy(sun).normalize()

    env.renderTarget?.dispose()
    sceneEnv.add(sky)
    env.renderTarget = pmremGenerator.fromScene(sceneEnv)
    scene.add(sky)
    scene.environment = env.renderTarget.texture
  }, [env, scene, sky, water, elevation, azimuth])

  return (
    <>
      <primitive object={water} rotation-x={-Math.PI / 2} />
      <primitive object={sky} />
    </>
  )
}
