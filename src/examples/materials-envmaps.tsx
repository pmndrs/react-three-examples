/**
 * materials-envmaps
 * R3F port of three.js `webgpu_materials_envmaps`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materials_envmaps (~150 lines of JS)
 *
 * DEMONSTRATES
 * - drei's `useCubeTexture` and `useTexture` (`/webgpu`) loading a cube map and an
 *   equirectangular map side by side, one leva dropdown swapping which one backs BOTH
 *   `scene.background` and a sphere's `MeshBasicNodeMaterial.envMap`
 * - Reflection vs Refraction mapping (`Cube/EquirectangularReflectionMapping` vs
 *   `Cube/EquirectangularRefractionMapping`) is read by `CubeTextureNode` at node-graph
 *   BUILD time (`reference/three.js/src/nodes/accessors/CubeTextureNode.js`), so
 *   toggling `.mapping` needs `material.needsUpdate = true` to force a rebuild — the
 *   same "build-time vs run-time" caveat Layer 1 documents for TSL graphs in general,
 *   just surfaced through a plain material property instead of a hand-written node.
 *   `scene.background`'s cube-vs-equirect wrap is keyed by texture object identity
 *   (`NodeManager.updateBackground`'s `WeakMap` cache), so swapping the texture
 *   REFERENCE (the Type toggle) rebuilds it for free — only the reflection/refraction
 *   toggle needs the explicit bump
 * - `scene.backgroundRotation` (an Euler, mutated per-axis in `useFrame`) and
 *   `material.envMapRotation` kept in sync via a `syncMaterial` toggle — both are read
 *   live every frame by a renderer-side uniform (`Background.js`'s `backgroundRotation`
 *   TSL uniform, `onRenderUpdate`), so no rebuild is needed for rotation, unlike the
 *   mapping-type toggle above
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` dat.gui-style panel (with
 *   `Inspector.js`; dropped, see below) is replaced with leva controls — same five
 *   parameters (Type, Refraction, three per-axis background-rotation toggles,
 *   syncMaterial)
 * - `renderer.inspector = new Inspector()` dropped — this repo doesn't wire the
 *   Inspector RootState slot yet (same gap noted in several prior ports)
 * - Background rotation increments are delta-scaled (`0.06 * delta` rad/s) rather than
 *   the original's fixed `+= 0.001` per rendered frame, so the spin rate is frame-rate
 *   independent instead of tied to display refresh rate; tuned to match the original's
 *   apparent speed at a typical 60fps
 * - DemoHelpers' camera-controls orbit swaps in for `OrbitControls`; `minDistance`/
 *   `maxDistance` (1.5/6) map directly to the original's controls. Grid disabled
 *   (`grid={false}`) — the scene is a single sphere against a full skybox background
 *   with no ground plane in the original
 */
import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useCubeTexture, useTexture } from '@react-three/drei/webgpu'
import { folder, useControls } from 'leva'
import {
  CubeReflectionMapping,
  CubeRefractionMapping,
  EquirectangularReflectionMapping,
  EquirectangularRefractionMapping,
  MeshBasicNodeMaterial,
  SRGBColorSpace,
} from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const CUBE_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/cube/Bridge2/'
const CUBE_FILES = ['posx.jpg', 'negx.jpg', 'posy.jpg', 'negy.jpg', 'posz.jpg', 'negz.jpg']
const EQUIREC_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/2294472375_24a3b8ef46_o.jpg'

// Radians/second applied to whichever `scene.backgroundRotation` axes are toggled on —
// see header DIVERGENCE (delta-scaled replacement for the original's per-frame `+=0.001`).
const ROTATION_SPEED = 0.06

type EnvMapType = 'Cube' | 'Equirectangular'

interface EnvMapSphereProps {
  type: EnvMapType
  refraction: boolean
  rotateX: boolean
  rotateY: boolean
  rotateZ: boolean
  syncMaterial: boolean
}

// Loads both env maps once, toggles which one backs `scene.background` + the sphere's
// `envMap`, and switches Reflection<->Refraction mapping on both — see header
// DEMONSTRATES for why `needsUpdate` is required here but not for rotation.
function EnvMapSphere({ type, refraction, rotateX, rotateY, rotateZ, syncMaterial }: EnvMapSphereProps) {
  const scene = useThree((s) => s.scene)
  const textureCube = useCubeTexture(CUBE_FILES, { path: CUBE_PATH })
  const textureEquirec = useTexture(EQUIREC_URL)

  const material = useMemo(() => new MeshBasicNodeMaterial(), [])

  useEffect(() => {
    textureEquirec.colorSpace = SRGBColorSpace
  }, [textureEquirec])

  useEffect(() => {
    textureCube.mapping = refraction ? CubeRefractionMapping : CubeReflectionMapping
    textureEquirec.mapping = refraction ? EquirectangularRefractionMapping : EquirectangularReflectionMapping

    const activeTexture = type === 'Cube' ? textureCube : textureEquirec
    scene.background = activeTexture
    material.envMap = activeTexture
    material.needsUpdate = true
  }, [scene, material, type, refraction, textureCube, textureEquirec])

  useFrame((_, delta) => {
    if (rotateX) scene.backgroundRotation.x += ROTATION_SPEED * delta
    if (rotateY) scene.backgroundRotation.y += ROTATION_SPEED * delta
    if (rotateZ) scene.backgroundRotation.z += ROTATION_SPEED * delta
    if (syncMaterial) material.envMapRotation.copy(scene.backgroundRotation)
  })

  return (
    <mesh material={material}>
      <icosahedronGeometry args={[1, 15]} />
    </mesh>
  )
}

export default function MaterialsEnvmaps() {
  const { type, refraction, syncMaterial, rotateX, rotateY, rotateZ } = useControls('materials-envmaps', {
    type: { value: 'Cube', options: ['Cube', 'Equirectangular'] },
    refraction: false,
    syncMaterial: false,
    'Background Rotation': folder({
      rotateX: false,
      rotateY: false,
      rotateZ: false,
    }),
  })

  return (
    <Canvas renderer camera={{ position: [0, 0, 2.5], fov: 70, near: 0.1, far: 100 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <EnvMapSphere
          type={type as EnvMapType}
          refraction={refraction}
          rotateX={rotateX}
          rotateY={rotateY}
          rotateZ={rotateZ}
          syncMaterial={syncMaterial}
        />
      </Suspense>
      <DemoHelpers grid={false} minDistance={1.5} maxDistance={6} />
    </Canvas>
  )
}
