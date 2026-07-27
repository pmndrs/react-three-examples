/**
 * refraction
 * R3F port of three.js `webgpu_refraction`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_refraction (~150 lines of JS)
 *
 * DEMONSTRATES
 * - `viewportSharedTexture()` — sampling the renderer's own in-progress frame as a
 *   texture — fed through `viewportSafeUV()` (clamps the lookup so it never samples
 *   outside the rendered viewport) into `MeshBasicNodeMaterial.backdropNode`. This
 *   fakes a refraction "window" onto the room behind the plane without a second render
 *   target or pass. `backdropNode`/`backdropAlphaNode` are declared directly on the
 *   `NodeMaterial` base class in `@types/three` (confirmed in
 *   `three/src/materials/nodes/NodeMaterial.js`) — no duck-typed cast needed, unlike
 *   `scene.backgroundNode`/`fogNode` elsewhere in this repo
 * - A normal map read through `texture(floorNormal, uv().mul(tile))` reshaped into a
 *   [-1,1] offset and added onto `screenUV` — the same "sample a normal map, remap,
 *   perturb a UV" node-composition shape as `reflection/ReflectiveFloor.tsx`, applied to
 *   screen space instead of world UV
 * - A `THREE.Mesh` (plain `IcosahedronGeometry` + `meshPhongMaterial`, no node material
 *   needed) orbited procedurally in `useFrame` off `state.elapsed` — the imperative
 *   escape hatch Layer 1 asks to showcase, matching the original's per-frame
 *   position/rotation assignment almost verbatim
 *
 * DIVERGENCE from original
 * - `renderer.inspector = new Inspector()` and the graph's `.toInspector(...)` tap
 *   dropped — this repo doesn't wire the Inspector RootState slot yet (same gap noted
 *   in `postprocessing-bloom-emissive`/`reflection`)
 * - The original's `Date.now() * 0.01` orbit timer is reproduced as `state.elapsed`
 *   scaled to match (dividing the original's per-property multipliers by 10, since
 *   `elapsed` is already in seconds): identical orbit shape and speed, just measured
 *   from mount instead of the epoch. `orbitSpeed` exposed via leva as a multiplier the
 *   original hard-codes at 1
 * - `normalScale` and `uvTile` (the screen-space UV distortion's strength and the
 *   normal-map tiling) exposed via leva; the original hard-codes them at 0.1 and 5
 * - DemoHelpers' camera-controls orbit swaps in for `OrbitControls`; target (0,50,0)
 *   and min/max dolly distance (10/400) forwarded to match the original's controls.
 *   Grid disabled (`grid={false}`) — the room's own floor/wall planes ARE the ground
 *   this example is staged on, and DemoHelpers' world-space grid sits at y=0.002,
 *   coincident with (and visually clashing against) the room's bottom plane
 */
import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { folder, useControls } from 'leva'
import { screenUV, texture, uv, viewportSafeUV, viewportSharedTexture } from 'three/tsl'
import { MeshBasicNodeMaterial, RepeatWrapping } from 'three/webgpu'
import type { Mesh } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const FLOOR_NORMAL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/floors/FloorsCheckerboard_S_Normal.jpg'

interface RefractorPlaneProps {
  normalScale: number
  uvTile: number
}

// The "window" plane: backdropNode samples the frame already being rendered (the room
// behind it), distorted by a tiled normal map — see header DEMONSTRATES.
function RefractorPlane({ normalScale, uvTile }: RefractorPlaneProps) {
  const floorNormal = useTexture(FLOOR_NORMAL_URL)

  const material = useMemo(() => {
    floorNormal.wrapS = RepeatWrapping
    floorNormal.wrapT = RepeatWrapping

    const uvOffset = texture(floorNormal, uv().mul(uvTile)).xy.mul(2).sub(1).mul(normalScale)
    const refractorUV = screenUV.add(uvOffset)

    const mat = new MeshBasicNodeMaterial({
      backdropNode: viewportSharedTexture(viewportSafeUV(refractorUV)),
    })
    mat.transparent = true
    return mat
  }, [floorNormal, normalScale, uvTile])

  return (
    <mesh material={material} position={[0, 50, 0]}>
      <planeGeometry args={[100.1, 100.1]} />
    </mesh>
  )
}

interface OrbitingSphereProps {
  orbitSpeed: number
}

// Plain THREE.Mesh orbited imperatively in useFrame — no node material required, this
// object exists only to give the refractor plane something moving to distort.
function OrbitingSphere({ orbitSpeed }: OrbitingSphereProps) {
  const ref = useRef<Mesh>(null)

  useFrame((state) => {
    const mesh = ref.current
    if (!mesh) return

    const t = state.elapsed * orbitSpeed
    mesh.position.set(Math.cos(t) * 30, Math.abs(Math.cos(t * 2)) * 20 + 5, Math.sin(t) * 30)
    mesh.rotation.y = Math.PI / 2 - t
    mesh.rotation.z = t * 8
  })

  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[5, 0]} />
      <meshPhongMaterial color="#ffffff" emissive="#7b7b7b" flatShading />
    </mesh>
  )
}

export default function Refraction() {
  const { normalScale, uvTile, orbitSpeed } = useControls('refraction', {
    Refractor: folder({
      normalScale: { value: 0.1, min: 0, max: 0.5, step: 0.01 },
      uvTile: { value: 5, min: 1, max: 20, step: 1 },
    }),
    Sphere: folder({
      orbitSpeed: { value: 1, min: 0, max: 3, step: 0.05 },
    }),
  })

  return (
    <Canvas renderer camera={{ position: [0, 50, 160], fov: 45, near: 1, far: 500 }}>
      <OrbitingSphere orbitSpeed={orbitSpeed} />
      {/* Explicit boundary: suspending up to Canvas's own boundary re-runs createRoot
          on fiber alpha.3 and freezes every TSL `time` graph (see AGENTS.md; found by
          tsl-vfx-flames' pixel-diff sweep — this example shipped frozen). */}
      <Suspense fallback={null}>
        <RefractorPlane normalScale={normalScale} uvTile={uvTile} />
      </Suspense>

      {/* Room: floor, ceiling, back, and two side walls (front stays open to the camera). */}
      <mesh position={[0, 100, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[100.1, 100.1]} />
        <meshPhongMaterial color="#ffffff" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[100.1, 100.1]} />
        <meshPhongMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 50, -50]}>
        <planeGeometry args={[100.1, 100.1]} />
        <meshPhongMaterial color="#7f7fff" />
      </mesh>
      <mesh position={[50, 50, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[100.1, 100.1]} />
        <meshPhongMaterial color="#00ff00" />
      </mesh>
      <mesh position={[-50, 50, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[100.1, 100.1]} />
        <meshPhongMaterial color="#ff0000" />
      </mesh>

      <pointLight color="#e7e7e7" intensity={2.5} position={[0, 60, 0]} distance={250} decay={0} />
      <pointLight color="#00ff00" intensity={0.5} position={[550, 50, 0]} distance={1000} decay={0} />
      <pointLight color="#ff0000" intensity={0.5} position={[-550, 50, 0]} distance={1000} decay={0} />
      <pointLight color="#bbbbfe" intensity={0.5} position={[0, 50, 550]} distance={1000} decay={0} />

      <DemoHelpers grid={false} target={[0, 50, 0]} minDistance={10} maxDistance={400} />
    </Canvas>
  )
}
