// The snow simulation for compute-particles-snow: GPU storage buffers, the init and
// update kernels, the top-down collision height-map pre-pass, and the two instanced
// flake meshes (falling + settled). Uses fiber hooks throughout, so it lives inside
// <Canvas>, not in the page shell.
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useBuffers, useFrame, useNodes, useThree, useUniforms } from '@react-three/fiber/webgpu'
import {
  Fn,
  hash,
  If,
  instancedArray,
  instanceIndex,
  positionLocal,
  positionWorld,
  texture,
  time,
  uint,
  vec3,
} from 'three/tsl'
import {
  HalfFloatType,
  MeshBasicNodeMaterial,
  NearestFilter,
  NoBlending,
  OrthographicCamera,
  RedFormat,
  RenderTarget,
  SphereGeometry,
} from 'three/webgpu'
import type { Node, WebGPURenderer } from 'three/webgpu'

const PARTICLE_COUNT = 100_000
// Flake radius — also the per-flake surface clearance in the landing test.
const SURFACE_OFFSET = 0.2

// Layer wiring (as the original): scenery on 0 (both cameras), settled snow on 1
// (collision camera only — it exists to raise the height map), falling snow on 2
// (main camera only — it must never pollute the height map while airborne).
const STATIC_LAYER_MASK = 1 << 1
const DYNAMIC_LAYER_MASK = 1 << 2

export interface SnowParticlesProps {
  /** Wobble frequency of the airborne drift (the original's `speed` const, 0.4). */
  driftSpeed: number
  /** Multiplier on each flake's fall velocity (original ×1). */
  fallSpeed: number
  /** Bump to re-dispatch the init kernel (leva "reset snow"). */
  resetNonce: number
}

