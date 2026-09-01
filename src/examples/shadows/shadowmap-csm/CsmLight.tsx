// Owns the CSMShadowNode + CSMHelper pair: builds them once per `cascades` (a
// structural rebuild, like shadowmap-array's TileShadowNode), then applies every other
// control (maxFar, mode, margin, shadow near/far, camera swap, helper visibility) as a
// live mutation + `updateFrustums()`/`updateVisibility()` — exactly what the original's
// GUI `onChange` handlers do, just as React effects instead of dat.gui callbacks.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CSMShadowNode, type CSMShadowNodeMode } from 'three/addons/csm/CSMShadowNode.js'
import { CSMHelper } from 'three/addons/csm/CSMHelper.js'
import type { DirectionalLight } from 'three/webgpu'

import { useFrame, useThree } from '@react-three/fiber/webgpu'
import { button, folder, useControls } from 'leva'

export interface CsmLightProps {
  lightDirection: [number, number, number]
}

function applyLightDirection(light: DirectionalLight, [x, y, z]: [number, number, number]) {
  light.position.set(x, y, z).normalize().multiplyScalar(-200)
}

export function CsmLight({ lightDirection }: CsmLightProps) {
  const [manualUpdateNonce, setManualUpdateNonce] = useState(0)
  const {
    shadowsEnabled,
    cascades,
    maxFar,
    mode,
    margin,
    shadowNear,
    shadowFar,
    helperVisible,
    displayFrustum,
    displayPlanes,
    displayShadowBounds,
    autoUpdateHelper,
  } = useControls('shadowmap-csm', {
    shadowsEnabled: { value: true, label: 'shadows' },
    cascades: { value: 4, min: 1, max: 4, step: 1 },
    maxFar: { value: 1000, min: 1, max: 5000, step: 1, label: 'max shadow far' },
    mode: {
      value: 'practical' as CSMShadowNodeMode,
      options: ['uniform', 'logarithmic', 'practical'] satisfies CSMShadowNodeMode[],
      label: 'split mode',
    },
    margin: { value: 100, min: 0, max: 200, label: 'light margin' },
    shadowNear: { value: 1, min: 1, max: 10000, label: 'shadow near' },
    shadowFar: { value: 2000, min: 1, max: 10000, label: 'shadow far' },
    helper: folder({
      helperVisible: { value: false, label: 'visible' },
      displayFrustum: { value: true, label: 'frustum' },
      displayPlanes: { value: true, label: 'planes' },
      displayShadowBounds: { value: true, label: 'shadow bounds' },
      autoUpdateHelper: { value: true, label: 'auto update' },
      'update now': button(() => setManualUpdateNonce((n) => n + 1)),
    }),
  })
  const lightRef = useRef<DirectionalLight>(null)
  const csmRef = useRef<CSMShadowNode | null>(null)
  const helperRef = useRef<CSMHelper | null>(null)
  const skipNextRef = useRef(true)
  const scene = useThree((s) => s.scene)
  // Whichever camera currently has `makeDefault` — the parent toggles this between its
  // PerspectiveCamera and OrthographicCamera (see header DIVERGENCE), so CSM just
  // follows fiber's own notion of "the active camera" instead of tracking two refs.
  const activeCamera = useThree((s) => s.camera)

  // Structural rebuild: cascades changes the length of csm.lights, which CSMShadowNode
  // only allocates in its lazy _init() — rebuild the node + helper rather than mutate.
  useLayoutEffect(() => {
    const light = lightRef.current
    if (!light) return

    const csm = new CSMShadowNode(light, { cascades, maxFar, mode })
    light.shadow.shadowNode = csm
    csmRef.current = csm

    const helper = new CSMHelper(csm)
    helper.visible = false
    scene.add(helper)
    helperRef.current = helper
    skipNextRef.current = true

    return () => {
      scene.remove(helper)
      light.shadow.shadowNode = undefined
      csmRef.current = null
      helperRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, cascades])

  useLayoutEffect(() => {
    applyLightDirection(lightRef.current!, lightDirection)
  }, [lightDirection])

  useEffect(() => {
    const csm = csmRef.current
    if (!csm) return
    csm.maxFar = maxFar
    csm.mode = mode
    // updateFrustums() dereferences csm.mainFrustum, only allocated once the light's
    // first shadow pass has run its lazy _init() — a control changed before that
    // first render (unlikely, but possible on fast leva edits) must not crash.
    if (csm.mainFrustum) csm.updateFrustums()
  }, [maxFar, mode])

  useEffect(() => {
    const csm = csmRef.current
    if (csm) csm.lightMargin = margin
  }, [margin])

  useEffect(() => {
    const csm = csmRef.current
    if (!csm) return
    for (const cascadeLight of csm.lights) {
      // csm.lights' JSDoc type (DirectionalLight[]) doesn't narrow `.shadow` past the
      // base Light class's optional field — every entry is a real per-cascade
      // DirectionalLightShadow clone by construction (CSMShadowNode._init()).
      if (!cascadeLight.shadow) continue
      cascadeLight.shadow.camera.near = shadowNear
      cascadeLight.shadow.camera.far = shadowFar
      cascadeLight.shadow.camera.updateProjectionMatrix()
    }
  }, [shadowNear, shadowFar])

  useEffect(() => {
    const csm = csmRef.current
    if (!csm) return
    csm.camera = activeCamera
    if (csm.mainFrustum) csm.updateFrustums()
  }, [activeCamera])

  useEffect(() => {
    const helper = helperRef.current
    if (helper) helper.visible = helperVisible
  }, [helperVisible])

  useEffect(() => {
    const helper = helperRef.current
    if (!helper) return
    helper.displayFrustum = displayFrustum
    helper.displayPlanes = displayPlanes
    helper.displayShadowBounds = displayShadowBounds
    helper.updateVisibility()
  }, [displayFrustum, displayPlanes, displayShadowBounds])

  useEffect(() => {
    if (manualUpdateNonce > 0) helperRef.current?.update()
  }, [manualUpdateNonce])

  // CSMShadowNode only allocates csm.lights/frustums during the light's first shadow
  // pass render; calling helper.update() any earlier is a no-op at best (mirrors
  // shadowmap-array's TileShadowNode race — skip exactly one frame per rebuild).
  useFrame(() => {
    if (skipNextRef.current) {
      skipNextRef.current = false
      return
    }
    if (autoUpdateHelper) helperRef.current?.update()
  })

  return (
    <directionalLight
      ref={lightRef}
      color="#ffffff"
      intensity={3}
      castShadow={shadowsEnabled}
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
    />
  )
}
