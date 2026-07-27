// The mirror room: six 100x100 Phong walls, two of which are live mirrors — the
// floor (reflection masked in by a decal texture's alpha) and the back wall
// (blue-tinted full mirror). Each `reflector()` renders the scene from a mirrored
// camera into its own target texture; its `target` Object3D is childed to the plane
// mesh so it inherits the plane's transform, exactly like the original's
// `plane.add(reflector.target)`.
import { useMemo } from 'react'
import { useUniforms } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { color, reflector, texture, uv } from 'three/tsl'
import { RepeatWrapping, SRGBColorSpace } from 'three/webgpu'
import type { Node } from 'three/webgpu'

const ASSET_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples'
const FLOOR_NORMAL_URL = `${ASSET_BASE}/textures/floors/FloorsCheckerboard_S_Normal.jpg`
const DECAL_DIFFUSE_URL = `${ASSET_BASE}/textures/decal/decal-diffuse.png`
const DECAL_NORMAL_URL = `${ASSET_BASE}/textures/decal/decal-normal.jpg`

const PLANE_SIZE = 100.1

interface RoomProps {
  /** Ground reflector UV-perturbation strength (original hardcodes -0.08). */
  groundDistortion: number
  /** Back-wall reflector UV-perturbation strength (original hardcodes 0.1). */
  wallDistortion: number
}

export function Room({ groundDistortion, wallDistortion }: RoomProps) {
  // B18: creator-mode useUniforms must run BEFORE the suspending useTexture below —
  // deferred past the suspense re-render it becomes a setState-during-render warning.
  const distortion = useUniforms({ ground: groundDistortion, wall: wallDistortion }, 'mirrorRoom')

  const [floorNormal, decalDiffuse, decalNormal] = useTexture([
    FLOOR_NORMAL_URL,
    DECAL_DIFFUSE_URL,
    DECAL_NORMAL_URL,
  ])

  const { groundNode, verticalNode, groundTarget, verticalTarget } = useMemo(() => {
    floorNormal.wrapS = RepeatWrapping
    floorNormal.wrapT = RepeatWrapping
    decalDiffuse.colorSpace = SRGBColorSpace

    // Cast: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`, so
    // typed TSL math rejects it under strict tsc — documented fiber typing gap
    // (AGENTS.md / UPSTREAM.md; these really are float uniforms at runtime).
    const uGround = distortion.ground as unknown as Node<'float'>
    const uWall = distortion.wall as unknown as Node<'float'>

    const groundReflector = reflector()
    const verticalReflector = reflector()

    // Normal maps sampled as plain textures ([0,1] -> [-1,1]) perturb the mirrored UVs.
    const groundUVOffset = texture(decalNormal).xy.mul(2).sub(1).mul(uGround)
    const verticalUVOffset = texture(floorNormal, uv().mul(5)).xy.mul(2).sub(1).mul(uWall)

    // Non-null: `reflector()` always constructs with a default `uvNode`
    // (`screenUV.flipX()`) — @types/three declares the field nullable only for the
    // general `TextureNode` case (same note as the `reflection` port).
    groundReflector.uvNode = groundReflector.uvNode!.add(groundUVOffset)
    verticalReflector.uvNode = verticalReflector.uvNode!.add(verticalUVOffset)

    // Floor: white where the decal is transparent, mirror where the decal is opaque.
    const groundNode = texture(decalDiffuse).a.mix(color(0xffffff), groundReflector)
    // Back wall: faint blue base plus the reflection, additively.
    const verticalNode = color(0x0000ff).mul(0.1).add(verticalReflector)

    return {
      groundNode,
      verticalNode,
      groundTarget: groundReflector.target,
      verticalTarget: verticalReflector.target,
    }
  }, [floorNormal, decalDiffuse, decalNormal, distortion.ground, distortion.wall])

  return (
    <>
      {/* Floor — decal-masked mirror */}
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
        <meshPhongNodeMaterial colorNode={groundNode} />
        <primitive object={groundTarget} />
      </mesh>
      {/* Back wall — blue-tinted mirror */}
      <mesh position={[0, 50, -50]}>
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
        <meshPhongNodeMaterial colorNode={verticalNode} />
        <primitive object={verticalTarget} />
      </mesh>
      {/* Ceiling */}
      <mesh position={[0, 100, 0]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
        <meshPhongMaterial color="#ffffff" />
      </mesh>
      {/* Front wall (behind the default camera) */}
      <mesh position={[0, 50, 50]} rotation-y={Math.PI}>
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
        <meshPhongMaterial color="#7f7fff" />
      </mesh>
      {/* Right wall */}
      <mesh position={[50, 50, 0]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
        <meshPhongMaterial color="#00ff00" />
      </mesh>
      {/* Left wall */}
      <mesh position={[-50, 50, 0]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
        <meshPhongMaterial color="#ff0000" />
      </mesh>
    </>
  )
}
