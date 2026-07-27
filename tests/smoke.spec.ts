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

for (const { slug, ...meta } of examples) {
  const ciSkip = 'ciSkip' in meta ? String(meta.ciSkip) : undefined
  test(`${slug}: WebGPU context, readiness signal, non-black canvas`, async ({ page }) => {
    // Exception list (SPEC §10, three.js-CI prior art): examples too heavy for
    // SwiftShader declare ciSkip WITH A REASON in the manifest. They still run locally.
    test.skip(Boolean(process.env.CI && ciSkip), ciSkip)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const text = message.text()
      if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return
      errors.push(`console.error: ${text}`)
    })

    await page.goto(`/examples/${slug}`)

    // Readiness = loaders settled + clean frames (window.__exampleReady, set by
    // <ReadinessSignal> inside DemoHelpers). Poll instead of sleeping. CI gets a
    // bigger budget: SwiftShader renders heavy examples at ~1 fps, so settle frames
    // cost real wall-clock there (verified: 30 instances + blur blew 60s twice).
    try {
      await page.waitForFunction(() => window.__exampleReady === true, undefined, {
        timeout: process.env.CI ? 180_000 : 60_000,
      })
    } catch (cause) {
      // Readiness timeouts are usually a dead render loop, not slowness — surface
      // everything the page said so CI logs are diagnosable without an artifact dig.
      throw new Error(
        `readiness timeout for ${slug}; page reported ${errors.length} error(s):\n` +
          (errors.join('\n') || '(no console/page errors captured)'),
        { cause },
      )
    }

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
