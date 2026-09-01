// MultiViewRig — the imperative engine: four independent scene/camera/OrbitControls
// triples composited into one canvas via manual viewport/scissor + render() calls,
// plus a RenderTarget3D + RenderTargetArray (a `RenderTarget` built with `{ depth }`)
// continuously refilled one layer at a time. See the header block in
// `rendertarget-2d-array-3d.tsx` for the full DEMONSTRATES/DIVERGENCE notes.
import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber/webgpu'
import { attribute, color, diffuseColor, screenUV, smoothstep, texture, uniform, vec2, vec3, vec4 } from 'three/tsl'
import {
  Data3DTexture,
  DataArrayTexture,
  LinearFilter,
  NodeMaterial,
  PerspectiveCamera,
  QuadMesh,
  RedFormat,
  RenderTarget,
  RenderTarget3D,
  Scene,
} from 'three/webgpu'
import type { Node, WebGPURenderer } from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TextureHelper } from 'three/addons/helpers/TextureHelperGPU.js'

const SIZE = { width: 256, height: 256, depth: 109 }
// World-space "thickness" the TextureHelper spreads its slice stack across — the
// original's own constant, shared by all four helpers regardless of texture kind.
const HELPER_DEPTH = SIZE.depth / 20

interface ViewSpec {
  left: number
  top: number
  width: number
  height: number
}

// TOP-origin quadrant layout (see rendertarget-2d-array-3d.tsx's BUG FIX divergence
// note for why this differs from the original's bottom-origin numbers): top row =
// the two render targets being continuously refilled, bottom row = the raw source
// textures they're refilled FROM.
const RENDER_TARGET_ARRAY_VIEW: ViewSpec = { left: 0, top: 0, width: 0.5, height: 0.5 }
const RENDER_TARGET_3D_VIEW: ViewSpec = { left: 0.5, top: 0, width: 0.5, height: 0.5 }
const DATA_ARRAY_VIEW: ViewSpec = { left: 0, top: 0.5, width: 0.5, height: 0.5 }
const DATA_3D_VIEW: ViewSpec = { left: 0.5, top: 0.5, width: 0.5, height: 0.5 }

// One quadrant's scene + camera + independent OrbitControls — the non-React class
// equivalent of the original's `View`. Built once per rig (see `buildRig`).
class ViewportScene {
  spec: ViewSpec
  camera: PerspectiveCamera
  scene: Scene
  controls: OrbitControls

  constructor(spec: ViewSpec, domElement: HTMLElement, aspect: number) {
    this.spec = spec

    this.camera = new PerspectiveCamera(50, aspect, 0.1, 100)
    this.camera.position.set(-7, 0, 10)
    this.camera.lookAt(0, 0, 0)

    this.scene = new Scene()
    // Soft radial vignette centered on this quadrant, ported verbatim from the
    // original's `View` constructor — screenUV spans the WHOLE canvas regardless of
    // the active scissor rect, so `viewportCenter` picks out just this quadrant's
    // center within that shared UV space. This part is orientation-agnostic (a
    // screen-space UV flip for TOP-down semantics, unrelated to the
    // setViewport/setScissor origin bug below), so it ports unchanged.
    const normalizedUV = screenUV.mul(vec2(1, -1)).add(vec2(0, 1))
    const viewportCenter = vec2(spec.left + spec.width * 0.5, spec.top + spec.height * 0.5)
    const distanceEffect = smoothstep(normalizedUV.distance(viewportCenter), 0, 0.2)
    const backgroundEffect = color(spec.top > 0 ? 0x212121 : 0x616161).sub(distanceEffect.pow(0.3).mul(0.1))
    // Cast: duck-typed `backgroundNode` — the runtime reads it generically
    // (NodeManager) but @types/three doesn't declare it on Scene (AGENTS.md B11).
    ;(this.scene as unknown as { backgroundNode: Node }).backgroundNode = backgroundEffect

    this.controls = new OrbitControls(this.camera, domElement)
    this.controls.minDistance = 1
    this.controls.maxDistance = 20
    this.controls.minAzimuthAngle = -Math.PI / 3
    this.controls.maxAzimuthAngle = Math.PI / 3
    this.controls.minPolarAngle = Math.PI / 4
    this.controls.maxPolarAngle = Math.PI / 1.25
    this.controls.enableDamping = true
    // No disposal on unmount: OrbitControls has no reconnect step, so disposing it
    // from a StrictMode effect-cleanup would permanently kill the SAME instance the
    // real mount keeps using (AGENTS.md: the CameraControls dispose warning,
    // generalized) — its DOM listeners are attached to the canvas element, which is
    // torn down (and GC'd) along with the whole Canvas on navigation anyway.
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }
}

