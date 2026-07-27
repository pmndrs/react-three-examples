// The offscreen capture rig: a depth-only override material renders the scene from a
// small top-down orthographic camera into a RenderTarget, and a gaussian-blurred read
// of that render target drives a ground-plane material's opacity. Built imperatively —
// see the shadow-contact.tsx header's DIVERGENCE section for why.
import { useMemo } from 'react'
import { useFrame, useThree, useUniforms } from '@react-three/fiber/webgpu'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { depth, float, texture, vec3 } from 'three/tsl'
import { CameraHelper, Group, Mesh, NodeMaterial, OrthographicCamera, PlaneGeometry, RenderTarget } from 'three/webgpu'
import type { Node, WebGPURenderer } from 'three/webgpu'

const PLANE_WIDTH = 2.5
const PLANE_HEIGHT = 2.5
const CAMERA_HEIGHT = 0.3
const PLANE_Y = -0.3

export interface ContactShadowCatcherProps {
  blur: number
  darkness: number
  shadowOpacity: number
  planeColor: string
  planeOpacity: number
  showWireframe: boolean
}

export function ContactShadowCatcher({
  blur,
  darkness,
  shadowOpacity,
  planeColor,
  planeOpacity,
  showWireframe,
}: ContactShadowCatcherProps) {
  const { scene, renderer: rawRenderer } = useThree()
  // Cast: even from the `/webgpu` entry, fiber's `useThree()` types `renderer` as the
  // package-wide `WebGLRenderer | WebGPURenderer` union (a fiber typing gap — the
  // narrowed `WebGPURootState` the docs describe isn't actually what `useThree`'s
  // declaration resolves to). `setRenderTarget`/`getClearAlpha`/etc. exist on both, but
  // union method calls require an argument assignable to every member's signature,
  // which a plain `RenderTarget` isn't for `WebGLRenderer`'s `WebGLRenderTarget`-typed
  // overload. This canvas only ever runs WebGPURenderer (the `/webgpu` entry creates
  // one unconditionally), so the cast is safe at runtime.
  const renderer = rawRenderer as WebGPURenderer

  const { uBlur, uDarkness, uShadowOpacity, uPlaneColor, uPlaneOpacity } = useUniforms(() => ({
    uBlur: blur,
    uDarkness: darkness,
    uShadowOpacity: shadowOpacity,
    uPlaneColor: planeColor,
    uPlaneOpacity: planeOpacity,
  }))

  // Cast: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`, so it
  // never structurally narrows to the specific `Node<'float'|'vec3'>` types TSL math
  // and NodeMaterial's `*Node` fields expect (documented fiber typing gap, see
  // skinning-instancing/rtt).
  const rig = useMemo(() => {
    const renderTarget = new RenderTarget(512, 512, { depthBuffer: true })
    renderTarget.texture.generateMipmaps = false
    // GaussianBlurNode sizes its internal texture node off `texture.image` — stand one
    // in before the first real render populates it (matches the original's guard).
    if (!renderTarget.texture.image) {
      renderTarget.texture.image = { width: 512, height: 512 }
    }

    // Shared plane geometry, pre-rotated to lie flat — reused by both the shadow plane
    // and the fill plane underneath it, exactly as the original shares one geometry.
    const planeGeometry = new PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT).rotateX(Math.PI / 2)

    const depthMaterial = new NodeMaterial()
    depthMaterial.colorNode = vec3(0)
    depthMaterial.opacityNode = float(1)
      .sub(depth)
      .mul(uDarkness as unknown as Node<'float'>)
    depthMaterial.depthTest = false
    depthMaterial.depthWrite = false

    const blurredShadow = gaussianBlur(texture(renderTarget.texture), uBlur, 4, { premultipliedAlpha: false })

    const shadowPlaneMaterial = new NodeMaterial()
    shadowPlaneMaterial.transparent = true
    shadowPlaneMaterial.depthWrite = false
    shadowPlaneMaterial.colorNode = vec3(0)
    shadowPlaneMaterial.opacityNode = blurredShadow.a.mul(uShadowOpacity as unknown as Node<'float'>)

    const shadowPlane = new Mesh(planeGeometry, shadowPlaneMaterial)
    shadowPlane.renderOrder = 1
    shadowPlane.scale.y = -1
    shadowPlane.scale.z = -1

    const fillPlaneMaterial = new NodeMaterial()
    fillPlaneMaterial.transparent = true
    fillPlaneMaterial.depthWrite = false
    fillPlaneMaterial.colorNode = uPlaneColor as unknown as Node<'vec3'>
    fillPlaneMaterial.opacityNode = uPlaneOpacity as unknown as Node<'float'>

    const fillPlane = new Mesh(planeGeometry, fillPlaneMaterial)
    fillPlane.rotateX(Math.PI)

    const shadowCamera = new OrthographicCamera(
      -PLANE_WIDTH / 2,
      PLANE_WIDTH / 2,
      PLANE_HEIGHT / 2,
      -PLANE_HEIGHT / 2,
      0,
      CAMERA_HEIGHT,
    )
    shadowCamera.rotation.x = Math.PI / 2

    const shadowGroup = new Group()
    shadowGroup.position.y = PLANE_Y
    shadowGroup.add(shadowPlane, fillPlane, shadowCamera)

    // Not added to shadowGroup — see shadow-contact.tsx's DIVERGENCE note (must stay a
    // direct scene child).
    const cameraHelper = new CameraHelper(shadowCamera)

    return { shadowGroup, shadowCamera, cameraHelper, depthMaterial, renderTarget }
    // `useUniforms` returns the same uniform-node instances across re-renders (values
    // are mutated in place via `.value`, per its create-if-not-exists design), so these
    // deps never actually change identity — listed for the lint rule, not for churn.
  }, [uBlur, uDarkness, uShadowOpacity, uPlaneColor, uPlaneOpacity])

  // Runs every frame, ordered before the default render job — preps the offscreen
  // shadow capture without taking over rendering (see the entry file's DEMONSTRATES).
  // Mirrors the original's save/mutate/restore dance around its manual second
  // `renderer.render()`.
  useFrame(
    () => {
      const initialBackground = scene.background
      scene.background = null

      const prevOverrideMaterial = scene.overrideMaterial
      const prevHelperVisible = rig.cameraHelper.visible
      rig.cameraHelper.visible = false
      scene.overrideMaterial = rig.depthMaterial

      const initialAutoClear = renderer.autoClear
      renderer.autoClear = true
      const initialClearAlpha = renderer.getClearAlpha()
      renderer.setClearAlpha(0)

      renderer.setRenderTarget(rig.renderTarget)
      renderer.clear()
      renderer.render(scene, rig.shadowCamera)

      scene.overrideMaterial = prevOverrideMaterial
      renderer.setRenderTarget(null)
      renderer.autoClear = initialAutoClear
      renderer.setClearAlpha(initialClearAlpha)
      scene.background = initialBackground
      rig.cameraHelper.visible = prevHelperVisible
    },
    { before: 'render' },
  )

  return (
    <>
      <primitive object={rig.shadowGroup} />
      <primitive object={rig.cameraHelper} visible={showWireframe} />
    </>
  )
}
