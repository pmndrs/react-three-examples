/**
 * animation-skinning-blending
 * R3F port of three.js `webgl_animation_skinning_blending`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgl_animation_skinning_blending (~480 lines of JS)
 *
 * DEMONSTRATES
 * - Skinned mesh animation with AnimationMixer weight blending (Idle/Walk/Run)
 * - `useGLTF` + `useAnimations` (drei/webgpu) replacing manual loader/mixer wiring
 * - v10 `background` Canvas option, `shadows`, declarative fog
 * - Escape hatch: weights are set imperatively on the actions (vanilla three API) —
 *   R3F is an AND with three.js, not an OR
 *
 * DIVERGENCE from original
 * - Crossfade buttons + single-step mode reduced to direct weight/timeScale controls (leva)
 * - Pause implemented via `mixer.timeScale = 0`
 * - DemoHelpers baseline (grid + camera controls) added; original had a fixed camera
 */
import { Suspense, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useAnimations, useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { Mesh, SkeletonHelper } from 'three'
import { DemoHelpers } from '../utils/DemoHelpers'

const SOLDIER_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Soldier.glb'

function Soldier() {
  const { scene, animations } = useGLTF(SOLDIER_URL)
  const { actions, mixer } = useAnimations(animations, scene)
  const skeletonHelper = useMemo(() => new SkeletonHelper(scene), [scene])

  const { idle, walk, run, timeScale, paused, skeleton } = useControls('animation', {
    idle: { value: 0, min: 0, max: 1 },
    walk: { value: 1, min: 0, max: 1 },
    run: { value: 0, min: 0, max: 1 },
    timeScale: { value: 1, min: 0, max: 1.5 },
    paused: false,
    skeleton: false,
  })

  useEffect(() => {
    scene.traverse((object) => {
      if ((object as Mesh).isMesh) object.castShadow = true
    })
  }, [scene])

  useEffect(() => {
    // Soldier.glb also ships a TPose clip — playing it (even at weight 1 default)
    // blends the rest pose into everything. Play only the three blendable clips.
    for (const name of ['Idle', 'Walk', 'Run']) actions[name]?.play()
  }, [actions])

  useEffect(() => {
    const weights: Record<string, number> = { Idle: idle, Walk: walk, Run: run }
    for (const [name, weight] of Object.entries(weights)) {
      const action = actions[name]
      if (!action) continue
      action.enabled = true
      action.setEffectiveTimeScale(1)
      action.setEffectiveWeight(weight)
    }
  }, [actions, idle, walk, run])

  useEffect(() => {
    mixer.timeScale = paused ? 0 : timeScale
  }, [mixer, paused, timeScale])

  return (
    <>
      <primitive object={scene} />
      {skeleton && <primitive object={skeletonHelper} />}
    </>
  )
}

export default function AnimationSkinningBlending() {
  return (
    <Canvas renderer shadows background="#a0a0a0" camera={{ position: [1, 2, -3], fov: 45 }}>
      <fog attach="fog" args={['#a0a0a0', 10, 50]} />
      <hemisphereLight intensity={3} color="#ffffff" groundColor="#8d8d8d" position={[0, 20, 0]} />
      <directionalLight
        position={[-3, 10, -10]}
        intensity={3}
        castShadow
        shadow-camera-top={2}
        shadow-camera-bottom={-2}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-near={0.1}
        shadow-camera-far={40}
      />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshPhongMaterial color="#cbcbcb" depthWrite={false} />
      </mesh>
      <Suspense fallback={null}>
        <Soldier />
      </Suspense>
      <DemoHelpers target={[0, 1, 0]} />
    </Canvas>
  )
}