export function SnowParticles({ driftSpeed, fallSpeed, resetNonce }: SnowParticlesProps) {
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const rawRenderer = useThree((state) => state.renderer)
  // Cast: useThree types renderer as the WebGL/WebGPU union even on the `/webgpu`
  // entry (fiber typing gap, UPSTREAM.md B9) — `.compute()` and the RenderTarget
  // overload of `.setRenderTarget()` exist only on WebGPURenderer.
  const renderer = rawRenderer as WebGPURenderer

  // The main camera must also see layer 2, where the falling flakes live.
  useLayoutEffect(() => {
    camera.layers.enable(2)
    return () => camera.layers.disable(2)
  }, [camera])

  // Leva knobs → live uniforms (create-or-update semantics sync values on re-render).
  const { uDriftSpeed, uFallSpeed } = useUniforms(
    { uDriftSpeed: driftSpeed, uFallSpeed: fallSpeed },
    'snowParticles', // WGSL-identifier rule: camelCase scope, never kebab-case
  )
  // Casts: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`
  // (documented fiber typing gap — see compute-particles et al.).
  const uDriftSpeedNode = uDriftSpeed as unknown as Node<'float'>
  const uFallSpeedNode = uFallSpeed as unknown as Node<'float'>

  // The collision rig: top-down ortho camera + height RenderTarget + the override
  // material that writes world-height into it. Lazy useState, NOT useMemo: the
  // update kernel below closes over `collision.rt.texture`, so the rig's identity
  // must survive StrictMode's double render — useState stores exactly one instance
  // (a re-run useMemo would hand the component a different RT than the one the
  // create-once kernel captured).
  const [collision] = useState(() => {
    const orthoCamera = new OrthographicCamera(-50, 50, 50, -50, 0.1, 50)
    orthoCamera.position.y = 50
    orthoCamera.lookAt(0, 0, 0)
    orthoCamera.layers.enable(1) // sees scenery (0) + settled snow (1)

    const rt = new RenderTarget(1024, 1024)
    rt.texture.format = RedFormat
    rt.texture.type = HalfFloatType
    rt.texture.magFilter = NearestFilter
    rt.texture.minFilter = NearestFilter
    rt.texture.generateMipmaps = false

    const heightMaterial = new MeshBasicNodeMaterial()
    heightMaterial.blending = NoBlending
    heightMaterial.fog = false
    heightMaterial.toneMapped = false
    heightMaterial.colorNode = positionWorld.y

    return { orthoCamera, rt, heightMaterial }
  })

  // Flake state, GPU-only. UNSCOPED with prefixed keys on purpose: scoped useBuffers
  // names each buffer `${scope}.${name}` and the dot lands in the WGSL struct name —
  // runtime shader compile error (fiber bug, UPSTREAM.md B16).
  const { snowPositions, snowScales, snowStaticPositions, snowData } = useBuffers(() => ({
    snowPositions: instancedArray(PARTICLE_COUNT, 'vec3'),
    snowScales: instancedArray(PARTICLE_COUNT, 'vec3'),
    snowStaticPositions: instancedArray(PARTICLE_COUNT, 'vec3'),
    // x/z: spawn column, y: fall velocity, w: per-flake random seed
    snowData: instancedArray(PARTICLE_COUNT, 'vec4'),
  }))

  // Kernels + render position nodes, built once. Closing over the TYPED hook returns
  // above (creator-state reads widen to fiber's BufferLike, losing `.element()` /
  // `.toAttribute()`). Also UNSCOPED (UPSTREAM.md B16) — these reach WGSL codegen.
  const { snowComputeInit, snowComputeUpdate, snowDynamicPositionNode, snowStaticPositionNode } =
    useNodes(() => {
      // Build-time random offsets (the original's `randUint()` helper) — evaluated
      // once when the graph is built, constant thereafter.
      const randUint = () => uint(Math.random() * 0xffffff)

      const snowComputeInit = Fn(() => {
        const position = snowPositions.element(instanceIndex)
        const scale = snowScales.element(instanceIndex)
        const particleData = snowData.element(instanceIndex)

        const randX = hash(instanceIndex)
        const randY = hash(instanceIndex.add(randUint()))
        const randZ = hash(instanceIndex.add(randUint()))

        position.x.assign(randX.mul(100).add(-50))
        position.y.assign(randY.mul(500).add(3))
        position.z.assign(randZ.mul(100).add(-50))

        scale.assign(vec3(hash(instanceIndex.add(Math.random())).mul(0.8).add(0.2)))

        // Park the settled copies far outside both frusta until a flake lands.
        snowStaticPositions.element(instanceIndex).assign(vec3(1000, 10000, 1000))

        particleData.y.assign(randY.mul(-0.1).add(-0.02)) // fall velocity
        particleData.x.assign(position.x)
        particleData.z.assign(position.z)
        particleData.w.assign(randX)
      })().compute(PARTICLE_COUNT)

      const snowComputeUpdate = Fn(() => {
        const position = snowPositions.element(instanceIndex)
        const scale = snowScales.element(instanceIndex)
        const particleData = snowData.element(instanceIndex)

        const velocity = particleData.y
        const random = particleData.w

        // World xz → height-map uv (the collision camera frames x/z −50..50).
        const coord = position.xz.add(50).div(100)
        // `.x`: the RedFormat texel's single channel (see header DIVERGENCE).
        const surfaceHeight = texture(collision.rt.texture, coord).x
        const landingHeight = surfaceHeight.add(scale.x.mul(SURFACE_OFFSET))

        // GPU-side branch (a JS `if` would run once at graph build, not per flake).
        If(position.y.greaterThan(landingHeight), () => {
          // Airborne: sinusoidal drift around the spawn column, constant fall.
          position.x.assign(
            particleData.x.add(time.mul(random.mul(random)).mul(uDriftSpeedNode).sin().mul(3)),
          )
          position.z.assign(
            particleData.z.add(time.mul(random).mul(uDriftSpeedNode).cos().mul(random.mul(10))),
          )
          position.y.addAssign(velocity.mul(uFallSpeedNode))
        }).Else(() => {
          // Landed: the dynamic flake simply stops integrating (it stays drawn where
          // it froze); its copy in the static buffer is what the collision camera
          // sees, so later flakes stack on top of it.
          snowStaticPositions.element(instanceIndex).assign(position)
        })
      })().compute(PARTICLE_COUNT)

      return {
        snowComputeInit,
        snowComputeUpdate,
        snowDynamicPositionNode: positionLocal.mul(snowScales.toAttribute()).add(snowPositions.toAttribute()),
        snowStaticPositionNode: positionLocal
          .mul(snowScales.toAttribute())
          .add(snowStaticPositions.toAttribute()),
      }
    })

  // ONCE at mount + ON DEMAND from the leva reset button (nonce-keyed): seed the
  // buffers. Sync compute() is safe here — fiber awaits renderer.init() before
  // children render; StrictMode's double run re-writes the same values (idempotent).
  useEffect(() => {
    renderer.compute(snowComputeInit)
  }, [renderer, snowComputeInit, resetNonce])

  // EVERY FRAME, before the pipeline draws: (1) render the world-height map from
  // above with the override material — the WebGPU renderer transfers each object
  // material's `positionNode` onto the override (Renderer.js), which is what places
  // the instanced settled flakes into the map; then (2) step the simulation against
  // the fresh map. Dispatching compute is not a render takeover — never
  // `phase: 'render'`; the default loop still draws the pipeline afterwards.
  useFrame(
    () => {
      scene.overrideMaterial = collision.heightMaterial
      renderer.setRenderTarget(collision.rt)
      renderer.render(scene, collision.orthoCamera)

      scene.overrideMaterial = null
      renderer.setRenderTarget(null)

      renderer.compute(snowComputeUpdate)
    },
    { phase: 'update' },
  )

  // One low-poly sphere shared by both instanced meshes (as the original).
  const flakeGeometry = useMemo(() => new SphereGeometry(SURFACE_OFFSET, 5, 5), [])

  return (
    <>
      {/* Falling flakes — main camera only. Positions live on the GPU, so three's
          culling sphere knows nothing: frustumCulled must be off. */}
      <mesh
        geometry={flakeGeometry}
        count={PARTICLE_COUNT}
        frustumCulled={false}
        layers-mask={DYNAMIC_LAYER_MASK}
      >
        <meshStandardNodeMaterial
          color={0xeeeeee}
          roughness={0.9}
          metalness={0}
          positionNode={snowDynamicPositionNode}
        />
      </mesh>
      {/* Settled flakes — collision camera only (they exist to raise the height map;
          the frozen dynamic instances are what the eye sees). */}
      <mesh
        geometry={flakeGeometry}
        count={PARTICLE_COUNT}
        frustumCulled={false}
        layers-mask={STATIC_LAYER_MASK}
      >
        <meshStandardNodeMaterial
          color={0xeeeeee}
          roughness={0.9}
          metalness={0}
          positionNode={snowStaticPositionNode}
        />
      </mesh>
    </>
  )
}
