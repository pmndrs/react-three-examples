/**
 * compute-texture-pingpong
 * R3F port of three.js `webgpu_compute_texture_pingpong`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_compute_texture_pingpong (~120 lines of JS)
 *
 * DEMONSTRATES
 * - Ping-pong compute: two `StorageTexture`s alternate READ_ONLY/WRITE_ONLY roles
 *   every frame — one kernel blurs texture A into texture B, the next frame blurs B
 *   back into A — diffusing GPU-resident noise indefinitely with zero CPU readback
 * - `storageTexture(tex).setAccess(NodeAccess.READ_ONLY | WRITE_ONLY)`: the SAME
 *   underlying `StorageTexture` wrapped twice, once per access mode, so one kernel can
 *   read one buffer while writing the other
 * - `.load(uv)` (`TextureNode.sample(uv).setSampler(false)` — unfiltered, nearest-texel
 *   fetch) for the blur kernel's neighbor taps, vs `texture()`'s bilinear sampling used
 *   for final display — two different TSL texture-read paths in one example
 * - Branchless display selection: a boolean uniform flipped once per frame drives
 *   `select(uPhase, texture(pongTexture), texture(pingTexture))` in `colorNode` —
 *   no `material.map` reassignment or `needsUpdate` dance, the GPU picks per-fragment
 * - Periodic GPU reseed: every ~1 real second a fresh random pattern is recomputed
 *   straight into a texture (`computeInit`), keeping the diffusion visually alive
 *   indefinitely instead of decaying to a flat blur
 *
 * DIVERGENCE from original
 * - The original's `blur` helper is `Fn(([readTex, uv]) => ...)`. Ported as a plain
 *   build-time TypeScript closure instead: it never calls `.toVar()/.assign()`, so it
 *   doesn't need an active TSL stack (AGENTS.md's Fn-wrapper rule is specifically about
 *   those calls) — and a plain closure sidesteps the array-destructured `Fn` param
 *   typing gap (B10 family: destructured params type as bare `ShaderNodeObject<Node>`)
 *   entirely, since it's just TypeScript function parameters with real types
 * - Perspective camera + DemoHelpers orbit replaces the original's manually-resized
 *   `OrthographicCamera` (same rationale as this repo's `compute-texture`)
 * - `phase`/`lastUpdate` bookkeeping lives in plain `useRef`s instead of module-scope
 *   `let` bindings — imperative per-frame state that must never trigger a re-render
 * - `state.elapsed` (seconds, v10's clock replacement) stands in for the original's
 *   `performance.now() / 1000`
 * - `renderer.inspector` wiring dropped (no Inspector slot in this repo's shell); the
 *   example has no user-facing controls in the original either (leva panel omitted)
 */
import { useRef } from 'react'
import { Canvas, useFrame, useGPUStorage, useNodes, useThree } from '@react-three/fiber/webgpu'
import {
  Fn,
  NodeAccess,
  float,
  instanceIndex,
  select,
  storageTexture,
  textureStore,
  texture,
  uniform,
  uvec2,
  ivec2,
  int,
  vec2,
  vec4,
} from 'three/tsl'
import { HalfFloatType, StorageTexture, Vector2 } from 'three/webgpu'
import type { Node, StorageTextureNode, WebGPURenderer } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const WIDTH = 512
const HEIGHT = 512

// Plain build-time closure, not a TSL Fn — see header DIVERGENCE. `.load()` clones
// internally (TextureNode.sample -> this.clone()), so calling it 5x on the same
// `readTex` reference is safe, each call is non-mutating.
function blur5(readTex: StorageTextureNode, uv: Node<'ivec2'>) {
  return readTex
    .load(uv.add(ivec2(-1, 1)))
    .add(readTex.load(uv.add(ivec2(-1, -1))))
    .add(readTex.load(uv.add(ivec2(0, 0))))
    .add(readTex.load(uv.add(ivec2(1, -1))))
    .add(readTex.load(uv.add(ivec2(1, 1))))
    .div(5.0)
}

