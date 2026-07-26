import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// fiber v10 alpha ships `.` and `./webgpu` as two separate builds of the same runtime
// (webgpu is a superset with the TSL hooks). drei/webgpu imports the root specifier while
// our code imports /webgpu — without this alias BOTH files load, creating two fiber
// runtimes (two React contexts, two reconcilers) and crashing every drei hook.
// TODO(upstream): fiber's root entry should re-export a shared chunk; drop this once fixed.
const fiberWebgpu = fileURLToPath(
  new URL('./node_modules/@react-three/fiber/dist/webgpu/index.mjs', import.meta.url),
)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [{ find: /^@react-three\/fiber(\/webgpu)?$/, replacement: fiberWebgpu }],
  },
})
