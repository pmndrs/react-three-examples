/**
 * clipping
 * R3F port of three.js `webgpu_clipping`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_clipping (~155 lines of JS)
 *
 * DEMONSTRATES
 * - `ClippingGroup` (a `THREE.Group` subclass, WebGPURenderer-only): clipping state
 *   lives in the scene graph instead of a global `renderer.clippingPlanes` array —
 *   every descendant inherits its nearest ancestor `ClippingGroup`'s `clippingPlanes`
 * - Nested `ClippingGroup`s composing: an outer group clips everything (knot + ground)
 *   with one world-space plane; an inner group (torus knot only) clips with two more
 *   planes AND `clipIntersection` — the *intersection* of half-spaces (carves a notch)
 *   rather than the default union
 * - Per-group `enabled`/`clipShadows` toggles — `clipShadows` clips the shadow pass
 *   independently of whether the visible geometry is being clipped
 * - `alphaToCoverage` on `MeshPhongNodeMaterial`: MSAA-based antialiasing of the clip
 *   edge instead of a hard, aliased cut
 *
 * DIVERGENCE from original
 * - `renderer.inspector`'s dat.gui-style panel (`createParameters`/`addFolder`)
 *   replaced with leva controls — same mapping: per-group Enabled/Plane, the knot
 *   group's extra Shadows/Intersection toggles, and the shared alphaToCoverage flag
 * - OrbitControls replaced with this repo's CameraControls wrapper (via DemoHelpers),
 *   `target` kept at the original's `[0, 1, 0]`
 * - `Date.now()`-based `startTime`/elapsed-time bookkeeping dropped; `useFrame`'s
 *   `state.elapsed` drives the knot's spin/bob/scale directly
 */
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber/webgpu'
import { folder, useControls } from 'leva'
import { DoubleSide, Plane, Vector3 } from 'three/webgpu'
import type { ClippingGroup, Mesh, MeshPhongNodeMaterial } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

interface ClippingSceneProps {
  alphaToCoverage: boolean
  knotEnabled: boolean
  knotShadows: boolean
  knotIntersection: boolean
  knotPlane: number
  globalEnabled: boolean
  globalPlane: number
}

function ClippingScene({
  alphaToCoverage,
  knotEnabled,
  knotShadows,
  knotIntersection,
  knotPlane,
  globalEnabled,
  globalPlane,
}: ClippingSceneProps) {
  const knotRef = useRef<Mesh>(null)
  const knotMaterialRef = useRef<MeshPhongNodeMaterial>(null)
  const groundMaterialRef = useRef<MeshPhongNodeMaterial>(null)
  const globalGroupRef = useRef<ClippingGroup>(null)

  // Plain three.js `Plane` instances, mutated in place — a `ClippingGroup` reads the
  // same Plane objects every frame, and Plane has no reactive JSX representation.
  const globalPlaneObj = useMemo(() => new Plane(new Vector3(-1, 0, 0), 0.1), [])
  const localPlane1 = useMemo(() => new Plane(new Vector3(0, -1, 0), 0.8), [])
  const localPlane2 = useMemo(() => new Plane(new Vector3(0, 0, -1), 0.1), [])

  const globalClippingPlanes = useMemo(() => [globalPlaneObj], [globalPlaneObj])
  const knotClippingPlanes = useMemo(() => [localPlane1, localPlane2], [localPlane1, localPlane2])

  useEffect(() => {
    globalPlaneObj.constant = globalPlane
  }, [globalPlaneObj, globalPlane])

  useEffect(() => {
    localPlane1.constant = knotPlane
  }, [localPlane1, knotPlane])

  useEffect(() => {
    const knotMat = knotMaterialRef.current
    const groundMat = groundMaterialRef.current
    if (knotMat) {
      knotMat.alphaToCoverage = alphaToCoverage
      knotMat.needsUpdate = true
    }
    if (groundMat) {
      groundMat.alphaToCoverage = alphaToCoverage
      groundMat.needsUpdate = true
    }
  }, [alphaToCoverage])

  useFrame((state) => {
    const knot = knotRef.current
    if (!knot) return
    const time = state.elapsed
    knot.position.y = 0.8
    knot.rotation.x = time * 0.5
    knot.rotation.y = time * 0.2
    knot.scale.setScalar(Math.cos(time) * 0.125 + 0.875)
  })

  return (
    <>
      <ambientLight color="#cccccc" />
      <spotLight
        color="#ffffff"
        intensity={60}
        angle={Math.PI / 5}
        penumbra={0.2}
        position={[2, 3, 3]}
        castShadow
        shadow-camera-near={3}
        shadow-camera-far={10}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-radius={4}
      />
      <directionalLight
        color="#55505a"
        intensity={3}
        position={[0, 3, 0]}
        castShadow
        shadow-camera-near={1}
        shadow-camera-far={10}
        shadow-camera-left={-1}
        shadow-camera-right={1}
        shadow-camera-top={1}
        shadow-camera-bottom={-1}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      {/* Outer group: clips knot + ground with one global-space plane. */}
      <clippingGroup ref={globalGroupRef} clippingPlanes={globalClippingPlanes} enabled={globalEnabled}>
        {/* Inner group: knot only, two planes, intersection (notch) instead of union. */}
        <clippingGroup
          clippingPlanes={knotClippingPlanes}
          clipIntersection={knotIntersection}
          clipShadows={knotShadows}
          enabled={knotEnabled}
        >
          <mesh ref={knotRef} castShadow>
            <torusKnotGeometry args={[0.4, 0.08, 95, 20]} />
            <meshPhongNodeMaterial ref={knotMaterialRef} color="#80ee10" shininess={0} side={DoubleSide} alphaToCoverage />
          </mesh>
        </clippingGroup>

        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[9, 9, 1, 1]} />
          <meshPhongNodeMaterial ref={groundMaterialRef} color="#a0adaf" shininess={150} alphaToCoverage />
        </mesh>
      </clippingGroup>
    </>
  )
}

export default function Clipping() {
  const { alphaToCoverage, knotEnabled, knotShadows, knotIntersection, knotPlane, globalEnabled, globalPlane } =
    useControls('clipping', {
      alphaToCoverage: true,
      knot: folder({
        knotEnabled: { value: true, label: 'Enabled' },
        knotShadows: { value: false, label: 'Shadows' },
        knotIntersection: { value: true, label: 'Intersection' },
        knotPlane: { value: 0.8, min: 0.3, max: 1.25, step: 0.01, label: 'Plane' },
      }),
      global: folder({
        globalEnabled: { value: true, label: 'Enabled' },
        globalPlane: { value: 0.1, min: -0.4, max: 3, step: 0.01, label: 'Plane' },
      }),
    })

  return (
    <Canvas renderer shadows background="#000000" camera={{ position: [0, 1.3, 3], fov: 36, near: 0.25, far: 16 }}>
      <ClippingScene
        alphaToCoverage={alphaToCoverage}
        knotEnabled={knotEnabled}
        knotShadows={knotShadows}
        knotIntersection={knotIntersection}
        knotPlane={knotPlane}
        globalEnabled={globalEnabled}
        globalPlane={globalPlane}
      />
      <DemoHelpers target={[0, 1, 0]} />
    </Canvas>
  )
}
