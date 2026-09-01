/**
 * postprocessing-fxaa
 * A field of red tetrahedra, antialiased with FXAA — cheap, and reads its input in
 * sRGB, after tone mapping.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_fxaa
 *
 * DEMONSTRATES
 * - FXAA's color-space contract: it wants sRGB input, so `outputColorTransform =
 *   false` disables the pipeline's automatic post-transform and `renderOutput()`
 *   applies it manually before `fxaa()` reads it — the opposite of
 *   `postprocessing-smaa`'s contract
 * - Toggling the whole pass graph at runtime: `enabled` swaps
 *   `renderPipeline.outputNode` between the fxaa node and the plain output,
 *   `needsUpdate = true` commits it
 * - `<instancedMesh>` with matrices written once in `useLayoutEffect` — a static
 *   field, unlike `instance-mesh`'s per-frame version
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  Group,
  MeshStandardMaterial,
  NoToneMapping,
  Object3D,
  TetrahedronGeometry,
} from 'three/webgpu'
import type { InstancedMesh } from 'three/webgpu'
import { renderOutput } from 'three/tsl'
import { fxaa } from 'three/addons/tsl/display/FXAANode.js'
import { Canvas, useFrame, useRenderPipeline } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'

import { DemoHelpers } from '../../utils/DemoHelpers'

const COUNT = 100

//* Scene =========================================================

// A field of randomly transformed tetrahedra — the sole subject the FXAA pass gets
// to smooth. Matrices are written once (a static field), so the imperative loop runs
// in useLayoutEffect, before the first bounding-sphere computation.
function TetrahedronField() {
  const { animated } = useControls('FXAA', { animated: false })
  const groupRef = useRef<Group>(null)
  const meshRef = useRef<InstancedMesh>(null)

  const geometry = useMemo(() => new TetrahedronGeometry(), [])
  const material = useMemo(
    () => new MeshStandardMaterial({ color: 0xf73232, flatShading: true }),
    [],
  )

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const dummy = new Object3D()
    for (let i = 0; i < COUNT; i++) {
      dummy.position.set(Math.random() * 50 - 25, Math.random() * 50 - 25, Math.random() * 50 - 25)
      dummy.scale.setScalar(Math.random() * 2 + 1)
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [geometry, material])

  useFrame(({ delta }) => {
    if (!animated) return
    const group = groupRef.current
    if (!group) return
    group.rotation.y += delta * 0.1
  })

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[geometry, material, COUNT]} />
    </group>
  )
}

//* Post-processing ===============================================

function FXAAPipeline() {
  const { enabled } = useControls('FXAA', { enabled: true })
  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    // FXAA needs its input already tone-mapped and color-space converted — disable
    // the pipeline's own automatic pass and apply renderOutput() manually below.
    renderPipeline.outputColorTransform = false

    const scenePassColor = passes.scenePass.getTextureNode()
    const outputPass = renderOutput(scenePassColor)
    const fxaaPass = fxaa(outputPass)
    renderPipeline.outputNode = fxaaPass

    return { outputPass, fxaaPass }
  })

  useEffect(() => {
    const outputPass = passes.outputPass as ReturnType<typeof renderOutput> | undefined
    const fxaaPass = passes.fxaaPass as ReturnType<typeof fxaa> | undefined
    if (!renderPipeline || !outputPass || !fxaaPass) return
    renderPipeline.outputNode = enabled ? fxaaPass : outputPass
    renderPipeline.needsUpdate = true
  }, [renderPipeline, passes, enabled])

  return null
}

export default function PostprocessingFxaa() {
  return (
    <Canvas
      // Original never sets a tone mapping (WebGPURenderer default) — fiber's Canvas
      // would otherwise default to ACESFilmic.
      renderer={{ toneMapping: NoToneMapping }}
      background="#ffffff"
      camera={{ position: [0, 0, 50], fov: 45, near: 0.1, far: 200 }}
    >
      <hemisphereLight args={['#ffffff', '#8d8d8d']} position={[0, 1000, 0]} />
      <directionalLight color="#ffffff" intensity={3} position={[-3000, 1000, -1000]} />
      <TetrahedronField />
      <FXAAPipeline />
      <DemoHelpers grid={false} maxDistance={150} />
    </Canvas>
  )
}
