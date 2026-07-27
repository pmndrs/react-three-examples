// The skinned runner: bone-driven motion vectors (the velocity node tracks the
// previous frame's skinning state, so limbs smear individually).
import { useEffect, useLayoutEffect } from 'react'
import { useAnimations, useGLTF } from '@react-three/drei/webgpu'
import type { Mesh } from 'three/webgpu'

const XBOT_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Xbot.glb'

// The original plays `gltf.animations[3]` by index; that clip is named "run" in
// Xbot.glb (confirmed against the glb's animation table) — playing by name matches
// this repo's convention (never blind indices).
const RUN_CLIP = 'run'

export interface XbotRunnerProps {
  speed: number
}

export function XbotRunner({ speed }: XbotRunnerProps) {
  const { scene, animations } = useGLTF(XBOT_URL)
  const { actions, mixer } = useAnimations(animations, scene)

  // Shadow flags before the first render pass reads the scene.
  useLayoutEffect(() => {
    scene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
  }, [scene])

  useEffect(() => {
    actions[RUN_CLIP]?.play()
  }, [actions])

  // Original: `mixer.update(delta * speed)` — drei's useAnimations owns the mixer
  // update loop here, so speed maps onto mixer.timeScale (same result).
  useEffect(() => {
    mixer.timeScale = speed
  }, [mixer, speed])

  return <primitive object={scene} rotation-y={Math.PI / 2} />
}