function PingPongPlane() {
  const rawRenderer = useThree((s) => s.renderer)
  // Cast: useThree types renderer as the WebGL/WebGPU union even on the `/webgpu`
  // entry (fiber typing gap, UPSTREAM.md B9) — `.compute()` exists only on WebGPURenderer.
  const renderer = rawRenderer as WebGPURenderer

  // Two HDR storage textures, create-once (StrictMode-safe).
  const { pingTexture, pongTexture } = useGPUStorage(() => {
    const ping = new StorageTexture(WIDTH, HEIGHT)
    const pong = new StorageTexture(WIDTH, HEIGHT)
    ping.type = HalfFloatType
    pong.type = HalfFloatType
    return { pingTexture: ping, pongTexture: pong }
  }, 'computeTexturePingPong') // WGSL-identifier rule: camelCase scope, never kebab-case

  // ROOT-LEVEL useNodes on purpose (UPSTREAM.md B16): a scoped call would name entries
  // `${scope}.${name}`, and these nodes reach WGSL codegen (storage-texture bindings).
  const { computeInit, computeToPing, computeToPong, uSeed, uPhase, colorNode } = useNodes(() => {
    const uSeed = uniform(new Vector2())
    // Flipped once per frame in useFrame below; drives the branchless display select.
    const uPhase = uniform(true)

    const rand2 = (n: Node<'vec2'>) => n.dot(vec2(12.9898, 4.1414)).sin().mul(43758.5453).fract()

    const writePing = storageTexture(pingTexture).setAccess(NodeAccess.WRITE_ONLY)
    const readPing = storageTexture(pingTexture).setAccess(NodeAccess.READ_ONLY)
    const writePong = storageTexture(pongTexture).setAccess(NodeAccess.WRITE_ONLY)
    const readPong = storageTexture(pongTexture).setAccess(NodeAccess.READ_ONLY)

    const computeInit = Fn(() => {
      const posX = instanceIndex.mod(WIDTH)
      const posY = instanceIndex.div(WIDTH)
      const indexUV = uvec2(posX, posY)
      const uv = vec2(float(posX).div(WIDTH), float(posY).div(HEIGHT))

      const r = rand2(uv.add(uSeed.mul(100))).sub(rand2(uv.add(uSeed.mul(300))))
      const g = rand2(uv.add(uSeed.mul(200))).sub(rand2(uv.add(uSeed.mul(300))))
      const b = rand2(uv.add(uSeed.mul(200))).sub(rand2(uv.add(uSeed.mul(100))))

      textureStore(writePing, indexUV, vec4(r, g, b, 1))
    })().compute(WIDTH * HEIGHT)

    // Read one buffer, blur, write the other — built twice, once per direction.
    const computeToPong = Fn(() => {
      const posX = instanceIndex.mod(WIDTH)
      const posY = instanceIndex.div(WIDTH)
      const indexUV = ivec2(int(posX), int(posY))

      const blurred = blur5(readPing, indexUV)
      textureStore(writePong, indexUV, vec4(blurred.rgb.mul(1.05), 1))
    })().compute(WIDTH * HEIGHT)

    const computeToPing = Fn(() => {
      const posX = instanceIndex.mod(WIDTH)
      const posY = instanceIndex.div(WIDTH)
      const indexUV = ivec2(int(posX), int(posY))

      const blurred = blur5(readPong, indexUV)
      textureStore(writePing, indexUV, vec4(blurred.rgb.mul(1.05), 1))
    })().compute(WIDTH * HEIGHT)

    return {
      computeInit,
      computeToPing,
      computeToPong,
      uSeed,
      uPhase,
      // uPhase true => computeToPong just ran (ping -> pong) => display pong.
      colorNode: select(uPhase, texture(pongTexture), texture(pingTexture)),
    }
  })

  // Imperative per-frame bookkeeping — must never trigger a re-render.
  const phaseRef = useRef(true)
  const lastUpdateRef = useRef(-1)

  useFrame(
    (state) => {
      const seconds = Math.floor(state.elapsed)

      // Reseed roughly once a second (only checked on the phase===true half of the
      // alternation, matching the original's `if (phase && seconds !== lastUpdate)`).
      if (phaseRef.current && seconds !== lastUpdateRef.current) {
        uSeed.value.set(Math.random(), Math.random())
        renderer.compute(computeInit)
        lastUpdateRef.current = seconds
      }

      renderer.compute(phaseRef.current ? computeToPong : computeToPing)
      uPhase.value = phaseRef.current
      phaseRef.current = !phaseRef.current
    },
    { phase: 'update' },
  )

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <meshBasicNodeMaterial colorNode={colorNode} />
    </mesh>
  )
}

export default function ComputeTexturePingPong() {
  return (
    <Canvas renderer background="#111111" camera={{ position: [0, 0, 3], fov: 50 }}>
      <PingPongPlane />
      <DemoHelpers />
    </Canvas>
  )
}
