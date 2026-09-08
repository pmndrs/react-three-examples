import { defineConfig } from '@playwright/test';

// WebGPU CI per research/webgpu-ci-github.md:
// - Linux headless Chromium NEVER presents the WebGPU canvas (black screenshots, no
//   flag fixes it) → CI runs HEADED under xvfb-run with SwiftShader Vulkan.
// - macOS (local dev): new-headless full Chromium (channel 'chromium') does WebGPU on
//   Metal; the default headless-shell build does not.
const LINUX = process.platform === 'linux';

const WEBGPU_ARGS = [
  '--enable-unsafe-webgpu',
  ...(LINUX
    ? ['--enable-features=Vulkan', '--use-angle=vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader']
    : []),
];

export default defineConfig({
  testDir: 'tests',
  timeout: process.env.CI ? 300_000 : 90_000,
  retries: process.env.CI ? 1 : 0,
  // `--shard` splits by FILE unless fullyParallel is on, and the whole corpus lives in
  // one spec file — so without this the CI matrix would hand shard 1 all 268 tests and
  // shards 2-4 nothing at all (verified with `--list`: 268 / 0 / 0 / 0). Sharding by
  // test needs fullyParallel; keeping `workers: 1` alongside it means each shard still
  // runs its quarter one at a time, so we get the 4x wall-clock win without stacking
  // concurrent WebGPU contexts on one software rasterizer (which is what was losing the
  // device — see tests/smoke.spec.ts CI_ENVIRONMENT_FAULTS). Local runs are unchanged:
  // serial, one worker, the oracle per SPEC §10.
  fullyParallel: Boolean(process.env.CI),
  workers: process.env.CI ? 1 : undefined,
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
});
