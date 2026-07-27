// TerrainForest — the procedural alpine valley and the 500,000-tree instanced forest
// carpeting it (one draw call). Both generator instances are memoized once; a
// committed parameter change re-runs the bake — generator.build() disposes its own
// previous geometry, so rebuilds (and StrictMode double-invocation) don't leak.
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { ForestGenerator } from 'three/addons/generators/ForestGenerator.js'
import { TerrainGenerator } from 'three/addons/generators/TerrainGenerator.js'
import type { DirectionalLight } from 'three/webgpu'
import type { RefObject } from 'react'

export interface TerrainForestProps {
  seed: number
  erosion: number
  valleyBias: number
  /** Distance within which every tree is drawn. */
  cullFrom: number
  /** Distance past which no tree is drawn (the band between thins stochastically). */
  cullTo: number
  /** The key light — rebuilt geometry means its on-demand shadow map needs one refresh. */
  sunRef: RefObject<DirectionalLight | null>
}

export function TerrainForest({
  seed,
  erosion,
  valleyBias,
  cullFrom,
  cullTo,
  sunRef,
}: TerrainForestProps) {
  const terrain = useMemo(
    () =>
      new TerrainGenerator({
        seed: 1,
        size: 900,
        segments: 512,
        frequency: 0.0065,
        heightScale: 150,
        erosion: 0.7,
        valleyBias: 1.2,
      }),
    [],
  )
  const forest = useMemo(() => new ForestGenerator({ count: 500000, castShadow: true }), [])

  // The bake: ~0.8s of synchronous CPU work, keyed on values the page commits only on
  // slider release. The forest sits on the terrain, so a new terrain means a new forest.
  const { terrainGroup, forestGroup } = useMemo(() => {
    terrain.parameters.seed = seed
    terrain.parameters.erosion = erosion
    terrain.parameters.valleyBias = valleyBias
    const terrainGroup = terrain.build()
    const forestGroup = forest.build(terrain)
    return { terrainGroup, forestGroup }
  }, [terrain, forest, seed, erosion, valleyBias])

  // Rebuilt geometry ⇒ re-render the on-demand shadow map. On first mount the light
  // may not have attached yet — SunSky's own updateSun effect covers that one (the
  // original skips the first build the same way).
  useEffect(() => {
    if (sunRef.current) sunRef.current.shadow.needsUpdate = true
  }, [sunRef, terrainGroup])

  // Live cull band — uniform()-backed fields on the generator, mutated with no rebuild.
  useEffect(() => {
    forest.from.value = cullFrom
    forest.to.value = cullTo
  }, [forest, cullFrom, cullTo])

  // Drive the stochastic distance cull from the real camera each frame. The addon
  // deliberately takes a plain uniform rather than the TSL cameraPosition built-in:
  // in the shadow pass that node resolves to the light, which would cull the wrong trees.
  useFrame((state) => {
    forest.setCameraPosition(state.camera.position)
  })

  return (
    <>
      <primitive object={terrainGroup} />
      <primitive object={forestGroup} />
    </>
  )
}
