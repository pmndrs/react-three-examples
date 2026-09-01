/**
 * postprocessing-smaa
 * A wireframe box next to a brick-textured box, antialiased with SMAA — pricier than
 * FXAA, and reads its input in linear space, before tone mapping.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_smaa
 *
 * DEMONSTRATES
 * - SMAA's color-space contract is the OPPOSITE of FXAA's: it wants linear input, so
 *   the pipeline's automatic tone-map/color-space pass stays ON and runs AFTER
 *   `smaa()` — no manual `renderOutput()` step, unlike `postprocessing-fxaa`
 * - Toggling the whole pass graph at runtime: `enabled` swaps
 *   `renderPipeline.outputNode` between the smaa node and the raw scene pass,
 *   `needsUpdate = true` commits it
 * - A wireframe box (thin diagonal edges) next to a textured box (high-frequency
 *   detail) — the two aliasing cases SMAA is built to smooth
 */
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { BoxGeometry, MeshBasicMaterial, NoToneMapping, SRGBColorSpace } from 'three/webgpu'
import type { Mesh } from 'three/webgpu'
import { smaa } from 'three/addons/tsl/display/SMAANode.js'
import { Canvas, useFrame, useRenderPipeline } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { useControls } from 'leva'

import { DemoHelpers } from '../../utils/DemoHelpers'

const BRICK_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/brick_diffuse.jpg'

//* Scene =========================================================

// A wireframe box (thin diagonal edges) and a brick-textured box (high-frequency
// detail) side by side — the two aliasing cases SMAA is built to smooth.
function Boxes() {
  const { autoRotate } = useControls('SMAA', { autoRotate: true })
  const wireRef = useRef<Mesh>(null)
  const texRef = useRef<Mesh>(null)

  const geometry = useMemo(() => new BoxGeometry(120, 120, 120), [])
  const wireMaterial = useMemo(
    () => new MeshBasicMaterial({ color: 0xffffff, wireframe: true }),
    [],
  )

  const brickTexture = useTexture(BRICK_URL)
  const texMaterial = useMemo(() => {
    brickTexture.colorSpace = SRGBColorSpace
    return new MeshBasicMaterial({ map: brickTexture })
  }, [brickTexture])

  useFrame(({ delta }) => {
    if (!autoRotate) return
    for (const ref of [wireRef, texRef]) {
      const mesh = ref.current
      if (!mesh) continue
      mesh.rotation.x += 0.3 * delta
      mesh.rotation.y += 0.6 * delta
    }
  })

  return (
    <>
      <mesh ref={wireRef} geometry={geometry} material={wireMaterial} position={[-100, 0, 0]} />
      <mesh ref={texRef} geometry={geometry} material={texMaterial} position={[100, 0, 0]} />
    </>
  )
}

//* Post-processing ===============================================

function SMAAPipeline() {
  const { enabled } = useControls('SMAA', { enabled: true })
  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    const scenePassColor = passes.scenePass.getTextureNode()
    const smaaPass = smaa(scenePassColor)
    renderPipeline.outputNode = smaaPass

    return { smaaPass }
  })

  useEffect(() => {
    const smaaPass = passes.smaaPass as ReturnType<typeof smaa> | undefined
    const scenePass = passes.scenePass
    if (!renderPipeline || !smaaPass || !scenePass) return
    renderPipeline.outputNode = enabled ? smaaPass : scenePass.getTextureNode()
    renderPipeline.needsUpdate = true
  }, [renderPipeline, passes, enabled])

  return null
}

export default function PostprocessingSmaa() {
  return (
    <Canvas
      // Original never sets a tone mapping (WebGPURenderer default) — fiber's Canvas
      // would otherwise default to ACESFilmic.
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 0, 300], fov: 70, near: 1, far: 1000 }}
    >
      {/* SMAAPipeline (a creator-hook component) renders BEFORE the suspending
          Boxes sibling — a creator hook after a suspending sibling can trigger the
          B18 setState-in-render escalation into a full B17 pixel freeze (AGENTS.md). */}
      <SMAAPipeline />
      <Suspense fallback={null}>
        <Boxes />
      </Suspense>
      <DemoHelpers grid={false} maxDistance={900} />
    </Canvas>
  )
}
