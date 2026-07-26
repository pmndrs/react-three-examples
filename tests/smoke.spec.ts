// Smoke tier (SPEC §10 tier 1): every example initializes WebGPU, reaches the
// readiness signal, and presents a non-black canvas. No pixel goldens here —
// screenshot regression is a separate tier.
import { test, expect } from '@playwright/test'
import { PNG } from 'pngjs'
import examples from '../src/examples.json' with { type: 'json' }

// Console noise that is not an example defect.
const IGNORED_CONSOLE = [
  /Download the React DevTools/,
  /\[vite\]/,
]

for (const { slug } of examples) {
  test(`${slug}: WebGPU context, readiness signal, non-black canvas`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const text = message.text()
      if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return
      errors.push(`console.error: ${text}`)
    })

    await page.goto(`/examples/${slug}`)

    // Readiness = loaders settled + 30 clean frames (window.__exampleReady, set by
    // <ReadinessSignal> inside DemoHelpers). Poll instead of sleeping.
    await page.waitForFunction(() => window.__exampleReady === true, undefined, {
      timeout: 60_000,
    })

    // Real webgpu context, not a WebGL2 fallback: getContext returns the existing
    // context only if the canvas was created with the same type.
    const contextIsWebgpu = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      return canvas ? canvas.getContext('webgpu') !== null : false
    })
    expect(contextIsWebgpu, 'canvas context should be webgpu').toBe(true)

    const shot = await page.locator('canvas').first().screenshot()
    const png = PNG.sync.read(shot)
    let maxChannel = 0
    for (let i = 0; i < png.data.length; i += 4) {
      maxChannel = Math.max(maxChannel, png.data[i], png.data[i + 1], png.data[i + 2])
      if (maxChannel > 24) break
    }
    expect(maxChannel, 'canvas should not be black').toBeGreaterThan(24)

    expect(errors, errors.join('\n')).toEqual([])
  })
}

declare global {
  interface Window {
    __exampleReady?: boolean
  }
}
