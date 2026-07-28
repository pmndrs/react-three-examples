/**
 * postprocessing-fxaa
 * R3F port of three.js `webgpu_postprocessing_fxaa`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_fxaa (~150 lines of JS)
 *
 * DEMONSTRATES
 * - FXAA's color-space contract: the addon's own doc comment says it "must be
 *   computed in sRGB color space (so after tone mapping and color space
 *   conversion)" — so `renderPipeline.outputColorTransform = false` disables the
 *   pipeline's automatic post-transform, and `renderOutput(scenePass)` applies that
 *   transform manually BEFORE `fxaa()` reads it. Same shape reused by
 *   `postprocessing-ca` in this batch; contrast with `postprocessing-smaa`, whose
 *   node explicitly wants the OPPOSITE (pre-sRGB) input and leaves the automatic
 *   transform on
 * - Runtime pipeline toggle: leva `enabled` swaps `renderPipeline.outputNode`
 *   between the fxaa node and the plain tone-mapped output, `needsUpdate = true`
 *   commits it
 * - `<instancedMesh>` with matrices written once in `useLayoutEffect` (a static
 *   field, unlike `instance-mesh`'s per-frame version) — 100 randomly transformed
 *   tetrahedra, matching the original's `setMatrixAt` loop
 *
 * DIVERGENCE from original
 * - The original has no camera controls at all (a fixed `camera.position.z = 50`);
 *   DemoHelpers baseline (grid disabled, camera controls enabled) added per this
 *   repo's convention of always including it
 * - `group.rotation.y += delta * 0.1` is already frame-rate independent in the
 *   original (it multiplies by `timer.getDelta()`) — ported as-is, no scaling needed
 * - `renderer.inspector.createParameters` panel replaced by leva `enabled` /
 *   `animated` toggles (same two knobs, same defaults)
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useRenderPipeline } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { renderOutput } from 'three/tsl'
import { fxaa } from 'three/addons/tsl/display/FXAANode.js'
import {
  Group,
  MeshStandardMaterial,
  NoToneMapping,
  Object3D,
  TetrahedronGeometry,
} from 'three/webgpu'
import type { InstancedMesh } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const COUNT = 100

// A field of randomly transformed tetrahedra — the sole subject the FXAA pass gets
// to smooth. Matrices are written once (a static field), so the imperative loop runs
// in useLayoutEffect, before the first bounding-sphere computation.
function TetrahedronField({ animated }: { animated: boolean }) {
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

  useFrame((_, delta) => {
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

function FXAAPipeline({ enabled }: { enabled: boolean }) {
  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    if (!renderPipeline) return

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
    if (!renderPipeline) return
    const outputPass = passes.outputPass as ReturnType<typeof renderOutput> | undefined
    const fxaaPass = passes.fxaaPass as ReturnType<typeof fxaa> | undefined
    if (!outputPass || !fxaaPass) return
    renderPipeline.outputNode = enabled ? fxaaPass : outputPass
    renderPipeline.needsUpdate = true
  }, [renderPipeline, passes, enabled])

  return null
}

export default function PostprocessingFxaa() {
  const { enabled, animated } = useControls('postprocessing-fxaa', {
    enabled: true,
    animated: false,
  })

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
      <TetrahedronField animated={animated} />
      <FXAAPipeline enabled={enabled} />
      <DemoHelpers grid={false} maxDistance={150} />
    </Canvas>
  )
}