function buildRig(renderer: WebGPURenderer, data: Uint8Array, aspect: number) {
  const rtArrayView = new ViewportScene(RENDER_TARGET_ARRAY_VIEW, renderer.domElement, aspect)
  const rt3DView = new ViewportScene(RENDER_TARGET_3D_VIEW, renderer.domElement, aspect)
  const dataArrayView = new ViewportScene(DATA_ARRAY_VIEW, renderer.domElement, aspect)
  const data3DView = new ViewportScene(DATA_3D_VIEW, renderer.domElement, aspect)

  const mapArray = new DataArrayTexture(data, SIZE.width, SIZE.height, SIZE.depth)
  mapArray.format = RedFormat
  mapArray.minFilter = LinearFilter
  mapArray.magFilter = LinearFilter
  mapArray.unpackAlignment = 1
  mapArray.needsUpdate = true

  const map3D = new Data3DTexture(data, SIZE.width, SIZE.height, SIZE.depth)
  map3D.format = RedFormat
  map3D.minFilter = LinearFilter
  map3D.magFilter = LinearFilter
  map3D.unpackAlignment = 1
  map3D.needsUpdate = true

  // Raw-source debug helpers: a z-gradient outputNode fades each slice's alpha
  // along the depth axis, for a coherent "swept scan" look instead of a flat stack —
  // ported verbatim from the original. `attribute<'vec3'>(...)` needs the explicit
  // type argument — inferring it from the string literal `nodeType` arg alone
  // widens to `AttributeNode<string>` (no `.z`), same "typed TSL creators don't
  // infer from their literal args" family as `uniformArray<'vec3'>` (AGENTS.md).
  const helperArray = new TextureHelper(mapArray, 10, 10, HELPER_DEPTH)
  ;(helperArray.material as NodeMaterial).outputNode = vec4(
    vec3(diffuseColor.r.mul(attribute<'vec3'>('uvw', 'vec3').z.div(SIZE.depth).mul(diffuseColor.r))),
    diffuseColor.r.mul(diffuseColor.a),
  )
  dataArrayView.scene.add(helperArray)

  const helper3D = new TextureHelper(map3D, 10, 10, HELPER_DEPTH)
  ;(helper3D.material as NodeMaterial).outputNode = vec4(
    vec3(diffuseColor.r.mul(attribute<'vec3'>('uvw', 'vec3').z.mul(diffuseColor.r))),
    diffuseColor.r.mul(diffuseColor.a),
  )
  data3DView.scene.add(helper3D)

  // `RenderTarget` + `{ depth }` IS a "RenderTargetArray" — there is no separate
  // class; the option alone switches the target's texture to an array texture.
  const fboArray = new RenderTarget(SIZE.width, SIZE.height, { depthBuffer: false, depth: SIZE.depth })
  fboArray.texture.name = 'RenderTargetArray'
  const fboArrayHelper = new TextureHelper(fboArray.texture, 10, 10, HELPER_DEPTH)
  ;(fboArrayHelper.material as NodeMaterial).outputNode = vec4(vec3(diffuseColor.r), diffuseColor.r)
  rtArrayView.scene.add(fboArrayHelper)

  const fbo3D = new RenderTarget3D(SIZE.width, SIZE.height, SIZE.depth, { depthBuffer: false })
  fbo3D.texture.name = 'RenderTarget3D'
  const fbo3DHelper = new TextureHelper(fbo3D.texture, 10, 10, HELPER_DEPTH)
  ;(fbo3DHelper.material as NodeMaterial).outputNode = vec4(vec3(diffuseColor.r), diffuseColor.r)
  rt3DView.scene.add(fbo3DHelper)

  // The layer-fill blit: samples `mapArray`'s CURRENT layer (via `uZCoord`, advanced
  // in the frame loop below) and is reused, unmodified, to write BOTH render-target
  // kinds — one QuadMesh, two destinations, exactly like the original.
  const uZCoord = uniform(0)
  const quadMaterial = new NodeMaterial()
  quadMaterial.depthTest = false
  quadMaterial.outputNode = vec4(texture(mapArray).depth(uZCoord).rgb, 1)
  const quadMesh = new QuadMesh(quadMaterial)

  return {
    views: [rtArrayView, rt3DView, dataArrayView, data3DView],
    mapArray,
    map3D,
    fboArray,
    fbo3D,
    quadMesh,
    uZCoord,
  }
}

