/**
 * materials-envmaps-groundprojected
 * R3F port of three.js `webgpu_materials_envmaps_groundprojected`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materials_envmaps_groundprojected (~165 lines of JS)
 *
 * DEMONSTRATES
 * - TSL ground-projected environment mapping: the `getGroundProjectedNormal` addon
 *   (three/addons/tsl/utils/GroundedSkybox.js) reprojects the view ray onto a
 *   sphere-plus-ground-disk, and feeding it to `cubeTexture()` as a
 *   `meshBasicNodeMaterial` `colorNode` (set via JSX) flattens the sky dome's lower
 *   half into a walkable ground plane under the car
 * - Equirect HDR -> cube map conversion with `CubeRenderTarget.fromEquirectangularTexture`
 *   (the original's "avoid pole artifacts" step), run once in a layout effect against
 *   the live renderer (B9 union cast)
 * - Projection `height`/`radius` as live `useUniforms` values: the webgpu original
 *   bakes them into the graph as const `float()`s — behind uniforms they become leva
 *   sliders that never trigger a shader-graph rebuild
 * - Imperative material surgery on a loaded glTF (Ferrari body/rims/glass swapped for
 *   clearcoat/metal/transmission materials by node name), kept visible in the
 *   component that owns it; drei `useGLTF` wires the Draco decoder internally
 * - A baked AO "shadow" as a `MultiplyBlending` plane mounted as a declarative JSX
 *   child of `<primitive>` — it rides the car model's transform like the original's
 *   `carModel.add(mesh)`
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` panel (Inspector.js; this
 *   repo doesn't wire the Inspector RootState slot) is replaced with leva: the
 *   'Grounded' toggle kept, PLUS height/radius sliders the original hard-codes —
 *   direct-value-controls convention, made cheap by the uniform plumbing above. The
 *   radius slider also drives the skybox mesh scale (original: one-time
 *   `skybox.scale.setScalar(radius)`).
 * - OrbitControls -> DemoHelpers CameraControls with the original's limits (target
 *   [0,2,0], dolly 20-80, polar <= 90 deg, pan disabled); `camera.lookAt(0,4,0)` is
 *   dropped — camera-controls owns the camera and the controls target governs. Grid
 *   disabled: the projected ground IS the floor.
 * - Async flow: `await loadAsync` + load callbacks -> suspending hooks
 *   (`useLoader(HDRLoader)`, `useGLTF`, `useTexture`) under one B17 Suspense gate.
 * - Draco: the original wires `DRACOLoader` + `DRACO_GLTF_CONFIG` manually; drei's
 *   `useGLTF` ships that wiring built in.
 * - Car materials use the `MeshPhysicalNodeMaterial`/`MeshStandardNodeMaterial`
 *   classes directly (the WebGPU renderer would auto-convert the classic classes the
 *   original constructs; the node classes are the same materials, named honestly).
 */
import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Canvas, useLoader, useThree, useUniforms } from '@react-three/fiber/webgpu'
import { useGLTF, useTexture } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import {
  ACESFilmicToneMapping,
  CubeRenderTarget,
  DoubleSide,
  EquirectangularReflectionMapping,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  MultiplyBlending,
} from 'three/webgpu'
import type { Material, Mesh, Node, WebGPURenderer } from 'three/webgpu'
import { cubeTexture } from 'three/tsl'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { getGroundProjectedNormal } from 'three/addons/tsl/utils/GroundedSkybox.js'
import { DemoHelpers } from '../utils/DemoHelpers'

const ASSET_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/'
const HDR_URL = `${ASSET_BASE}textures/equirectangular/blouberg_sunrise_2_1k.hdr`
const CAR_URL = `${ASSET_BASE}models/gltf/ferrari.glb`
const AO_URL = `${ASSET_BASE}models/gltf/ferrari_ao.png`

