// Render-readiness signal (SPEC §10) — the three.js-CI `_renderFinished` pattern.
// Playwright waits on `window.__exampleReady` instead of sleeping: true once all
// loader activity has settled AND 30 consecutive frames have completed since.
// Rides inside <DemoHelpers>, so every example emits it with zero wiring.
//
// NOTE: reads drei's useProgress store NON-reactively (getState() inside useFrame).
// Subscribing would re-render this component when a loader starts — and loaders can
// start synchronously during another component's render, which React flags as
// "cannot update a component while rendering a different component".
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useProgress } from '@react-three/drei/core'

declare global {
  interface Window {
    __exampleReady?: boolean
  }
}

// Kept low: on CI's SwiftShader (software raster) heavy examples run at ~1 fps,
// so every settle frame costs real wall-clock against the smoke timeout.
const SETTLE_FRAMES = 12

export function ReadinessSignal() {
  const settled = useRef(0)

  useEffect(() => {
    window.__exampleReady = false
    return () => {
      window.__exampleReady = false
    }
  }, [])

  useFrame(() => {
    if (useProgress.getState().active) {
      settled.current = 0
      window.__exampleReady = false
      return
    }
    if (settled.current < SETTLE_FRAMES) {
      settled.current += 1
      if (settled.current === SETTLE_FRAMES) window.__exampleReady = true
    }
  }, { phase: 'finish' })

  return null
}
