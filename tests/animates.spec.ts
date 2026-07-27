// Animation tier (tier 1.5): every example that should animate visibly changes
// pixels between two frames. Exists because the smoke tier's non-black check
// shipped three B17-frozen examples, and the B17/B18 dual-root freeze passes
// console assertions while frozen (see AGENTS.md changelog v0.12/v0.19) — only
// a pixel diff catches that state.
//
// Manifest flags:
//   "static": true            — example is static by design (GUI/pointer-driven,
//                               single bake, product shot); test asserts a live
//                               frame loop + clean console instead of motion.
//   "animationWindowMs": n    — override the frame-B delay for stop-go easings
//                               (postprocessing-pixel rests ~2s between moves).
//
// Run via `pnpm test:animates` — kept out of the default smoke gate to keep the
// per-pair loop fast; CI runs it as its own job.
import { test, expect } from '@playwright/test'
import { PNG } from 'pngjs'
import examples from '../src/examples.json' with { type: 'json' }

const DEFAULT_WINDOW_MS = 2200
const DIFF_THRESHOLD_PX = 100
const CHANNEL_TOLERANCE = 4

declare global {
  interface Window {
    __exampleReady?: boolean
    __frameCount?: number
  }
}

function diffPixels(a: PNG, b: PNG): number {
  let diff = 0
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.abs(a.data[i] - b.data[i]) > CHANNEL_TOLERANCE ||
      Math.abs(a.data[i + 1] - b.data[i + 1]) > CHANNEL_TOLERANCE ||
      Math.abs(a.data[i + 2] - b.data[i + 2]) > CHANNEL_TOLERANCE
    )
      diff++
  }
  return diff
}

for (const { slug, ...meta } of examples) {
  const ciSkip = 'ciSkip' in meta ? String(meta.ciSkip) : undefined
  const isStatic = 'static' in meta && meta.static === true
  const windowMs = 'animationWindowMs' in meta ? Number(meta.animationWindowMs) : DEFAULT_WINDOW_MS
  // Ledgered defects (UPSTREAM.md brief) that this tier detects but which are
  // upstream's to fix — skip WITH the reason so they stay visible in reports.
  const animatesSkip = 'animatesSkip' in meta ? String(meta.animatesSkip) : undefined

  test(`${slug}: ${isStatic ? 'static-by-design (live loop, clean console)' : 'animates'}`, async ({
    page,
  }) => {
    test.skip(Boolean(process.env.CI && ciSkip), ciSkip)
    test.skip(Boolean(animatesSkip), animatesSkip)

    const suspicious: string[] = []
    page.on('console', (message) => {
      const text = message.text()
      // The dual-root fingerprint and its precursor — warnings, so the smoke
      // tier's error-only capture misses them (AGENTS.md v0.19).
      if (/createRoot should only be called once/.test(text)) suspicious.push(text)
      if (/Cannot update a component/.test(text)) suspicious.push(text)
    })

    await page.goto(`/examples/${slug}`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__exampleReady === true, null, {
      timeout: process.env.CI ? 180_000 : 60_000,
    })
    await page.waitForTimeout(400)

    const canvas = page.locator('canvas').first()
    const frameA = PNG.sync.read(await canvas.screenshot())
    const countA = await page.evaluate(() => window.__frameCount ?? 0)
    await page.waitForTimeout(windowMs)
    const frameB = PNG.sync.read(await canvas.screenshot())
    const countB = await page.evaluate(() => window.__frameCount ?? 0)

    // Dual-root fingerprint: warnings present, or the loop died entirely.
    expect(suspicious, suspicious.join('\n')).toEqual([])
    expect(countB - countA, 'frame loop must be alive').toBeGreaterThan(5)

    if (!isStatic) {
      const diff = diffPixels(frameA, frameB)
      expect(
        diff,
        `expected visible animation; ${diff}px changed over ${windowMs}ms (frozen? see AGENTS.md B17/B18)`,
      ).toBeGreaterThan(DIFF_THRESHOLD_PX)
    }
  })
}
