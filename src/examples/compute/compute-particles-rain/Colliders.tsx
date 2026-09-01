// The two rain colliders. Each opts into layer 1 — the collision camera's
// exclusive layer (Rain.tsx) — so the heightmap pass sees them and the main
// camera still does too (enable() adds a layer, it doesn't replace layer 0).
import { useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometryLoader, Vector3, type Mesh } from 'three/webgpu'
import { useFrame, useLoader } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'

const SUZANNE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/json/suzanne_buffergeometry.json'

export function CollisionBox() {
  const boxRef = useRef<Mesh>(null)
  const targetPos = useMemo(() => new Vector3(0, 12, 0), [])
  // z/scaleX names kept distinct from the mesh's own `position`/`scale` props below.
  const { position: z, scale: scaleX } = useControls('compute-particles-rain', {
    position: { value: 0, min: -50, max: 50, step: 0.001 },
    scale: { value: 3.5, min: 0.1, max: 3.5, step: 0.01 },
  })

  useLayoutEffect(() => {
    boxRef.current?.layers.enable(1)
  }, [])

  useFrame(({ delta }) => {
    const box = boxRef.current
    if (!box) return
    // The original negates the slider so dragging right moves the box toward the
    // camera-right side; t clamped — 10*delta overshoots below ~10 fps (CI raster).
    targetPos.set(0, 12, -z)
    box.position.lerp(targetPos, Math.min(10 * delta, 1))
  })

  return (
    <mesh ref={boxRef} position={[0, 12, 0]} scale-x={scaleX}>
      <boxGeometry args={[30, 1, 15]} />
      <meshStandardMaterial color="#333333" />
    </mesh>
  )
}

// Suspends on the hotlinked Suzanne JSON — the parent gates it with an explicit
// <Suspense> (AGENTS.md B17); rain falls while the monkey loads.
export function Monkey() {
  const geometry = useLoader(BufferGeometryLoader, SUZANNE_URL)
  const monkeyRef = useRef<Mesh>(null)

  // The JSON ships no normals; compute them on the loader-cached geometry and enable
  // the collision layer before the mesh's first render (idempotent, safe under
  // StrictMode's double-invoke).
  useLayoutEffect(() => {
    geometry.computeVertexNormals()
    monkeyRef.current?.layers.enable(1)
  }, [geometry])

  useFrame(({ delta }) => {
    const monkey = monkeyRef.current
    if (!monkey) return
    monkey.rotation.y += delta
  })

  return (
    <mesh ref={monkeyRef} geometry={geometry} scale={5} rotation-y={Math.PI / 2} position-y={4.5}>
      <meshStandardMaterial roughness={1} metalness={0} />
    </mesh>
  )
}
