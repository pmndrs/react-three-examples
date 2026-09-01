// Static scenery for compute-particles-snow: lights, the radially-fading floor, the
// stacked-cone tree, and the radial-gradient backgroundNode. Everything here stays on
// layer 0, so both the main camera and the collision camera see it — snow lands on
// all of it.
import { useLayoutEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber/webgpu'
import { color, positionLocal, screenUV } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import type { Node } from 'three/webgpu'

const TREE_LEVELS = 8

export function SnowScenery() {
  const scene = useThree((state) => state.scene)

  // Radial background gradient (teal core → near-black rim). Cast: @types/three's
  // Scene doesn't declare `backgroundNode` even though the WebGPU renderer reads it
  // (UPSTREAM.md B11) — same pattern as backdrop-area/portal.
  useLayoutEffect(() => {
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null }
    withBackgroundNode.backgroundNode = screenUV.distance(0.5).mul(2).mix(color(0x0f4140), color(0x060a0d))
    return () => {
      withBackgroundNode.backgroundNode = null
    }
  }, [scene])

  // One material shared by all tree cones + the trunk (the original shares one too),
  // and the floor's radial opacity fade. Memoized, never disposed (StrictMode rule).
  const { treeMaterial, floorOpacityNode } = useMemo(
    () => ({
      treeMaterial: new MeshStandardNodeMaterial({ color: 0x0d492c, roughness: 0.6, metalness: 0 }),
      // The original bakes rotateX(-π/2) into the floor geometry and reads
      // `positionLocal.xz`; this port rotates the mesh instead, so the plane's local
      // ground coordinates are xy — identical radial fade (header DIVERGENCE).
      floorOpacityNode: positionLocal.xy.mul(0.05).distance(0).saturate().oneMinus(),
    }),
    [],
  )

  return (
    <>
      <directionalLight color={0xf9ff9b} intensity={9} position={[10, 10, 0]} />
      <hemisphereLight args={[0x0f3c37, 0x080d10, 100]} />

      {/* Floor: fades out radially so it dissolves into fog and background. */}
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[100, 100]} />
        <meshStandardNodeMaterial
          color={0x0c1e1e}
          roughness={0.5}
          metalness={0}
          transparent
          opacityNode={floorOpacityNode}
        />
      </mesh>

      {/* Tree: eight stacked cones over a trunk cylinder. */}
      <group>
        {Array.from({ length: TREE_LEVELS }, (_, i) => {
          const radius = 1 + i
          return (
            <mesh
              key={i}
              material={treeMaterial}
              position-y={(TREE_LEVELS - i) * 1.5 + TREE_LEVELS * 0.6}
            >
              <coneGeometry args={[radius * 0.95, radius * 1.25, 32]} />
            </mesh>
          )
        })}
        <mesh material={treeMaterial} position-y={TREE_LEVELS / 2}>
          <cylinderGeometry args={[1, 1, TREE_LEVELS, 32]} />
        </mesh>
      </group>
    </>
  )
}
