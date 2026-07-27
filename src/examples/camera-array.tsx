/**
 * camera-array
 * R3F port of three.js `webgpu_camera_array`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_camera_array (~110 lines of JS)
 *
 * DEMONSTRATES
 * - `THREE.ArrayCamera` handed to `<Canvas camera={...}>` as fiber's own default
 *   camera: WebGPURenderer natively multiplexes ONE `render(scene, camera)` call
 *   across `camera.cameras[]`, each sub-camera drawn into its own `.viewport` rect —
 *   no manual scissor/viewport loop or render-phase takeover needed. (Contrast
 *   `camera/CameraRig.tsx`'s `{ phase: 'render' }` takeover, which exists because
 *   THAT example is about the manual scissor mechanism itself — verified fiber's
 *   default render job is exactly `renderer.render(state.scene, state.camera)`,
 *   `packages/fiber/src/core/renderer.tsx`, so an ArrayCamera reproduces the
 *   original's `renderer.render(scene, camera)` call unmodified.)
 * - `camera.manual = true` — fiber's per-camera escape hatch
 *   (`ThreeCamera = (Orthographic|Perspective) & { manual?: boolean }`,
 *   `packages/fiber/types/renderer.d.ts`) — so fiber's resize-driven aspect/
 *   projection update leaves the array's sub-camera projections alone; this
 *   example's own effect owns them instead, exactly like the original's
 *   `updateCameras()`.
 * - fiber's reactive `size` (via `useThree`) recomputing every sub-camera's
 *   viewport + aspect on resize, replacing the original's manual
 *   `window.addEventListener('resize', ...)` handler.
 *
 * DIVERGENCE from original
 * - Grid size (`AMOUNT`, 6 -> 36 sub-cameras) is a leva control instead of a
 *   hardcoded constant. Changing sub-camera COUNT means a new `ArrayCamera`
 *   instance, so the `<Canvas>` remounts via `key={amount}` alongside it — simpler
 *   and safer than trying to hot-swap fiber's default camera object mid-session.
 * - Cylinder rotation is delta-scaled (`delta * rotationSpeed * ...`) instead of the
 *   original's fixed per-tick increment (`+= 0.005`) — frame-rate independent, and
 *   `rotationSpeed` is a leva control (default 1 reproduces the original's pace).
 * - Cylinder/background colors are leva controls instead of hardcoded hex — direct-
 *   value controls over hidden state, per this repo's controls convention.
 * - Background plane and lights use the `*NodeMaterial` family
 *   (`meshPhongNodeMaterial`) instead of the original's classic `MeshPhongMaterial`
 *   — this repo's `/webgpu` convention (materials-basic.tsx, lights-pointlights.tsx),
 *   auto-extended into JSX, not a behavior change.
 * - DemoHelpers' grid AND orbit camera-controls are both disabled (`grid={false}
 *   controls={false}`): there is no single user-navigable camera here — the whole
 *   point is the 36-camera grid rendered in one pass — so CameraControls has
 *   nothing sensible to attach to (same rationale as `camera/camera.tsx`).
 *   DemoHelpers stays mounted for the readiness signal.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useControls } from 'leva'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { ArrayCamera, PerspectiveCamera, Vector4 } from 'three/webgpu'
import type { Mesh } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const BACKGROUND_SIZE = 100

// fiber's `ThreeCamera` union types `.manual` on Orthographic/PerspectiveCamera; ArrayCamera
// (a PerspectiveCamera subclass, `reference/three.js/src/cameras/ArrayCamera.js`) inherits the
// runtime behavior but isn't itself in that union — same duck-typed-property cast family as
// AGENTS.md's `*Node` field casts (UPSTREAM.md B11), local to this file.
type ManualArrayCamera = ArrayCamera & { manual?: boolean }

// Builds the ArrayCamera + its `amount * amount` sub-cameras (original's `init()`). Each
// sub-camera gets its own `.viewport` — a plain bolt-on `Vector4`, exactly like the original;
// `@types/three`'s base `Camera` declares `viewport?: Vector4` for it. Positions/aspect are
// filled in reactively by `CameraArrayRig`'s size effect below.
function createArrayCamera(amount: number): ManualArrayCamera {
  const subCameras: PerspectiveCamera[] = []
  for (let i = 0; i < amount * amount; i++) {
    const subCamera = new PerspectiveCamera(40, 1, 0.1, 10)
    subCamera.viewport = new Vector4()
    subCameras.push(subCamera)
  }

  const arrayCamera = new ArrayCamera(subCameras) as ManualArrayCamera
  arrayCamera.position.z = 3
  arrayCamera.manual = true

  return arrayCamera
}

interface CameraArrayRigProps {
  amount: number
  rotationSpeed: number
  cylinderColor: string
}

// Owns the two things the original's `updateCameras()`/`animate()` mutate every frame or
// resize: sub-camera viewport+aspect (size-driven), and the tracked cylinder's spin.
function CameraArrayRig({ amount, rotationSpeed, cylinderColor }: CameraArrayRigProps) {
  const camera = useThree((state) => state.camera) as ManualArrayCamera
  const size = useThree((state) => state.size)
  const meshRef = useRef<Mesh>(null)

  // Sub-camera viewport + aspect follow the CANVAS size — fiber's reactive `size` replaces
  // the original's manual `window.addEventListener('resize', ...)` handler. Positions/lookAt
  // don't actually depend on size, but the original recomputes them on every call to
  // `updateCameras()` too (init AND resize) — cheap, and keeps this the single source of
  // truth for the whole rig instead of splitting it across a one-time effect and a resize one.
  useEffect(() => {
    const aspect = size.width / size.height
    const width = size.width / amount
    const height = size.height / amount

    camera.aspect = aspect
    camera.updateProjectionMatrix()

    for (let y = 0; y < amount; y++) {
      for (let x = 0; x < amount; x++) {
        const subCamera = camera.cameras[amount * y + x]
        subCamera.copy(camera) // fov/aspect/near/far from the root camera

        // Non-null: every sub-camera got a `.viewport` in `createArrayCamera` above.
        subCamera.viewport!.set(Math.floor(x * width), Math.floor(y * height), Math.ceil(width), Math.ceil(height))
        subCamera.updateProjectionMatrix()

        subCamera.position.x = x / amount - 0.5
        subCamera.position.y = 0.5 - y / amount
        subCamera.position.z = 1.5 + (x + y) * 0.5
        subCamera.position.multiplyScalar(2)

        subCamera.lookAt(0, 0, 0)
        subCamera.updateMatrixWorld()
      }
    }
  }, [camera, amount, size.width, size.height])

  useFrame((_state, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    // 0.3/0.6 rad/s reproduces the original's fixed `+= 0.005`/`+= 0.01` per-frame pace at
    // 60fps, now frame-rate independent via `delta`.
    mesh.rotation.x += delta * rotationSpeed * 0.3
    mesh.rotation.z += delta * rotationSpeed * 0.6
  })

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
      <meshPhongNodeMaterial color={cylinderColor} />
    </mesh>
  )
}

export default function CameraArrayExample() {
  const { amount, rotationSpeed, cylinderColor, backgroundColor } = useControls('camera-array', {
    amount: { value: 6, min: 2, max: 8, step: 1, label: 'Grid size (N×N)' },
    rotationSpeed: { value: 1, min: 0, max: 3, step: 0.1 },
    cylinderColor: { value: '#ff0000', label: 'cylinder color' },
    backgroundColor: { value: '#000066', label: 'background color' },
  })

  // Rebuilt whenever `amount` changes — see DIVERGENCE for why the Canvas remounts
  // (`key={amount}`) alongside it rather than hot-swapping fiber's default camera.
  const camera = useMemo(() => createArrayCamera(amount), [amount])

  return (
    <Canvas key={amount} renderer shadows background="#000000" camera={camera}>
      <ambientLight color="#999999" />
      <directionalLight position={[0.5, 0.5, 1]} intensity={3} castShadow shadow-camera-zoom={4} />
      <mesh position={[0, 0, -1]} receiveShadow>
        <planeGeometry args={[BACKGROUND_SIZE, BACKGROUND_SIZE]} />
        <meshPhongNodeMaterial color={backgroundColor} />
      </mesh>
      <CameraArrayRig amount={amount} rotationSpeed={rotationSpeed} cylinderColor={cylinderColor} />
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  )
}
