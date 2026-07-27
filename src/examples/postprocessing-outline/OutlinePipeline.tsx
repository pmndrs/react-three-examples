// Outline render pipeline: the OutlineNode addon renders depth/mask/edge/blur passes
// for the selected objects each frame, and this component composes its
// `visibleEdge`/`hiddenEdge` masks with user uniforms into an outline color that is
// added on top of the scene pass — the exact graph the original builds.
import { useEffect } from 'react'
import type { RefObject } from 'react'
import { useRenderPipeline } from '@react-three/fiber/webgpu'
import { outline } from 'three/addons/tsl/display/OutlineNode.js'
import { oscSine, time, uniform } from 'three/tsl'
import { Color } from 'three/webgpu'
import type { Object3D, UniformNode } from 'three/webgpu'

export interface OutlinePipelineProps {
  /** Stable array of hovered objects — mutated in place by the pointer handler. */
  selectionRef: RefObject<Object3D[]>
  edgeStrength: number
  edgeGlow: number
  edgeThickness: number
  pulsePeriod: number
  visibleEdgeColor: string
  hiddenEdgeColor: string
}

// Pattern (c): `outline()` takes Node-typed knobs (`edgeGlow`/`edgeThickness`) and the
// rest of the look is composed in user TSL — so, like the original, all six knobs are
// three/tsl `uniform()` nodes created in the mainCB, registered via return-to-register,
// and mutated (`.value`) from the effect below on leva changes. No rebuild, no cast.
export function OutlinePipeline({
  selectionRef,
  edgeStrength,
  edgeGlow,
  edgeThickness,
  pulsePeriod,
  visibleEdgeColor,
  hiddenEdgeColor,
}: OutlinePipelineProps) {
  const { passes } = useRenderPipeline(({ renderPipeline, passes, scene, camera }) => {
    if (!renderPipeline) return

    // Initial values come from the closure ONCE (pipeline callbacks never re-run on
    // re-render); every later change flows through the registered uniforms below.
    const uEdgeStrength = uniform(edgeStrength)
    const uEdgeGlow = uniform(edgeGlow)
    const uEdgeThickness = uniform(edgeThickness)
    const uPulsePeriod = uniform(pulsePeriod)
    const uVisibleEdgeColor = uniform(new Color(visibleEdgeColor))
    const uHiddenEdgeColor = uniform(new Color(hiddenEdgeColor))

    // The outline node re-reads `selectedObjects` every frame — the pointer handler
    // mutates the same array instance, so hover changes need no pipeline touch.
    const outlinePass = outline(scene, camera, {
      selectedObjects: selectionRef.current,
      edgeGlow: uEdgeGlow,
      edgeThickness: uEdgeThickness,
    })

    // Compose the outline color: visible and hidden edge masks tinted separately,
    // scaled by strength, with an optional oscSine pulse (run-time TSL select —
    // pulsePeriod 0 keeps the steady outline).
    const { visibleEdge, hiddenEdge } = outlinePass
    const period = time.div(uPulsePeriod).mul(2)
    const osc = oscSine(period).mul(0.5).add(0.5) // osc [0.5, 1.0]

    const outlineColor = visibleEdge
      .mul(uVisibleEdgeColor)
      .add(hiddenEdge.mul(uHiddenEdgeColor))
      .mul(uEdgeStrength)
    const outlinePulse = uPulsePeriod.greaterThan(0).select(outlineColor.mul(osc), outlineColor)

    renderPipeline.outputNode = outlinePulse.add(passes.scenePass)

    return {
      outlinePass,
      uEdgeStrength,
      uEdgeGlow,
      uEdgeThickness,
      uPulsePeriod,
      uVisibleEdgeColor,
      uHiddenEdgeColor,
    }
  })

  useEffect(() => {
    // Only `.value` is touched, so the node-type param can stay unknown.
    const uEdgeStrength = passes.uEdgeStrength as UniformNode<unknown, number> | undefined
    const uEdgeGlow = passes.uEdgeGlow as UniformNode<unknown, number> | undefined
    const uEdgeThickness = passes.uEdgeThickness as UniformNode<unknown, number> | undefined
    const uPulsePeriod = passes.uPulsePeriod as UniformNode<unknown, number> | undefined
    const uVisibleEdgeColor = passes.uVisibleEdgeColor as UniformNode<unknown, Color> | undefined
    const uHiddenEdgeColor = passes.uHiddenEdgeColor as UniformNode<unknown, Color> | undefined
    if (
      !uEdgeStrength ||
      !uEdgeGlow ||
      !uEdgeThickness ||
      !uPulsePeriod ||
      !uVisibleEdgeColor ||
      !uHiddenEdgeColor
    )
      return
    uEdgeStrength.value = edgeStrength
    uEdgeGlow.value = edgeGlow
    uEdgeThickness.value = edgeThickness
    uPulsePeriod.value = pulsePeriod
    uVisibleEdgeColor.value.set(visibleEdgeColor)
    uHiddenEdgeColor.value.set(hiddenEdgeColor)
  }, [passes, edgeStrength, edgeGlow, edgeThickness, pulsePeriod, visibleEdgeColor, hiddenEdgeColor])

  return null
}
