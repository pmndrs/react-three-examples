/**
 * materials-alphahash
 * R3F port of three.js `webgpu_materials_alphahash`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materials_alphahash (~150 lines of JS)
 *
 * DEMONSTRATES
 * - `alphaHash` stochastic (order-independent) transparency on a plain
 *   `MeshStandardMaterial` vs classic sorted alpha blending — toggle it off to see
 *   the InstancedMesh sorting artifacts hash-dithering exists to avoid
 * - The material-path flip the toggle requires: `transparent` and `depthWrite` move
 *   OPPOSITE to `alphaHash` (hash renders as dithered-opaque), committed with
 *   `needsUpdate = true` in an effect — a runtime shader-path rebuild
 * - Whole-pipeline replacement in `useRenderPipeline`: `renderPipeline.outputNode =
 *   ssaaPass(scene, camera)` — brute-force supersampling accumulates jittered
 *   re-renders to resolve the hash noise; `sampleLevel` (2^n samples) is a plain
 *   per-frame-read property, mutated in an effect with no rebuild (no uniform — the
 *   pass reads it on every `updateBefore`)
 * - Per-instance colors via `setColorAt` in `useLayoutEffect` — the instanceColor
 *   buffer must exist before the first shader-graph build reads the mesh
 * - RoomEnvironment → `PMREMGenerator.fromScene` IBL as the sole light source, the
 *   imperative escape hatch kept visible in its owner component
 *
 * DIVERGENCE from original
 * - The original reads the grid side length from a `?<n>` URL query param (default
 *   3); here it's a leva `amount` slider, and the InstancedMesh is remounted
 *   (`key={amount}`) since the instance buffer size is fixed at construction
 * - `renderer.inspector.createParameters` GUI replaced with leva — same knobs, same
 *   ranges (alpha, alphaHash, SSAA sampleLevel); `Inspector` itself dropped (this
 *   repo doesn't wire the three.js Inspector)
 * - OrbitControls (zoom AND pan disabled) replaced by the DemoHelpers
 *   camera-controls baseline: pan stays disabled, but dolly is allowed within
 *   [1.5, 20] — grid off, the cluster floats in black space
 * - The camera stays at [3,3,3] when `amount` changes (the original computed its
 *   position once, at page load, from the URL param)
 * - `renderer={{ toneMapping: NoToneMapping }}` set explicitly: the original renders
 *   with the WebGPURenderer default; fiber's Canvas would otherwise default to
 *   ACESFilmic and mute the random instance palette
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useRenderPipeline, useThree } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { ssaaPass } from 'three/addons/tsl/display/SSAAPassNode.js'
import {
  Color,
  IcosahedronGeometry,
  Matrix4,
  MeshStandardMaterial,
  NoToneMapping,
  PMREMGenerator,
} from 'three/webgpu'
import type { InstancedMesh, WebGPURenderer } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

// RoomEnvironment → PMREM → scene.environment: the scene's only light source
// (matches the original — no analytical lights, full intensity).
function RoomEnv() {
  const rawRenderer = useThree((s) => s.renderer)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    // PMREMGenerator wants the WebGPU renderer; useThree types the union even on
    // the /webgpu entry (upstream fiber gap, UPSTREAM.md B9).
    const renderer = rawRenderer as WebGPURenderer
    const environment = new RoomEnvironment()
    const pmremGenerator = new PMREMGenerator(renderer)
    const envRT = pmremGenerator.fromScene(environment, 0.04)
    scene.environment = envRT.texture
    environment.dispose()
    pmremGenerator.dispose()
    return () => {
      scene.environment = null
      envRT.dispose()
    }
  }, [rawRenderer, scene])

  return null
}

interface SphereGridProps {
  amount: number
  alpha: number
  alphaHash: boolean
}

// amount³ icosahedra in a centered grid, one InstancedMesh, random color per
// instance. Remounted by the parent when `amount` changes (fixed buffer size).
function SphereGrid({ amount, alpha, alphaHash }: SphereGridProps) {
  const count = amount ** 3
  const meshRef = useRef<InstancedMesh>(null)

  const geometry = useMemo(() => new IcosahedronGeometry(0.5, 3), [])
  const material = useMemo(
    () => new MeshStandardMaterial({ color: 0xffffff, alphaHash: true, opacity: 0.5 }),
    [],
  )

  // Static transforms + per-instance colors, written BEFORE the first RAF render:
  // the WebGPU shader-graph build reads the mesh once — setColorAt must have created
  // the instanceColor buffer by then (useLayoutEffect, not useEffect — AGENTS.md).
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const matrix = new Matrix4()
    const color = new Color()
    const offset = (amount - 1) / 2
    let i = 0
    for (let x = 0; x < amount; x++) {
      for (let y = 0; y < amount; y++) {
        for (let z = 0; z < amount; z++) {
          matrix.setPosition(offset - x, offset - y, offset - z)
          mesh.setMatrixAt(i, matrix)
          mesh.setColorAt(i, color.setHex(Math.random() * 0xffffff))
          i++
        }
      }
    }
  }, [amount])

  // Port of the original's onMaterialUpdate: alphaHash renders as dithered-OPAQUE
  // geometry, so `transparent` and `depthWrite` flip opposite to the toggle. The
  // shader path changes either way — commit with needsUpdate.
  useEffect(() => {
    material.opacity = alpha
    material.alphaHash = alphaHash
    material.transparent = !alphaHash
    material.depthWrite = alphaHash
    material.needsUpdate = true
  }, [material, alpha, alphaHash])

  return <instancedMesh ref={meshRef} args={[geometry, material, count]} />
}

// The whole pipeline IS the SSAA pass: it re-renders the scene 2^sampleLevel times
// with sub-pixel camera jitter and accumulates — resolving alphaHash's dither noise.
function SSAAPipeline({ sampleLevel }: { sampleLevel: number }) {
  const { passes } = useRenderPipeline(({ renderPipeline, scene, camera }) => {
    if (!renderPipeline) return

    const ssaa = ssaaPass(scene, camera)
    // SSAA supersedes MSAA, and the pass's accumulation target inherits the
    // renderer's sample count (fiber Canvas defaults to MSAA 4x) while its internal
    // per-sample clone stays single-sampled — the end-of-frame depth
    // copyTextureToTexture then fails WebGPU validation (sample count 1 vs 4).
    // Same rule as TRAA/depth-copy passes (AGENTS.md; pattern: postprocessing-ao).
    // Cast: PassNode's constructor stores `options` at runtime but @types/three's
    // PassNode declaration omits the field (UPSTREAM.md B11 cast family).
    ;(ssaa as unknown as { options: { samples?: number } }).options.samples = 0
    ssaa.sampleLevel = 3
    renderPipeline.outputNode = ssaa

    // Return to register — the effect below mutates sampleLevel without a rebuild.
    return { ssaa }
  })

  // sampleLevel is a plain property the pass re-reads every frame in updateBefore —
  // pattern (b)'s cousin with no uniform involved at all.
  useEffect(() => {
    const ssaa = passes.ssaa as ReturnType<typeof ssaaPass> | undefined
    if (!ssaa) return
    ssaa.sampleLevel = sampleLevel
  }, [passes, sampleLevel])

  return null
}

export default function MaterialsAlphaHash() {
  const { amount, alpha, alphaHash, sampleLevel } = useControls('materials-alphahash', {
    amount: { value: 3, min: 2, max: 6, step: 1 },
    alpha: { value: 0.5, min: 0, max: 1, step: 0.01 },
    alphaHash: true,
    sampleLevel: { value: 3, min: 0, max: 4, step: 1 },
  })

  return (
    <Canvas
      // Original renders with the WebGPURenderer default tone mapping (none) —
      // match it explicitly; fiber's Canvas default is ACESFilmic.
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [3, 3, 3], fov: 60, near: 0.1, far: 100 }}
    >
      <RoomEnv />
      <SphereGrid key={amount} amount={amount} alpha={alpha} alphaHash={alphaHash} />
      <SSAAPipeline sampleLevel={sampleLevel} />
      <DemoHelpers grid={false} pan={false} minDistance={1.5} maxDistance={20} />
    </Canvas>
  )
}
