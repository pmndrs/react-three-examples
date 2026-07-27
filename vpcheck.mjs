import { chromium } from '@playwright/test'
import { PNG } from 'pngjs'
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu'] })
for (const slug of process.argv.slice(2)) {
  const page = await browser.newPage({ viewport: { width: 512, height: 384 } })
  await page.goto(`http://localhost:5173/examples/${slug}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__exampleReady === true, null, { timeout: 90000 })
  await page.waitForTimeout(600)
  const a = PNG.sync.read(await page.screenshot())
  await page.waitForTimeout(1500)
  const b = PNG.sync.read(await page.screenshot())
  let diff = 0
  for (let i = 0; i < a.data.length; i += 4)
    if (Math.abs(a.data[i]-b.data[i])>4 || Math.abs(a.data[i+1]-b.data[i+1])>4 || Math.abs(a.data[i+2]-b.data[i+2])>4) diff++
  console.log(`${slug}: viewport diff ${diff} px`)
  await page.close()
}
await browser.close()