// The HDR is both the scene's IBL environment (equirect, as loaded) and — converted
// to a cube map to avoid visual artifacts at the skybox's poles — the source the
// ground-projected sky dome samples per fragment.
function GroundedEnvironment({
  grounded,
  height,
  radius,
}: {
  grounded: boolean
  height: number
  radius: number
}) {
  // Creator hook BEFORE the suspending hooks below (B18: deferred to the
  // post-suspense re-render, the store write would land after siblings subscribed).
  const { uHeight, uRadius } = useUniforms(() => ({ uHeight: 15, uRadius: 100 }))

  const envMap = useLoader(HDRLoader, HDR_URL)
  const scene = useThree((s) => s.scene)
  // Cast: useThree types renderer as the WebGL/WebGPU union even on the /webgpu
  // entry; fromEquirectangularTexture needs the common Renderer base (B9).
  const renderer = useThree((s) => s.renderer) as WebGPURenderer

  // HDRLoader leaves mapping at UVMapping; reflection mapping must be in place
  // before the first shader build reads scene.environment.
  const equirect = useMemo(() => {
    envMap.mapping = EquirectangularReflectionMapping
    return envMap
  }, [envMap])

  // Grounded on: the sky dome mesh below is the background, scene.background stays
  // null. Grounded off: plain equirect skybox, exactly the original's toggle.
  useLayoutEffect(() => {
    scene.environment = equirect
    scene.background = grounded ? null : equirect
    return () => {
      scene.environment = null
      scene.background = null
    }
  }, [scene, equirect, grounded])

  // Lazy state, not useMemo: the colorNode below captures this instance for good, and
  // a StrictMode memo re-run could hand the component a different one (AGENTS.md).
  const [cubeRT] = useState(() => new CubeRenderTarget(equirect.image.height as number))

  // One-time equirect -> cube map bake on the live renderer (idempotent under
  // StrictMode; layout effect so it precedes the first RAF render).
  useLayoutEffect(() => {
    cubeRT.fromEquirectangularTexture(renderer, equirect)
  }, [cubeRT, renderer, equirect])

  // Casts: fiber's UniformNode<T> pins the TSL node-type param to `unknown`, so it
  // never structurally narrows to Node<'float'> even though it is one at runtime
  // (documented fiber typing gap, see rtt / skinning-instancing).
  const colorNode = useMemo(
    () =>
      cubeTexture(
        cubeRT.texture,
        getGroundProjectedNormal(
          uRadius as unknown as Node<'float'>,
          uHeight as unknown as Node<'float'>,
        ),
      ),
    [cubeRT, uRadius, uHeight],
  )

  useEffect(() => {
    uHeight.value = height
    uRadius.value = radius
  }, [uHeight, uRadius, height, radius])

  if (!grounded) return null
  return (
    <mesh scale={radius}>
      <icosahedronGeometry args={[1, 16]} />
      <meshBasicNodeMaterial side={DoubleSide} colorNode={colorNode} />
    </mesh>
  )
}

// Ferrari 458 with the original's showroom material swap: black clearcoat body,
// bare-metal rims/trim, transmissive glass — all responding to the HDR environment
// alone (no analytic light in the scene).
function Ferrari() {
  const gltf = useGLTF(CAR_URL) // Draco-compressed; drei wires the decoder itself
  const aoMap = useTexture(AO_URL)

  const carModel = useMemo(() => {
    const car = gltf.scene.children[0]

    const bodyMaterial = new MeshPhysicalNodeMaterial({
      color: 0x000000,
      metalness: 1.0,
      roughness: 0.8,
      clearcoat: 1.0,
      clearcoatRoughness: 0.2,
    })
    const detailsMaterial = new MeshStandardNodeMaterial({
      color: 0xffffff,
      metalness: 1.0,
      roughness: 0.5,
    })
    const glassMaterial = new MeshPhysicalNodeMaterial({
      color: 0xffffff,
      metalness: 0.25,
      roughness: 0,
      transmission: 1.0,
    })

    const setMaterial = (name: string, material: Material) => {
      ;(car.getObjectByName(name) as Mesh).material = material
    }
    setMaterial('body', bodyMaterial)
    for (const rim of ['rim_fl', 'rim_fr', 'rim_rr', 'rim_rl', 'trim']) setMaterial(rim, detailsMaterial)
    setMaterial('glass', glassMaterial)

    return car
  }, [gltf])

  return (
    // Scale/rotation as props, not `scale.multiplyScalar(4)` in the memo — a
    // StrictMode double-run of the memo callback would compound the mutation.
    <primitive object={carModel} scale={4} rotation-y={Math.PI}>
      {/* Baked AO ground shadow, multiplied over the projected ground. Child of the
          primitive so it inherits the car's transform like the original's add(). */}
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.655 * 4, 1.3 * 4]} />
        <meshBasicNodeMaterial
          map={aoMap}
          blending={MultiplyBlending}
          toneMapped={false}
          transparent
          premultipliedAlpha
        />
      </mesh>
    </primitive>
  )
}

export default function MaterialsEnvmapsGroundprojected() {
  const { grounded, height, radius } = useControls('materials-envmaps-groundprojected', {
    grounded: true,
    height: { value: 15, min: 5, max: 50, step: 0.1 },
    radius: { value: 100, min: 100, max: 300, step: 1 },
  })

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [-20, 7, 20], fov: 40, near: 1, far: 1000 }}
    >
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <GroundedEnvironment grounded={grounded} height={height} radius={radius} />
        <Ferrari />
      </Suspense>
      <DemoHelpers
        grid={false}
        target={[0, 2, 0]}
        minDistance={20}
        maxDistance={80}
        maxPolarAngle={Math.PI / 2}
        pan={false}
      />
    </Canvas>
  )
}
