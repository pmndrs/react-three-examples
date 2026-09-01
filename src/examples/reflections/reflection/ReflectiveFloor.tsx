// The reflective floor: a `reflector()` TSL node renders the scene from a mirrored
// camera into its own render target, sampled through a normal-map-perturbed UV and
// blended additively into `MeshPhongNodeMaterial.emissiveNode` (not `colorNode` — the
// reflection ADDS onto the checkerboard diffuse, it doesn't replace it).
import { useMemo } from 'react'
import { useTexture } from '@react-three/drei/webgpu'
import { reflector, texture, uv } from 'three/tsl'
import { BoxGeometry, Mesh, MeshPhongNodeMaterial, RepeatWrapping, SRGBColorSpace } from 'three/webgpu'
import type { Node } from 'three/webgpu'

const FLOOR_COLOR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/floors/FloorsCheckerboard_S_Diffuse.jpg'
const FLOOR_NORMAL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/floors/FloorsCheckerboard_S_Normal.jpg'

// Reflector resolution scale is fixed at the original's hardcoded value: it sizes an
// internal render target at construction time (not a reactive uniform), so it isn't
// exposed as a leva control here — see reflection.tsx's header DIVERGENCE note.
const REFLECTION_RESOLUTION_SCALE = 0.2

export function ReflectiveFloor() {
  const [floorColor, floorNormal] = useTexture([FLOOR_COLOR_URL, FLOOR_NORMAL_URL])

  const { mesh, reflectionTarget } = useMemo(() => {
    floorColor.wrapS = RepeatWrapping
    floorColor.wrapT = RepeatWrapping
    floorColor.colorSpace = SRGBColorSpace
    floorColor.repeat.set(15, 15)

    floorNormal.wrapS = RepeatWrapping
    floorNormal.wrapT = RepeatWrapping
    floorNormal.repeat.set(15, 15)

    const floorUV = uv().mul(15)
    const floorNormalOffset = texture(floorNormal, floorUV).xy.mul(2).sub(1).mul(0.02)

    const reflection = reflector({ resolutionScale: REFLECTION_RESOLUTION_SCALE })
    reflection.target.rotateX(-Math.PI / 2)
    // Non-null: `reflector()` always constructs with a default `uvNode` (`screenUV.flipX()`)
    // — @types/three declares the field nullable for the general `TextureNode` case, but
    // this instance is never null at runtime.
    reflection.uvNode = reflection.uvNode!.add(floorNormalOffset)

    const material = new MeshPhongNodeMaterial()
    material.colorNode = texture(floorColor, floorUV)
    // Cast: `emissiveNode` is read generically by `NodeMaterial`'s base
    // `setupOutgoingLight()` for every subclass (confirmed against
    // `three/src/materials/nodes/NodeMaterial.js`), but @types/three only declares it on
    // `MeshStandardNodeMaterial` — same class of duck-typed-property gap as
    // `scene.fogNode`/`scene.backgroundNode` (see reflection.tsx header DIVERGENCE).
    ;(material as unknown as { emissiveNode: Node | null }).emissiveNode = reflection.mul(0.25)
    material.normalMap = floorNormal
    material.normalScale.set(0.2, -0.2)

    const mesh = new Mesh(new BoxGeometry(50, 0.001, 50), material)
    mesh.receiveShadow = true

    return { mesh, reflectionTarget: reflection.target }
  }, [floorColor, floorNormal])

  return (
    <>
      <primitive object={mesh} />
      <primitive object={reflectionTarget} />
    </>
  )
}
