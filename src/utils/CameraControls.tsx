// Thin WebGPU-safe wrapper around the `camera-controls` library.
// drei v11 alpha.5 doesn't export CameraControls from /core or /webgpu yet, and its
// root export pulls the legacy WebGL bundle (plain `three` + legacy fiber entry),
// which must never enter a WebGPU app.
// TODO(drei-gap): replace with drei's CameraControls once it lands in /core upstream.
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber/webgpu'
import CameraControlsImpl from 'camera-controls'
import * as THREE from 'three'

CameraControlsImpl.install({ THREE })

export interface CameraControlsProps {
  /** Point the camera orbits around. */
  target?: [number, number, number]
  /** Dolly-in limit (camera-controls `minDistance`). */
  minDistance?: number
  /** Dolly-out limit (camera-controls `maxDistance`). */
  maxDistance?: number
  /** Allow panning/trucking. Default true; false = orbit/dolly only (common in
   * skybox/panorama-style originals that lock the viewpoint). */
  pan?: boolean
}

export function CameraControls({ target, minDistance, maxDistance, pan = true }: CameraControlsProps) {
  const camera = useThree((s) => s.camera)
  const domElement = useThree((s) => s.renderer.domElement)

  // Construct WITHOUT the element; attach via connect/disconnect in a symmetric effect.
  // (Disposing a useMemo'd instance in an effect cleanup breaks under StrictMode: the
  // simulated unmount disposes the instance the memo will reuse on remount.)
  const controls = useMemo(
    () => new CameraControlsImpl(camera as THREE.PerspectiveCamera),
    [camera],
  )

  useEffect(() => {
    controls.connect(domElement)
    return () => controls.disconnect()
  }, [controls, domElement])

  const [tx, ty, tz] = target ?? []
  useEffect(() => {
    if (tx !== undefined) controls.setTarget(tx, ty!, tz!, false)
  }, [controls, tx, ty, tz])

  useEffect(() => {
    controls.minDistance = minDistance ?? 0
    controls.maxDistance = maxDistance ?? Infinity
  }, [controls, minDistance, maxDistance])

  // camera-controls has no enablePan boolean — panning is the TRUCK action on the
  // right button / multi-touch gestures, so locking = remapping those actions.
  useEffect(() => {
    const { ACTION } = CameraControlsImpl
    controls.mouseButtons.right = pan ? ACTION.TRUCK : ACTION.NONE
    controls.touches.two = pan ? ACTION.TOUCH_DOLLY_TRUCK : ACTION.TOUCH_DOLLY
    controls.touches.three = pan ? ACTION.TOUCH_TRUCK : ACTION.NONE
  }, [controls, pan])

  useFrame((_, delta) => {
    controls.update(delta)
  })

  return null
}
