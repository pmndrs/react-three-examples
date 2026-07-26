// Render-readiness signal (SPEC §10) — the three.js-CI `_renderFinished` pattern.
// Playwright waits on `window.__exampleReady` instead of sleeping: true once all
// loader activity has settled AND 30 consecutive frames have completed since.
// Rides inside <DemoHelpers>, so every example emits it with zero wiring.
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useProgress } from '@react-three/drei/core'

declare global {
  interface Window {
    __exampleReady?: boolean
  }
}

const SETTLE_FRAMES = 30

export function ReadinessSignal() {
  const settled = useRef(0)
  const { active } = useProgress()

  useEffect(() => {
    window.__exampleReady = false
    return () => {
      window.__exampleReady = false
    }
  }, [])

  useFrame(() => {
    if (active) {
      settled.current = 0
      return
    }
    if (settled.current < SETTLE_FRAMES) {
      settled.current += 1
      if (settled.current === SETTLE_FRAMES) window.__exampleReady = true
    }
  }, { phase: 'finish' })

  return null
}
