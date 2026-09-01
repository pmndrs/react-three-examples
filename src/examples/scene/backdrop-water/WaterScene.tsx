// The water/ice diorama: a shared "ice" triplanar-textured material (icosahedron
// field + caustic-lit floor), and a `MeshBasicNodeMaterial` water plane whose
// `colorNode`/`backdropNode`/`backdropAlphaNode` combine animated voronoi noise with
// depth-tested screen-space refraction. See backdrop-water.tsx header DEMONSTRATES.
import { useFrame } from '@react-three/fiber/webgpu'
import { useMemo, useRef } from 'react'
import type { Group } from 'three/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import {
  color,
  linearDepth,
  normalWorld,
  positionWorld,
  screenUV,
  texture,
  time,
  triplanarTexture,
  vec2,
  viewportDepthTexture,
  viewportLinearDepth,
  viewportSharedTexture,
} from 'three/tsl'
import { IcosahedronGeometry, MeshStandardNodeMaterial, RepeatWrapping, NoColorSpace } from 'three/webgpu'
import { voronoi2d, voronoi3d } from './voronoiNoise'

const ICE_TEXTURE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/water.jpg'

const OBJECT_COUNT = 100
const OBJECT_SCALE = 3.5
const OBJECT_COLUMNS = 10

interface WaterSceneProps {
  floorY: number
}

export function WaterScene({ floorY }: WaterSceneProps) {
  const iceDiffuse = useTexture(ICE_TEXTURE_URL)

  // Built once and shared by both the icosahedron field and the floor's caustic
  // blend below — mirrors the original's single `iceColorNode` reused across both
  // materials (TSL nodes are ordinary shared subgraphs, not per-material state).
  const iceColorNode = useMemo(() => {
    iceDiffuse.wrapS = RepeatWrapping
    iceDiffuse.wrapT = RepeatWrapping
    iceDiffuse.colorSpace = NoColorSpace
    return triplanarTexture(texture(iceDiffuse)).add(color(0x0066ff)).mul(0.8)
  }, [iceDiffuse])

  const iceGeometry = useMemo(() => new IcosahedronGeometry(1, 3), [])
  const iceMaterial = useMemo(() => new MeshStandardNodeMaterial({ colorNode: iceColorNode }), [iceColorNode])

  const objectLayout = useMemo(
    () =>
      Array.from({ length: OBJECT_COUNT }, (_, i) => {
        const x = i % OBJECT_COLUMNS
        const z = Math.floor(i / OBJECT_COLUMNS)
        return {
          position: [x * OBJECT_SCALE, 0, z * OBJECT_SCALE] as [number, number, number],
          rotation: [Math.random(), Math.random(), Math.random()] as [number, number, number],
        }
      }),
    [],
  )

  const groupOffset: [number, number, number] = [
    -((OBJECT_COLUMNS - 1) * OBJECT_SCALE) * 0.5,
    -1,
    -((OBJECT_COUNT / OBJECT_COLUMNS) * OBJECT_SCALE) * 0.5,
  ]

  const objectsRef = useRef<Group>(null)
  useFrame((state, delta) => {
    const group = objectsRef.current
    if (!group) return
    group.children.forEach((object, i) => {
      // Phase offset uses the array index instead of the original's `object.id`
      // (three.js's internal auto-increment counter — an implementation detail with
      // no semantic meaning, not something a port should try to reproduce).
      object.position.y = Math.sin(state.elapsed + i) * 0.3
      object.rotation.y += delta * 0.3
    })
  })

  // Water: animated 2-layer voronoi noise drives both the surface color and a
  // screen-space refraction offset; a depth comparison against the freshly-rendered
  // scene decides whether to sample the refracted UV or fall back to the
  // un-refracted `screenUV` (avoids refracting geometry that's actually in front of
  // the water surface).
  const waterNodes = useMemo(() => {
    const t = time.mul(0.8)
    const floorUV = positionWorld.xz

    const waterLayer0 = voronoi2d(floorUV.mul(6), t)
    const waterLayer1 = voronoi2d(floorUV.mul(3), t)
    const waterIntensity = waterLayer0.mul(waterLayer1)
    const waterColorNode = waterIntensity.mul(1.4).mix(color(0x0487e2), color(0x74ccf4))

    // linearDepth() returns the linear depth of the mesh currently being shaded
    // (the water plane itself).
    const depth = linearDepth()
    const depthWater = viewportLinearDepth.sub(depth)
    const depthEffect = depthWater.remapClamp(-0.002, 0.04)

    const refractionUV = screenUV.add(vec2(0, waterIntensity.mul(0.1)))

    // linearDepth(viewportDepthTexture(uv)) returns the linear depth of the scene
    // already rendered at that UV.
    const depthTestForRefraction = linearDepth(viewportDepthTexture(refractionUV)).sub(depth)
    const depthRefraction = depthTestForRefraction.remapClamp(0, 0.1)
    const finalUV = depthTestForRefraction.lessThan(0).select(screenUV, refractionUV)

    const viewportTexture = viewportSharedTexture(finalUV)

    const backdropNode = depthEffect
      .mix(viewportSharedTexture(), viewportTexture.mul(depthRefraction.mix(1, waterColorNode)))
      .mul(color(0xd3ebf8))
    const backdropAlphaNode = depthRefraction.oneMinus()

    return { waterColorNode, backdropNode, backdropAlphaNode }
  }, [])

  // Floor: the shared ice color, blended toward a bright caustic ripple
  // (`voronoi3d` sampled in world space so it wraps the cylinder seamlessly) except
  // where the surface faces up out of the water (`normalWorld.y`).
  const floorColorNode = useMemo(() => {
    const t = time.mul(0.8)
    const causticFade = normalWorld.y.mix(positionWorld.y.distance(0).oneMinus().saturate(), 0)
    const causticNoise = voronoi3d(positionWorld.mul(6), t)
    return causticFade.mix(iceColorNode, iceColorNode.add(causticNoise))
  }, [iceColorNode])

  return (
    <>
      <group ref={objectsRef} position={groupOffset}>
        {objectLayout.map(({ position, rotation }, i) => (
          <mesh key={i} geometry={iceGeometry} material={iceMaterial} position={position} rotation={rotation} />
        ))}
      </group>

      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[50, 0.001, 50]} />
        <meshBasicNodeMaterial
          colorNode={waterNodes.waterColorNode}
          backdropNode={waterNodes.backdropNode}
          backdropAlphaNode={waterNodes.backdropAlphaNode}
          transparent
        />
      </mesh>

      <mesh position={[0, floorY - 5, 0]} receiveShadow>
        <cylinderGeometry args={[1.1, 1.1, 10]} />
        <meshStandardNodeMaterial colorNode={floorColorNode} />
      </mesh>
    </>
  )
}
