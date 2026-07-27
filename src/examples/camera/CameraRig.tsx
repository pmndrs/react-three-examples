// CameraRig — the split-viewport dual-camera rig: a static "viewer" camera plus a
// perspective/orthographic pair mounted on a group that tracks an orbiting sphere.
// Owns the manual scissor+viewport render takeover (`{ phase: 'render' }`) that
// reproduces the original's hand-rolled `render()` — see camera.tsx's DEMONSTRATES.
//
// Everything here is built imperatively in one `useMemo` rather than JSX: the camera
// aspect/frustum math is recomputed every frame off a live position, and `CameraHelper`
// must stay a direct scene child (its `.matrix` is aliased to the target camera's
// `.matrixWorld` — nesting it under the rig group would double-apply the group's
// transform, same rule documented in `shadow-contact/ContactShadowCatcher.tsx`).
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber/webgpu'
import {
  CameraHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  SphereGeometry,
} from 'three/webgpu'
import type { WebGPURenderer } from 'three/webgpu'

const FRUSTUM_SIZE = 600

export interface CameraRigProps {
  activeCamera: 'perspective' | 'orthographic'
}

export function CameraRig({ activeCamera }: CameraRigProps) {
  const { scene, renderer: rawRenderer } = useThree()
  // Cast: see rtt.tsx / ContactShadowCatcher.tsx — fiber's `useThree()` types `renderer`
  // as the package-wide `WebGLRenderer | WebGPURenderer` union even on the `/webgpu`
  // entry (documented fiber typing gap, UPSTREAM.md B9). This canvas only ever runs a
  // WebGPURenderer (the `/webgpu` entry creates one unconditionally).
  const renderer = rawRenderer as WebGPURenderer
  const size = useThree((state) => state.size)

  const rig = useMemo(() => {
    // The fixed "viewer" camera — the original's static `camera`, rendered into the
    // right-hand pane every frame alongside the active camera's frustum helper.
    const mainCamera = new PerspectiveCamera(50, 1, 1, 10000)
    mainCamera.position.z = 2500

    const cameraPerspective = new PerspectiveCamera(50, 1, 150, 1000)
    const cameraOrtho = new OrthographicCamera(-1, 1, 1, -1, 150, 1000)

    // Counteract the different front-facing orientation of cameras vs. the rig group,
    // exactly as the original does.
    cameraPerspective.rotation.y = Math.PI
    cameraOrtho.rotation.y = Math.PI

    const cameraPerspectiveHelper = new CameraHelper(cameraPerspective)
    const cameraOrthoHelper = new CameraHelper(cameraOrtho)

    const cameraRigGroup = new Group()
    cameraRigGroup.add(cameraPerspective, cameraOrtho)

    // A small marker sphere riding along on the rig, mounted the same way the original
    // hangs `mesh3` off `cameraRig` (not off the tracked subject).
    const rigMarker = new Mesh(new SphereGeometry(5, 16, 8), new MeshBasicMaterial({ color: 0x0000ff, wireframe: true }))
    rigMarker.position.z = 150
    cameraRigGroup.add(rigMarker)

    // The tracked subject: an orbiting wireframe sphere with a smaller child sphere,
    // both animated per-frame below (original's `mesh`/`mesh.children[0]`).
    const subject = new Mesh(new SphereGeometry(100, 16, 8), new MeshBasicMaterial({ color: 0xffffff, wireframe: true }))
    const subjectInner = new Mesh(new SphereGeometry(50, 16, 8), new MeshBasicMaterial({ color: 0x00ff00, wireframe: true }))
    subjectInner.position.y = 150
    subject.add(subjectInner)

    return {
      mainCamera,
      cameraPerspective,
      cameraOrtho,
      cameraPerspectiveHelper,
      cameraOrthoHelper,
      cameraRigGroup,
      subject,
      subjectInner,
    }
  }, [])

  // Aspect/frustum follow the CANVAS size, halved (each camera renders into one half of
  // the split viewport) — fiber's reactive `size` replaces the original's manual
  // `window.addEventListener('resize', ...)` handler.
  useEffect(() => {
    const aspect = 0.5 * (size.width / size.height)

    rig.mainCamera.aspect = aspect
    rig.mainCamera.updateProjectionMatrix()

    rig.cameraPerspective.aspect = aspect
    rig.cameraPerspective.updateProjectionMatrix()

    rig.cameraOrtho.left = (-0.5 * FRUSTUM_SIZE * aspect) / 2
    rig.cameraOrtho.right = (0.5 * FRUSTUM_SIZE * aspect) / 2
    rig.cameraOrtho.top = FRUSTUM_SIZE / 2
    rig.cameraOrtho.bottom = -FRUSTUM_SIZE / 2
    rig.cameraOrtho.updateProjectionMatrix()
  }, [rig, size.width, size.height])

  useEffect(() => {
    renderer.setScissorTest(true)
    return () => renderer.setScissorTest(false)
  }, [renderer])

  // Takes over rendering entirely (`{ phase: 'render' }`) — this example IS about the
  // manual two-pass scissor/viewport split, so per Layer 1's render-takeover rule this
  // is the intentional case, not a shortcut around it. The default system render job is
  // skipped for as long as this job is registered.
  useFrame(
    (state) => {
      const r = state.elapsed * 0.5

      rig.subject.position.x = 700 * Math.cos(r)
      rig.subject.position.z = 700 * Math.sin(r)
      rig.subject.position.y = 700 * Math.sin(r)

      rig.subjectInner.position.x = 70 * Math.cos(2 * r)
      rig.subjectInner.position.z = 70 * Math.sin(r)

      const isPerspective = activeCamera === 'perspective'
      const activeCam = isPerspective ? rig.cameraPerspective : rig.cameraOrtho
      const activeHelper = isPerspective ? rig.cameraPerspectiveHelper : rig.cameraOrthoHelper

      if (isPerspective) {
        rig.cameraPerspective.fov = 35 + 30 * Math.sin(0.5 * r)
        rig.cameraPerspective.far = rig.subject.position.length()
        rig.cameraPerspective.updateProjectionMatrix()
      } else {
        rig.cameraOrtho.far = rig.subject.position.length()
        rig.cameraOrtho.updateProjectionMatrix()
      }

      activeHelper.update()
      rig.cameraPerspectiveHelper.visible = isPerspective
      rig.cameraOrthoHelper.visible = !isPerspective

      rig.cameraRigGroup.lookAt(rig.subject.position)

      const halfWidth = size.width / 2

      // Left pane: the active camera's own point of view.
      activeHelper.visible = false
      renderer.setClearColor(0x000000, 1)
      renderer.setScissor(0, 0, halfWidth, size.height)
      renderer.setViewport(0, 0, halfWidth, size.height)
      renderer.render(scene, activeCam)

      // Right pane: the fixed viewer camera, with the active camera's frustum visible.
      activeHelper.visible = true
      renderer.setClearColor(0x111111, 1)
      renderer.setScissor(halfWidth, 0, halfWidth, size.height)
      renderer.setViewport(halfWidth, 0, halfWidth, size.height)
      renderer.render(scene, rig.mainCamera)
    },
    { phase: 'render' },
  )

  return (
    <>
      <primitive object={rig.mainCamera} />
      <primitive object={rig.cameraRigGroup} />
      <primitive object={rig.cameraPerspectiveHelper} />
      <primitive object={rig.cameraOrthoHelper} />
      <primitive object={rig.subject} />
    </>
  )
}
