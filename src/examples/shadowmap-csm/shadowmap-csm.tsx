/**
 * shadowmap-csm
 * R3F port of three.js `webgpu_shadowmap_csm`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_shadowmap_csm (~250 lines of JS)
 * By StrandedKitty (https://github.com/strandedkitty/three-csm), ported to WebGPU TSL.
 *
 * DEMONSTRATES
 * - `CSMShadowNode` (three/addons/csm) splits one directional light's shadow frustum
 *   into N cascades — near cascades get a tight, high-resolution shadow camera, far
 *   cascades a loose one — instead of one shadow camera stretched over a huge scene
 *   (the 4000-unit box corridor here would be unusably blurry with a single map).
 *   Wired imperatively: `light.shadow.shadowNode = new CSMShadowNode(light, {
 *   cascades, maxFar, mode })`, the same "three.js API as a visible escape hatch"
 *   pattern as `mesh-batch`'s `BatchedMesh` and the sibling `shadowmap-array` port
 * - `CSMHelper` — cascade frustum wireframes + split-plane visualization; `.update()`
 *   every frame while `autoUpdateHelper` is on, or on demand via a leva button
 * - CSM works under EITHER a perspective or an orthographic camera: toggling
 *   `orthographic` swaps which of two `<PerspectiveCamera>`/`<OrthographicCamera>`
 *   carries `makeDefault`, and `CsmLight` just re-points `csm.camera` at
 *   `useThree(s => s.camera)` — no manual per-frame camera-copying needed, because
 *   this repo's `CameraControls` wrapper already rebinds itself to whichever camera is
 *   currently default (its `useMemo` depends on `state.camera`)
 * - Split modes (`uniform`/`logarithmic`/`practical`) and `maxFar` are live-mutated +
 *   `csm.updateFrustums()`, matching the original's dat.gui `onChange` handlers;
 *   `cascades` (2–4) instead REBUILDS the node (`csm.lights` is sized at construction)
 *
 * DIVERGENCE from original
 * - The orthographic camera's frustum half-extents are computed ONCE from the initial
 *   camera distance/target (module-scope constants) instead of the original's
 *   `updateOrthoCamera()` recomputing left/right/top/bottom from
 *   `controls.target.distanceTo(camera.position)` every frame. Scale changes after
 *   that are handled by `camera-controls`' own wheel-dolly-to-`camera.zoom` mapping
 *   for orthographic cameras (`DemoHelpers`' `minZoom`/`maxZoom`), which the original's
 *   raw `OrthographicCamera` + `OrbitControls` combination doesn't have.
 * - `fade` is dropped: the original's own GUI comments it out with a `TODO: Changing
 *   "fade" requires toggling shadows right now` — not a working control to port.
 * - `shadowNear`/`shadowFar` GUI sliders apply to whichever cascade lights already
 *   exist (`csm.lights` is empty until the first shadow render) — a no-op if changed
 *   before the scene has rendered once, same as the original's timing assumption.
 * - `renderer.inspector` GUI replaced by leva `useControls`, same control surface
 *   (orthographic, shadows, maxFar, mode, light direction x/y/z, margin, shadow
 *   near/far, helper visibility group) plus `cascades` (new, see above).
 * - OrbitControls -> this repo's `CameraControls` (via `DemoHelpers`), same
 *   `(-100, 10, 0)` target and `maxPolarAngle` clamp as the original; grid disabled
 *   (`grid={false}`) — the original's own 10000×10000 floor plane is the receiver.
 */
import { useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { OrthographicCamera, PerspectiveCamera } from '@react-three/drei/webgpu'
import { button, folder, useControls } from 'leva'
import { NoToneMapping } from 'three/webgpu'
import type { Mesh } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { CsmLight } from './CsmLight'

const CAMERA_POSITION: [number, number, number] = [60, 60, 0]
const CAMERA_TARGET: [number, number, number] = [-100, 10, 0]
const ORTHO_DISTANCE = Math.hypot(
  CAMERA_POSITION[0] - CAMERA_TARGET[0],
  CAMERA_POSITION[1] - CAMERA_TARGET[1],
  CAMERA_POSITION[2] - CAMERA_TARGET[2],
)

// Two rows of 40 boxes flanking the corridor the camera flies down — the scale CSM's
// cascades are built to handle (a single shadow map over this whole span would be
// unusably blurry up close).
function BoxRows() {
  return Array.from({ length: 40 }, (_, i) => {
    const x = -i * 25
    const color1 = i % 2 === 0 ? '#08d9d6' : '#ff2e63'
    const color2 = i % 2 === 0 ? '#ff2e63' : '#08d9d6'
    const scaleY1 = Math.random() * 2 + 6
    const scaleY2 = Math.random() * 2 + 6
    return (
      <group key={i}>
        <mesh position={[x, 20, 30]} scale-y={scaleY1} castShadow receiveShadow>
          <boxGeometry args={[10, 10, 10]} />
          <meshPhongMaterial color={color1} />
        </mesh>
        <mesh position={[x, 20, -30]} scale-y={scaleY2} castShadow receiveShadow>
          <boxGeometry args={[10, 10, 10]} />
          <meshPhongMaterial color={color2} />
        </mesh>
      </group>
    )
  })
}

function Floor() {
  const floorRef = useRef<Mesh>(null)
  return (
    <mesh ref={floorRef} rotation-x={-Math.PI / 2} castShadow receiveShadow>
      <planeGeometry args={[10000, 10000, 8, 8]} />
      <meshPhongMaterial color="#252a34" />
    </mesh>
  )
}

// A dim rim/fill light shining from the SAME direction as the CSM sun (the original
// literally shares the position formula between the two — a deliberate, very dark
// blue counter-light rather than a second key light).
function FillLight({ direction }: { direction: [number, number, number] }) {
  const position = useMemo(() => {
    const [x, y, z] = direction
    const len = Math.hypot(x, y, z) || 1
    return [(x / len) * -200, (y / len) * -200, (z / len) * -200] as [number, number, number]
  }, [direction])

  return <directionalLight color="#000020" intensity={1.5} position={position} />
}

function Cameras({ orthographic }: { orthographic: boolean }) {
  const aspect = useThree((s) => s.size.width / s.size.height)
  const halfHeight = ORTHO_DISTANCE / 2
  const halfWidth = halfHeight * aspect

  return (
    <>
      <PerspectiveCamera
        makeDefault={!orthographic}
        position={CAMERA_POSITION}
        fov={70}
        near={0.1}
        far={5000}
      />
      <OrthographicCamera
        makeDefault={orthographic}
        position={CAMERA_POSITION}
        args={[-halfWidth, halfWidth, halfHeight, -halfHeight, 0.1, 5000]}
      />
    </>
  )
}

export default function ShadowmapCsm() {
  const [manualUpdateNonce, setManualUpdateNonce] = useState(0)

  const {
    orthographic,
    shadowsEnabled,
    cascades,
    maxFar,
    mode,
    lightX,
    lightY,
    lightZ,
    margin,
    shadowNear,
    shadowFar,
    helperVisible,
    displayFrustum,
    displayPlanes,
    displayShadowBounds,
    autoUpdateHelper,
  } = useControls('shadowmap-csm', {
    orthographic: false,
    shadowsEnabled: { value: true, label: 'shadows' },
    cascades: { value: 4, min: 1, max: 4, step: 1 },
    maxFar: { value: 1000, min: 1, max: 5000, step: 1, label: 'max shadow far' },
    mode: { value: 'practical', options: ['uniform', 'logarithmic', 'practical'], label: 'split mode' },
    'light direction': folder({
      lightX: { value: -1, min: -1, max: 1, label: 'x' },
      lightY: { value: -1, min: -1, max: 1, label: 'y' },
      lightZ: { value: -1, min: -1, max: 1, label: 'z' },
    }),
    margin: { value: 100, min: 0, max: 200, label: 'light margin' },
    shadowNear: { value: 1, min: 1, max: 10000, label: 'shadow near' },
    shadowFar: { value: 2000, min: 1, max: 10000, label: 'shadow far' },
    helper: folder({
      helperVisible: { value: false, label: 'visible' },
      displayFrustum: { value: true, label: 'frustum' },
      displayPlanes: { value: true, label: 'planes' },
      displayShadowBounds: { value: true, label: 'shadow bounds' },
      autoUpdateHelper: { value: true, label: 'auto update' },
      'update now': button(() => setManualUpdateNonce((n) => n + 1)),
    }),
  })

  return (
    <Canvas
      // Deliberate NoToneMapping parity: the original never sets renderer.toneMapping,
      // so it renders with the WebGPURenderer default — fiber's Canvas would otherwise
      // default to ACESFilmic and crush the ambient-lit floor (AGENTS.md tone-mapping
      // parity trap).
      renderer={{ toneMapping: NoToneMapping }}
      shadows="basic"
      background="#454e61"
      // camera prop omitted: Cameras below owns both PerspectiveCamera/OrthographicCamera
      // via makeDefault, matching the original's perspective/ortho toggle.
    >
      <Cameras orthographic={orthographic} />
      <ambientLight intensity={1.5} />
      <FillLight direction={[lightX, lightY, lightZ]} />
      <CsmLight
        cascades={cascades}
        maxFar={maxFar}
        mode={mode as 'practical' | 'uniform' | 'logarithmic'}
        lightDirection={[lightX, lightY, lightZ]}
        margin={margin}
        shadowsEnabled={shadowsEnabled}
        shadowNear={shadowNear}
        shadowFar={shadowFar}
        helperVisible={helperVisible}
        displayFrustum={displayFrustum}
        displayPlanes={displayPlanes}
        displayShadowBounds={displayShadowBounds}
        autoUpdateHelper={autoUpdateHelper}
        manualUpdateNonce={manualUpdateNonce}
      />
      <Floor />
      <BoxRows />
      <DemoHelpers
        grid={false}
        target={CAMERA_TARGET}
        maxPolarAngle={Math.PI / 2}
        minZoom={0.1}
        maxZoom={10}
      />
    </Canvas>
  )
}
