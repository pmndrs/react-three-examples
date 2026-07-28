/**
 * postprocessing-smaa
 * R3F port of three.js `webgpu_postprocessing_smaa`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_smaa (~130 lines of JS)
 *
 * DEMONSTRATES
 * - SMAA's OPPOSITE color-space contract to FXAA: the addon's own doc comment says
 *   "unlike FXAA, this node should be applied BEFORE converting colors to sRGB" — so
 *   `smaa(scenePass)` reads the scene pass texture directly (no manual
 *   `renderOutput()` pre-step) and the pipeline's default
 *   `outputColorTransform = true` performs the tone-map/color-space conversion
 *   AFTER the SMAA resolve. Contrast with `postprocessing-fxaa`/`postprocessing-ca`
 *   in this batch, which both need the opposite ordering
 * - Runtime pipeline toggle: leva `enabled` swaps `renderPipeline.outputNode`
 *   between the smaa node and the raw scene pass, `needsUpdate = true` commits it
 * - A wireframe box next to a textured box — the classic aliasing-comparison rig:
 *   long thin diagonal edges (wireframe) and a high-frequency brick texture, the two
 *   cases SMAA is built to smooth
 *
 * DIVERGENCE from original
 * - The original has no camera controls at all (a fixed `camera.position.z = 300`);
 *   DemoHelpers baseline (grid disabled, camera controls enabled) added per this
 *   repo's convention of always including it
 * - Per-frame rotation increments (`rotation.x += 0.005`, `rotation.y += 0.01`) were
 *   frame-rate-DEPENDENT in the original (no delta multiplication) — delta-scaled
 *   here (`0.3` / `0.6` rad/s ≈ the original's per-frame increments at 60 fps),
 *   matching the convention already used in `postprocessing`
 * - `renderer.inspector.createParameters` panel replaced by leva `enabled` /
 *   `autoRotate` toggles (same two knobs, same defaults)
 */
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useRenderPipeline } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { smaa } from 'three/addons/tsl/display/SMAANode.js'
import { BoxGeometry, MeshBasicMaterial, NoToneMapping, SRGBColorSpace } from 'three/webgpu'
import type { Mesh } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const BRICK_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/brick_diffuse.jpg'

interface BoxesProps {
  autoRotate: boolean
}

// A wireframe box (thin diagonal edges) and a brick-textured box (high-frequency
// detail) side by side — the two aliasing cases SMAA is built to smooth.
function Boxes({ autoRotate }: BoxesProps) {
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

  useFrame((_, delta) => {
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

function SMAAPipeline({ enabled }: { enabled: boolean }) {
  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    if (!renderPipeline) return

    const scenePassColor = passes.scenePass.getTextureNode()
    const smaaPass = smaa(scenePassColor)
    renderPipeline.outputNode = smaaPass

    return { smaaPass }
  })

  useEffect(() => {
    if (!renderPipeline) return
    const smaaPass = passes.smaaPass as ReturnType<typeof smaa> | undefined
    const scenePass = passes.scenePass
    if (!smaaPass || !scenePass) return
    renderPipeline.outputNode = enabled ? smaaPass : scenePass.getTextureNode()
    renderPipeline.needsUpdate = true
  }, [renderPipeline, passes, enabled])

  return null
}

export default function PostprocessingSmaa() {
  const { enabled, autoRotate } = useControls('postprocessing-smaa', {
    enabled: true,
    autoRotate: true,
  })

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
      <SMAAPipeline enabled={enabled} />
      <Suspense fallback={null}>
        <Boxes autoRotate={autoRotate} />
      </Suspense>
      <DemoHelpers grid={false} maxDistance={900} />
    </Canvas>
  )
}