type Rig = ReturnType<typeof buildRig>

export function MultiViewRig({ data, layersPerSecond }: { data: Uint8Array; layersPerSecond: number }) {
  const rawRenderer = useThree((state) => state.renderer)
  const size = useThree((state) => state.size)
  // WebGPU-only calls below (layered setRenderTarget, RenderTarget3D) fail strict
  // tsc on fiber's WebGL|WebGPU renderer union (AGENTS.md B9).
  const renderer = rawRenderer as WebGPURenderer

  // Non-node instances (scenes, cameras, controls, render targets) captured by the
  // create-once frame-loop closure below — lazy useState keeps identity stable
  // across a StrictMode re-run (AGENTS.md: compute-particles-snow pattern).
  const [rig] = useState<Rig>(() => buildRig(renderer, data, size.width / size.height))

  useEffect(() => {
    for (const view of rig.views) {
      view.setAspect((size.width * view.spec.width) / (size.height * view.spec.height))
    }
  }, [rig, size.width, size.height])

  useEffect(() => {
    // WebGPU requires every layer of a 3D render target to be cleared before first
    // use (the original's own comment: "In WebGPU we need to clear all the layers
    // ... WebGPU limitation?") — always true here, this corpus is WebGPU-only, so
    // unlike the original there's no `renderer.backend.isWebGPUBackend` branch.
    renderer.autoClear = false
    const clearMaterial = new NodeMaterial()
    clearMaterial.outputNode = vec4(0)
    const clearQuadMesh = new QuadMesh(clearMaterial)
    for (let i = 0; i < SIZE.depth; i++) {
      renderer.setRenderTarget(rig.fbo3D, i)
      clearQuadMesh.render(renderer)
    }
    renderer.setRenderTarget(null)
    clearMaterial.dispose()
  }, [renderer, rig])

  const layer = useRef(0)
  const lastFill = useRef(0)

  useFrame(
    (state) => {
      // Pass 1: the four quadrants, each an independent scissored scene/camera pair.
      for (const view of rig.views) {
        view.controls.update()
        const { left, top, width, height } = view.spec
        const x = Math.floor(left * state.size.width)
        // TOP-origin directly — see the header's BUG FIX divergence note.
        const y = Math.floor(top * state.size.height)
        const w = Math.floor(width * state.size.width)
        const h = Math.floor(height * state.size.height)

        renderer.setViewport(x, y, w, h)
        renderer.setScissor(x, y, w, h)
        renderer.setScissorTest(true)
        renderer.clear()
        renderer.render(view.scene, view.camera)
      }

      // Pass 2: periodically advance the written layer and blit it into both
      // render-target kinds (folded into this same RAF-driven callback instead of
      // the original's separate `setInterval` — see header DIVERGENCE).
      const fillInterval = 1 / layersPerSecond
      if (state.elapsed - lastFill.current >= fillInterval) {
        lastFill.current = state.elapsed
        layer.current = (layer.current + 1) % SIZE.depth
        rig.uZCoord.value = layer.current

        renderer.setScissorTest(false)
        renderer.setViewport(0, 0, SIZE.width, SIZE.height)
        renderer.setScissor(0, 0, SIZE.width, SIZE.height)

        renderer.setRenderTarget(rig.fboArray, layer.current)
        renderer.clear()
        rig.quadMesh.render(renderer)

        renderer.setRenderTarget(rig.fbo3D, layer.current)
        renderer.clear()
        rig.quadMesh.render(renderer)

        renderer.setRenderTarget(null)
      }
    },
    { phase: 'render' },
  )

  return null
}
