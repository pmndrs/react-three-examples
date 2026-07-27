/**
 * materials-basic
 * R3F port of three.js `webgpu_materials_basic`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materials_basic (~110 lines of JS)
 *
 * DEMONSTRATES
 * - `MeshBasicNodeMaterial` shaded purely by a cube-mapped `envMap` (no lights) — the
 *   Reflection/Refraction mapping toggle and `refractionRatio` are read straight off
 *   the classic `MeshBasicMaterial` properties `setDefaultValues` copies onto the node
 *   material (`reference/three.js/src/materials/nodes/NodeMaterial.js`), fully typed
 *   via `@types/three`'s `MeshBasicMaterialProperties` mixin — no cast needed. Same
 *   build-time-vs-live-uniform split as `materials-envmaps`: switching Reflection<->
 *   Refraction rebuilds the shader graph (`material.needsUpdate`), while
 *   `refractionRatio` is a live per-frame uniform (`MaterialProperties.js`)
 * - 500 spheres as one `THREE.InstancedMesh` (the `instance-mesh` pattern) instead of
 *   500 individual `Mesh` objects — per-instance scale/depth randomized once, XY driven
 *   every frame by the original's `5*cos/sin(timer + i)` orbit formula via
 *   `setMatrixAt`
 * - `state.pointer` (fiber's tracked NDC pointer, the `rtt` pattern) replacing a manual
 *   `mousemove` listener + `windowHalfX/Y` division, eased toward the camera with
 *   `MathUtils.damp` for frame-rate-independent parallax
 *
 * DIVERGENCE from original
 * - The original's per-object `Mesh` loop is ported as one `InstancedMesh` (matches
 *   this repo's `instance-mesh` precedent) — visually identical, one draw call instead
 *   of 500
 * - Camera parallax: original tracked raw `mousemove` pixel offset (`/100`) lerped at a
 *   fixed `*0.05` per rendered frame; ported to fiber's normalized `state.pointer`,
 *   scaled to a comparable world-space range and eased with `MathUtils.damp`
 *   (frame-rate independent instead of tied to display refresh rate)
 * - `renderer.inspector.createParameters` dat.gui-style panel replaced with leva
 *   controls — same five parameters as the original GUI (color, mapping, refraction
 *   ratio, transparent, opacity)
 * - DemoHelpers mounted with `grid={false} controls={false}`: the scene is a full
 *   cube-map skybox with no ground plane, and the camera is driven entirely by pointer
 *   parallax (no user-navigable orbit target) — DemoHelpers still renders the readiness
 *   signal
 */
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useCubeTexture } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import {
  CubeReflectionMapping,
  CubeRefractionMapping,
  MathUtils,
  MeshBasicNodeMaterial,
  Object3D,
  SphereGeometry,
} from 'three/webgpu'
import type { InstancedMesh } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const CUBE_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/cube/pisa/'
const CUBE_FILES = ['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']

const SPHERE_COUNT = 500
// Camera parallax scale/ease: original's mousemove was raw pixel offset / 100 (several
// world units at typical viewport widths) lerped at a fixed 0.05/frame; fiber's
// state.pointer is NDC -1..1, so RANGE maps it back to a comparable wander and DAMP is
// the MathUtils.damp lambda tuned to match the original's apparent easing at 60fps.
const PARALLAX_RANGE = 4
const PARALLAX_DAMP = 4

// Scratch object reused across the per-frame matrix loop (no per-frame allocation).
const dummy = new Object3D()

// Per-instance random scale (1..4) and Z depth (-5..5), computed once. The original
// also randomizes mesh.position.x/y at init, but its animate() loop overwrites both
// every frame before the first paint, so only scale and Z ever reach the screen.
const instanceData = Array.from({ length: SPHERE_COUNT }, () => ({
  scale: Math.random() * 3 + 1,
  z: Math.random() * 10 - 5,
}))

interface SphereSwarmProps {
  color: string
  refraction: boolean
  refractionRatio: number
  transparent: boolean
  opacity: number
}

function SphereSwarm({ color, refraction, refractionRatio, transparent, opacity }: SphereSwarmProps) {
  const scene = useThree((s) => s.scene)
  const textureCube = useCubeTexture(CUBE_FILES, { path: CUBE_PATH })

  const geometry = useMemo(() => new SphereGeometry(0.1, 32, 16), [])
  const material = useMemo(() => new MeshBasicNodeMaterial(), [])
  const meshRef = useRef<InstancedMesh>(null)

  useEffect(() => {
    scene.background = textureCube
    material.envMap = textureCube
  }, [scene, material, textureCube])

  // Mapping type is read at shader-graph BUILD time — see header DEMONSTRATES.
  useEffect(() => {
    textureCube.mapping = refraction ? CubeRefractionMapping : CubeReflectionMapping
    material.needsUpdate = true
  }, [material, textureCube, refraction])

  useEffect(() => {
    material.color.set(color)
  }, [material, color])

  // Live per-frame uniform (MaterialProperties.materialRefractionRatio) — no rebuild.
  useEffect(() => {
    material.refractionRatio = refractionRatio
  }, [material, refractionRatio])

  useEffect(() => {
    material.transparent = transparent
    material.needsUpdate = true
  }, [material, transparent])

  useEffect(() => {
    material.opacity = opacity
  }, [material, opacity])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return

    const timer = state.elapsed * 0.1

    for (let i = 0; i < SPHERE_COUNT; i++) {
      const { scale, z } = instanceData[i]
      dummy.position.set(5 * Math.cos(timer + i), 5 * Math.sin(timer + i * 1.1), z)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={meshRef} args={[geometry, material, SPHERE_COUNT]} />
}

// Pointer-parallax camera: no orbit controls (see header DIVERGENCE) — the camera eases
// toward the tracked pointer position every frame and always looks at the origin,
// matching the original's mousemove-driven rig.
function ParallaxCamera() {
  useFrame((state, delta) => {
    const { camera, pointer } = state
    camera.position.x = MathUtils.damp(camera.position.x, pointer.x * PARALLAX_RANGE, PARALLAX_DAMP, delta)
    camera.position.y = MathUtils.damp(camera.position.y, pointer.y * PARALLAX_RANGE, PARALLAX_DAMP, delta)
    camera.lookAt(0, 0, 0)
  })
  return null
}

export default function MaterialsBasic() {
  const { color, refraction, refractionRatio, transparent, opacity } = useControls('materials-basic', {
    color: '#ffffff',
    refraction: false,
    refractionRatio: { value: 0.98, min: 0, max: 1, step: 0.01 },
    transparent: false,
    opacity: { value: 1, min: 0, max: 1, step: 0.01 },
  })

  return (
    <Canvas renderer camera={{ position: [0, 0, 3], fov: 60, near: 0.01, far: 100 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <SphereSwarm
          color={color}
          refraction={refraction}
          refractionRatio={refractionRatio}
          transparent={transparent}
          opacity={opacity}
        />
      </Suspense>
      <ParallaxCamera />
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  )
}
