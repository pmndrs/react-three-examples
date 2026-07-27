// The Xbot model rendered twice: once normally in the main scene, once as a
// wireframed, noise-colored "ghost" clone in the portal scene. See portal.tsx header
// DEMONSTRATES/DIVERGENCE for why a plain `.clone()` + traversal replaces the
// original's two hardcoded child-index lookups.
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { useAnimations, useGLTF } from '@react-three/drei/webgpu'
import { mx_fractal_noise_vec3, time, uv } from 'three/tsl'
import type { Mesh, MeshStandardMaterial, Node } from 'three/webgpu'

const XBOT_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Xbot.glb'

// The original plays `gltf.animations[6]` by index; that clip is named "walk" in
// Xbot.glb (confirmed against the glb's animation table) — playing by name matches
// this repo's convention (never `Object.values(actions)`/blind indices).
const WALK_CLIP = 'walk'

export function XbotModel() {
  const { scene, animations } = useGLTF(XBOT_URL)
  const { actions } = useAnimations(animations, scene)

  useEffect(() => {
    actions[WALK_CLIP]?.play()
  }, [actions])

  return <primitive object={scene} />
}

export function PortalGhost() {
  const { scene, animations } = useGLTF(XBOT_URL)
  // Plain `.clone()`, matching the original: `SkinnedMesh.copy()` shares the source
  // skeleton's bones rather than duplicating them, so both instances' mixers drive the
  // SAME bone objects — harmless here since both play the identical "walk" clip in
  // lockstep, so the redundant writes agree every frame.
  const clone = useMemo(() => scene.clone(), [scene])

  const colorNode = useMemo(() => mx_fractal_noise_vec3(uv().mul(20).add(time)), [])

  // useLayoutEffect: the WebGPU shader-graph build reads material state on the first
  // RAF render (AGENTS.md useLayoutEffect-vs-useEffect rule) — the wireframe/colorNode
  // swap must land before that first read, or the ghost briefly renders with its
  // original (non-wireframe) materials.
  useLayoutEffect(() => {
    clone.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return

      const material = (mesh.material as MeshStandardMaterial).clone()
      // Cast: `colorNode` is read generically by NodeMaterial's base
      // `setupOutgoingLight()`/build step for every NodeMaterial subclass — the WebGPU
      // renderer auto-upgrades a classic material (like this cloned GLTF
      // MeshStandardMaterial) into its NodeMaterial equivalent and copies every own
      // enumerable property across (`NodeLibrary.fromMaterial()`, confirmed against
      // `reference/three.js/src/renderers/common/nodes/NodeLibrary.js`), which is how
      // the original's plain `material.colorNode = ...` on a classic material works at
      // all. `@types/three` only declares `colorNode` on the Node-suffixed classes
      // (same duck-typed-property pattern as `scene.fogNode`/`backgroundNode`).
      ;(material as unknown as { colorNode: Node | null }).colorNode = colorNode
      material.wireframe = true
      mesh.material = material
    })
  }, [clone, colorNode])

  const { actions } = useAnimations(animations, clone)

  useEffect(() => {
    actions[WALK_CLIP]?.play()
  }, [actions])

  return <primitive object={clone} />
}
