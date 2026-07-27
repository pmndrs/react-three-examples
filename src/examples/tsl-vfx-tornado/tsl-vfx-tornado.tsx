/**
 * tsl-vfx-tornado
 * R3F port of three.js `webgpu_tsl_vfx_tornado`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_tsl_vfx_tornado (~300 lines of JS)
 *
 * DEMONSTRATES
 * - Bruno Simon's stylized VFX tornado built from three cheap meshes and one RGB
 *   perlin texture (Tornado.tsx): a floor plate whose `outputNode` swirls two
 *   counter-scrolling radial noises into a glowing ring, plus two open cylinders
 *   whose `positionNode` re-radiuses every vertex along a parabola of its height —
 *   the funnel silhouette is pure vertex math over a stock CylinderGeometry
 * - Reusable TSL helper `Fn`s composed across three materials: `toRadialUv`
 *   (plane UV → polar scroll), `toSkewedUv` (shear for wind-dragged streaks) and
 *   `twistedCylinder` (parabola + sine turbulence), all animated by the TSL `time`
 *   built-in — zero per-frame JS
 * - Layered transparency doing volumetric work: an emissive core cylinder
 *   (luminance-normalized color × 1.2, alpha from multiplied noises) inside a
 *   slightly larger pure-black smoke shell, over a hard-thresholded emissive floor
 *   (×3, i.e. HDR) that only reads as fire once bloom picks it up
 * - `useRenderPipeline` with the return-to-register pattern: `bloom()`'s own
 *   `uniform()`-backed `.strength`/`.radius` fields are mutated in an effect on
 *   leva changes — no pipeline rebuild, no fiber uniform cast
 * - `useUniforms` create-or-update semantics for the tornado shape knobs
 *   (timeScale/parabol trio/emissive color) — every slider mutates live GPU
 *   uniforms, the node graphs never rebuild
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` panel becomes leva (same
 *   parameters, ranges, and defaults, bloom folder included); the Inspector addon
 *   itself is dropped (this repo's shell has no inspector; leva is the panel)
 * - `frustumCulled = false` on both twisted cylinders: `positionNode` reshapes the
 *   funnel on the GPU, and with the parabola knobs raised the radius exceeds the
 *   CPU geometry's culling sphere — the original has the same latent bug class and
 *   just never pans (rule established by tsl-galaxy)
 * - `useUniforms`' `UniformNode<T>` pins its TSL type param to `unknown`, and Fn's
 *   destructured params are untyped (fiber gap + UPSTREAM.md B10) — cast to
 *   `Node<'float'|'vec2'|'vec3'>` with comments, same family as tsl-raging-sea;
 *   the emissive cylinder's `parabolAmplitude - 0.05` goes through a `float()`
 *   wrapper for the same reason
 * - Fn parameters named `uv`/`time` in the original are renamed (`uvIn`, `timeIn`)
 *   to avoid shadowing the imported TSL builtins
 * - perlin noise texture hotlinked from jsdelivr @r185 and loaded via drei's
 *   suspending `useTexture` (wrap set to repeat in a layout effect, before the
 *   first shader build) instead of a bare `TextureLoader.load`
 * - OrbitControls → DemoHelpers' camera-controls baseline (same `target.y = 0.4`,
 *   `minDistance`/`maxDistance` 0.1/50); grid disabled — the tornado's own noise
 *   floor plate covers the origin and a grid would slice through it
 * - `renderer={{ toneMapping: ACESFilmicToneMapping }}` written explicitly: the
 *   original sets ACESFilmic on the renderer; fiber's Canvas happens to default to
 *   the same, but the corpus rule is to decide tone mapping deliberately per port
 * - Split into a folder (this file + Tornado.tsx): past the ~200-line threshold —
 *   split by scene role (page shell/post-processing vs the tornado node graphs,
 *   which need fiber hooks and so must live inside `<Canvas>`)
 */
import { Suspense, useEffect } from 'react'
import { Canvas, useRenderPipeline } from '@react-three/fiber/webgpu'
import { folder, useControls } from 'leva'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { ACESFilmicToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { Tornado } from './Tornado'

interface PostFXProps {
  strength: number
  radius: number
}

// Scene color + bloom, matching the original's RenderPipeline: the floor's ×3
// emissive cells and the luminance-normalized core blow past the bloom threshold (1)
// and read as fire.
function PostFX({ strength, radius }: PostFXProps) {
  const { passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    if (!renderPipeline) return

    const scenePassColor = passes.scenePass.getTextureNode('output')
    const bloomPass = bloom(scenePassColor, strength, radius, 1)
    renderPipeline.outputNode = scenePassColor.add(bloomPass)

    // Return to register — makes `bloomPass` available on `passes` so the effect
    // below can mutate its own uniform-backed fields without a pipeline rebuild.
    return { bloomPass }
  })

  useEffect(() => {
    const bloomPass = passes.bloomPass as ReturnType<typeof bloom> | undefined
    if (!bloomPass) return
    bloomPass.strength.value = strength
    bloomPass.radius.value = radius
  }, [passes, strength, radius])

  return null
}

export default function TslVfxTornado() {
  const { emissiveColor, timeScale, parabolStrength, parabolOffset, parabolAmplitude, ...bloomParams } =
    useControls('tsl-vfx-tornado', {
      emissiveColor: '#ff8b4d',
      timeScale: { value: 0.2, min: -1, max: 1, step: 0.01 },
      parabolStrength: { value: 1, min: 0, max: 2, step: 0.01 },
      parabolOffset: { value: 0.3, min: 0, max: 1, step: 0.01 },
      parabolAmplitude: { value: 0.2, min: 0, max: 2, step: 0.01 },
      bloom: folder({
        bloomStrength: { value: 1, min: 0, max: 10, step: 0.01, label: 'strength' },
        bloomRadius: { value: 0.1, min: 0, max: 1, step: 0.01, label: 'radius' },
      }),
    })

  return (
    <Canvas
      // The original sets ACESFilmic explicitly — written out here rather than
      // inherited from fiber's default, per the tone-mapping parity rule.
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      background="#201919"
      camera={{ position: [1, 1, 3], fov: 25, near: 0.1, far: 50 }}
    >
      <Suspense fallback={null}>
        <Tornado
          emissiveColor={emissiveColor}
          timeScale={timeScale}
          parabolStrength={parabolStrength}
          parabolOffset={parabolOffset}
          parabolAmplitude={parabolAmplitude}
        />
      </Suspense>

      <PostFX strength={bloomParams.bloomStrength} radius={bloomParams.bloomRadius} />

      <DemoHelpers grid={false} target={[0, 0.4, 0]} minDistance={0.1} maxDistance={50} />
    </Canvas>
  )
}
