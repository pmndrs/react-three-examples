/**
 * materials-arrays
 * R3F port of three.js `webgpu_materials_arrays`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materials_arrays (~150 lines of JS)
 *
 * DEMONSTRATES
 * - Geometry groups + a material ARRAY: `BufferGeometry.clearGroups()` /
 *   `addGroup(start, count, materialIndex)` slices a plane and a box's index range into
 *   per-face-set material assignments, and `<mesh material={[m0, m1, m2]}>` (a plain JS
 *   array on the `material` prop — no special fiber API) draws each group with its own
 *   entry in the array, matching three.js's own `mesh.material = [...]` convention
 *   one-for-one
 * - Same grouped geometry reused for a solid pass and a wireframe pass (two meshes
 *   sharing one `BufferGeometry` instance, two different material arrays) — geometry
 *   and material are fully decoupled inputs, not a fused "look"
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector` GUI toggle (WebGPU vs forced-WebGL renderer,
 *   swapping `scene.background` between black/#222) is dropped — this repo is
 *   WebGPU-only, so the toggle carries no information. `scene.background` is fixed to
 *   the WebGPU-path color (`#222222`) via Canvas's `background` prop
 * - Groups are built once with `useMemo` over imperative `clearGroups`/`addGroup` calls
 *   (there's no declarative geometry-group JSX surface); the geometry itself is still
 *   authored as JSX (`<planeGeometry>`/`<boxGeometry>`) and grouped via a `ref` callback
 *   pattern, avoiding a second geometry construction path
 */
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber/webgpu'
import { DoubleSide, type BufferGeometry, type Mesh } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const COLORS = ['#ff1493', '#0000ff', '#00ff00'] as const

// Slices a plane's 4x4-subdivided triangle list into three horizontal bands, one
// material index per band (original: three addGroup calls, each `numFacesPerRow` quads
// = 6 * 4 indices wide).
function groupPlane(geometry: BufferGeometry) {
  geometry.clearGroups()
  const facesPerBand = 6 * 4
  geometry.addGroup(0, facesPerBand, 0)
  geometry.addGroup(facesPerBand, facesPerBand, 1)
  geometry.addGroup(facesPerBand * 2, facesPerBand, 2)
}

// Assigns one material per box face (6 indices each), pairing opposite faces to the
// same material index — original: front/back -> 0, left/right -> 1, top/bottom -> 2.
function groupBox(geometry: BufferGeometry) {
  geometry.clearGroups()
  geometry.addGroup(0, 6, 0) // front
  geometry.addGroup(6, 6, 0) // back
  geometry.addGroup(12, 6, 2) // top
  geometry.addGroup(18, 6, 2) // bottom
  geometry.addGroup(24, 6, 1) // left
  geometry.addGroup(30, 6, 1) // right
}

function MaterialArraysScene() {
  // Solid materials (shared by the plane and the box) plus a wireframe clone per
  // color, matching the original's separate `materialsWireframe` array.
  const materials = useMemo(
    () => COLORS.map((color) => ({ color, side: DoubleSide })),
    [],
  )

  const planeRef = useRef<Mesh>(null)
  const planeWireframeRef = useRef<Mesh>(null)
  const boxRef = useRef<Mesh>(null)
  const boxWireframeRef = useRef<Mesh>(null)

  // Groups must land before the first render draws the mesh with its material array —
  // useLayoutEffect (not useEffect) per the "imperative setup that must precede first
  // render" rule (AGENTS.md).
  useLayoutEffect(() => {
    if (planeRef.current) groupPlane(planeRef.current.geometry)
    if (planeWireframeRef.current) groupPlane(planeWireframeRef.current.geometry)
    if (boxRef.current) groupBox(boxRef.current.geometry)
    if (boxWireframeRef.current) groupBox(boxWireframeRef.current.geometry)
  }, [])

  useFrame((_, delta) => {
    const spin = delta * 1 // ~0.005/frame at 60fps, matching the original's per-frame increment
    if (boxRef.current) {
      boxRef.current.rotation.y += spin
      boxRef.current.rotation.x += spin
    }
    if (boxWireframeRef.current) {
      boxWireframeRef.current.rotation.y += spin
      boxWireframeRef.current.rotation.x += spin
    }
  })

  return (
    <>
      {/* Plane — solid (bottom-left) and wireframe (top-left) */}
      <mesh ref={planeRef} position={[-1.5, -1, 0]}>
        <planeGeometry args={[1, 1, 4, 4]} />
        {materials.map((m, i) => (
          <meshBasicNodeMaterial key={i} attach={`material-${i}`} color={m.color} side={m.side} />
        ))}
      </mesh>
      <mesh ref={planeWireframeRef} position={[-1.5, 1, 0]}>
        <planeGeometry args={[1, 1, 4, 4]} />
        {materials.map((m, i) => (
          <meshBasicNodeMaterial key={i} attach={`material-${i}`} color={m.color} side={m.side} wireframe />
        ))}
      </mesh>

      {/* Box — solid (bottom-right, spinning) and wireframe (top-right, spinning) */}
      <mesh
        ref={boxRef}
        position={[1.5, -0.75, 0]}
        rotation={[-Math.PI / 8, Math.PI / 4, Math.PI / 4]}
      >
        <boxGeometry args={[0.75, 0.75, 0.75]} />
        {materials.map((m, i) => (
          <meshBasicNodeMaterial key={i} attach={`material-${i}`} color={m.color} side={m.side} />
        ))}
      </mesh>
      <mesh
        ref={boxWireframeRef}
        position={[1.5, 1.25, 0]}
        rotation={[-Math.PI / 8, Math.PI / 4, Math.PI / 4]}
      >
        <boxGeometry args={[0.75, 0.75, 0.75]} />
        {materials.map((m, i) => (
          <meshBasicNodeMaterial key={i} attach={`material-${i}`} color={m.color} side={m.side} wireframe />
        ))}
      </mesh>
    </>
  )
}

export default function MaterialsArrays() {
  return (
    <Canvas renderer background="#222222" camera={{ position: [0, 0, 10], fov: 40, near: 1, far: 100 }}>
      <MaterialArraysScene />
      <DemoHelpers grid={false} />
    </Canvas>
  )
}
