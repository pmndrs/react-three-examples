// Pixel-grid frustum alignment, ported from the original `webgpu_postprocessing_pixel`
// example (pixelation pass + helpers by Kody King). The pixelation pass renders the
// scene at (screen / pixelSize) resolution, so any camera pan that lands between those
// big pixels makes every edge shimmer. This snaps the orthographic frustum's offset to
// whole pixel units each frame: project the camera position onto its local right/up
// axes, keep only the fractional pixel remainder, and shift the frustum by it.
import { Quaternion, Vector3 } from 'three/webgpu'
import type { OrthographicCamera } from 'three/webgpu'

export function pixelAlignFrustum(
  camera: OrthographicCamera,
  aspectRatio: number,
  pixelsPerScreenWidth: number,
  pixelsPerScreenHeight: number,
) {
  // 0. Get pixel grid units
  const worldScreenWidth = (camera.right - camera.left) / camera.zoom
  const worldScreenHeight = (camera.top - camera.bottom) / camera.zoom
  const pixelWidth = worldScreenWidth / pixelsPerScreenWidth
  const pixelHeight = worldScreenHeight / pixelsPerScreenHeight

  // 1. Project the current camera position along its local rotation bases
  const camPos = new Vector3()
  camera.getWorldPosition(camPos)
  const camRot = new Quaternion()
  camera.getWorldQuaternion(camRot)
  const camRight = new Vector3(1, 0, 0).applyQuaternion(camRot)
  const camUp = new Vector3(0, 1, 0).applyQuaternion(camRot)
  const camPosRight = camPos.dot(camRight)
  const camPosUp = camPos.dot(camUp)

  // 2. Find how far along its position is along these bases in pixel units
  const camPosRightPx = camPosRight / pixelWidth
  const camPosUpPx = camPosUp / pixelHeight

  // 3. Find the fractional pixel units and convert to world units
  const fractX = camPosRightPx - Math.round(camPosRightPx)
  const fractY = camPosUpPx - Math.round(camPosUpPx)

  // 4. Add fractional world units to the left/right top/bottom to align with the pixel grid
  camera.left = -aspectRatio - fractX * pixelWidth
  camera.right = aspectRatio - fractX * pixelWidth
  camera.top = 1.0 - fractY * pixelHeight
  camera.bottom = -1.0 - fractY * pixelHeight
  camera.updateProjectionMatrix()
}
