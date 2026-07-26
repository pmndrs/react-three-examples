import { defineConfig } from '@playwright/test'

// WebGPU CI per research/webgpu-ci-github.md:
// - Linux headless Chromium NEVER presents the WebGPU canvas (black screenshots, no
//   flag fixes it) → CI runs HEADED under xvfb-run with SwiftShader Vulkan.
// - macOS (local dev): new-headless full Chromium (channel 'chromium') does WebGPU on
//   Metal; the default headless-shell build does not.
const LINUX = process.platform === 'linux'

const WEBGPU_ARGS = [
  '--enable-unsafe-webgpu',
  ...(LINUX
    ? [
        '--enable-features=Vulkan',
        '--use-angle=vulkan',
        '--use-vulkan=swiftshader',
        '--use-webgpu-adapter=swiftshader',
      ]
    : []),
]

export default defineConfig({
  testDir: 'tests',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chromium', // full build + new headless — headless-shell lacks WebGPU
    launchOptions: {
      headless: !LINUX, // headed under Xvfb on Linux (see above)
      args: WEBGPU_ARGS,
    },
  },
  webServer: {
    command: 'pnpm dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
})
