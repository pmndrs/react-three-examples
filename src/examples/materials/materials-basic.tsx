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
 * - drei's declarative `Instances`/`Instance` abstraction keeps 500 animated sphere
 *   transforms as React objects while rendering them in one instanced draw call
 * - Material controls are bound directly to JSX props; only cube mapping changes need
 *   an imperative `needsUpdate` because mapping is read when the shader graph builds
 * - `state.pointer` (fiber's tracked NDC pointer, the `rtt` pattern) replacing a manual
 *   `mousemove` listener + `windowHalfX/Y` division, eased toward the camera with
 *   `MathUtils.damp` for frame-rate-independent parallax
 *
 * DIVERGENCE from original
 * - The original's per-object `Mesh` loop uses drei `Instances` proxies — declarative
 *   object transforms and material props backed by one `InstancedMesh` draw call
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
import { Suspense, useEffect, useRef } from 'react'
import { CubeReflectionMapping, CubeRefractionMapping, MathUtils } from 'three/webgpu'
import type { MeshBasicNodeMaterial } from 'three/webgpu'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { Instance, Instances, useCubeTexture } from '@react-three/drei/webgpu'
import type { PositionMesh } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { DemoHelpers } from '../../utils/DemoHelpers'

const CUBE_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/cube/pisa/'
const CUBE_FILES = ['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']

const SPHERE_COUNT = 500
// Camera parallax scale/ease: original's mousemove was raw pixel offset / 100 (several
// world units at typical viewport widths) lerped at a fixed 0.05/frame; fiber's
// state.pointer is NDC -1..1, so RANGE maps it back to a comparable wander and DAMP is
// the MathUtils.damp lambda tuned to match the original's apparent easing at 60fps.
const PARALLAX_RANGE = 4
const PARALLAX_DAMP = 4

// Per-instance random scale (1..4) and Z depth (-5..5), computed once. The original
// also randomizes mesh.position.x/y at init, but its animate() loop overwrites both
// every frame before the first paint, so only scale and Z ever reach the screen.
const instanceData = Array.from({ length: SPHERE_COUNT }, () => ({
  scale: Math.random() * 3 + 1,
  z: Math.random() * 10 - 5,
}))

function SphereSwarm() {
  const { color, refraction, refractionRatio, transparent, opacity } = useControls('materials-basic', {
    color: '#ffffff',
    refraction: false,
    refractionRatio: { value: 0.98, min: 0, max: 1, step: 0.01 },
    transparent: false,
    opacity: { value: 1, min: 0, max: 1, step: 0.01 },
  })
  const scene = useThree((s) => s.scene)
  const textureCube = useCubeTexture(CUBE_FILES, { path: CUBE_PATH })
  const materialRef = useRef<MeshBasicNodeMaterial>(null)
  const instanceRefs = useRef<PositionMesh[]>([])

  useEffect(() => {
    scene.background = textureCube
  }, [scene, textureCube])

  // Mapping type is read at shader-graph BUILD time — see header DEMONSTRATES.
  useEffect(() => {
    textureCube.mapping = refraction ? CubeRefractionMapping : CubeReflectionMapping
    if (materialRef.current) materialRef.current.needsUpdate = true
  }, [textureCube, refraction])

  useFrame(({ elapsed}) => {
    for (let i = 0; i < SPHERE_COUNT; i++) {
      const { scale, z } = instanceData[i]
      const instance = instanceRefs.current[i]
      if (!instance) continue

      instance.position.set(5 * Math.cos(elapsed * 0.1 + i), 5 * Math.sin(elapsed * 0.1 + i * 1.1), z)
      instance.scale.setScalar(scale)
    }
  })

  return (
    <Instances limit={SPHERE_COUNT}>
      <sphereGeometry args={[0.1, 32, 16]} />
      <meshBasicNodeMaterial
        ref={materialRef}
        color={color}
        envMap={textureCube}
        refractionRatio={refractionRatio}
        transparent={transparent}
        opacity={opacity}
      />
      {instanceData.map((_, i) => (
        <Instance
          key={i}
          ref={(instance: PositionMesh | null) => {
            if (instance) instanceRefs.current[i] = instance
          }}
        />
      ))}
    </Instances>
  )
}

// Pointer-parallax camera: no orbit controls (see header DIVERGENCE) — the camera eases
// toward the tracked pointer position every frame and always looks at the origin,
// matching the original's mousemove-driven rig.
function ParallaxCamera() {
  useFrame(({ camera, pointer }, delta) => {
    camera.position.x = MathUtils.damp(camera.position.x, pointer.x * PARALLAX_RANGE, PARALLAX_DAMP, delta)
    camera.position.y = MathUtils.damp(camera.position.y, pointer.y * PARALLAX_RANGE, PARALLAX_DAMP, delta)
    camera.lookAt(0, 0, 0)
  })
  return null
}

export default function MaterialsBasic() {
  return (
    <Canvas renderer camera={{ position: [0, 0, 3], fov: 60, near: 0.01, far: 100 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <SphereSwarm />
      </Suspense>
      <ParallaxCamera />
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  )
}
