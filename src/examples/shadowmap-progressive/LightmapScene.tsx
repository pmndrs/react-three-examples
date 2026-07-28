// Owns the progressive lightmap accumulator, the four jittered directional lights, the
// loaded model, and both TransformControls gizmos (light origin + model). Kept in one
// component because every piece reads/writes the same `lightmapObjects` list built
// once after the glTF loads (AGENTS.md guarded-setup pattern, same shape as
// shadowmap-opacity's dragon scene).
import { useLayoutEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber/webgpu'
import { TransformControls, useGLTF } from '@react-three/drei/webgpu'
import type CameraControlsImpl from 'camera-controls'
import { Group, MeshPhongMaterial } from 'three/webgpu'
import type { DirectionalLight, Mesh, Object3D, WebGPURenderer } from 'three/webgpu'
import { ProgressiveLightMap } from 'three/addons/misc/ProgressiveLightMapGPU.js'

const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/ShadowmappableMesh.glb'
const LIGHT_COUNT = 4
const SHADOW_MAP_RES = 1024
const LIGHT_MAP_RES = 1024

export interface LightmapSceneProps {
  enabled: boolean
  blurEdges: boolean
  blendWindow: number
  lightRadius: number
  ambientWeight: number
  debugLightmap: boolean
  controlsRef: React.RefObject<CameraControlsImpl | null>
}

export function LightmapScene({
  enabled,
  blurEdges,
  blendWindow,
  lightRadius,
  ambientWeight,
  debugLightmap,
  controlsRef,
}: LightmapSceneProps) {
  // useThree types renderer as the WebGL/WebGPU union even on the `/webgpu` entry
  // (fiber typing gap, UPSTREAM.md B9) — ProgressiveLightMapGPU is WebGPURenderer-only.
  const rawRenderer = useThree((s) => s.renderer)
  const renderer = rawRenderer as WebGPURenderer
  const camera = useThree((s) => s.camera)
  const { scene: gltfScene } = useGLTF(MODEL_URL)

  // Lazy useState: the accumulator owns two live RenderTargets + a private scene —
  // must stay identity-stable across StrictMode's double render (AGENTS.md).
  const [plm] = useState(() => new ProgressiveLightMap(renderer, LIGHT_MAP_RES))

  const lightOriginRef = useRef<Group>(null)
  const groundRef = useRef<Mesh>(null)
  const lightRefs = useRef<(DirectionalLight | null)[]>([])
  const [modelObject, setModelObject] = useState<Object3D | null>(null)
  // A plain ref's `.current` attaching doesn't trigger a re-render, so TransformControls
  // (which needs the actual object, not a ref, to attach to on mount) would never see
  // it — mirror `modelObject`'s state-via-callback-ref pattern for the origin group too.
  const [lightOriginObject, setLightOriginObject] = useState<Group | null>(null)

  useLayoutEffect(() => {
    if (gltfScene.userData.progressiveSetup) {
      setModelObject(gltfScene.userData.progressiveObject as Object3D)
      return
    }
    gltfScene.userData.progressiveSetup = true

    // The original indexes the loaded scene's first child as "the" mesh.
    const object = gltfScene.children[0]
    object.scale.set(2, 2, 2)
    object.position.set(0, -16, 0)

    const lightTarget = new Group()
    lightTarget.position.set(0, 20, 0)
    object.add(lightTarget)

    const lightmapObjects: Object3D[] = []
    const lights = lightRefs.current.filter((l): l is DirectionalLight => l !== null)
    lightmapObjects.push(...lights)
    if (groundRef.current) lightmapObjects.push(groundRef.current)

    object.traverse((child) => {
      const mesh = child as Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.material = new MeshPhongMaterial()
        lightmapObjects.push(mesh)
      } else {
        child.layers.disableAll()
      }
    })

    for (const light of lights) light.target = lightTarget

    // Called ONCE with the full final list — the original calls this repeatedly (once
    // per mesh found during traverse, each time with the whole growing array), which
    // re-packs and re-pushes the ground/lights into the accumulator's internal list on
    // every call. A single call after the full list is known is the same end state
    // without the redundant re-processing (DIVERGENCE, documented in the parent header).
    plm.addObjectsToLightMap(lightmapObjects)

    gltfScene.userData.progressiveObject = object
    setModelObject(object)
  }, [gltfScene, plm])

  useFrame(() => {
    if (enabled) plm.update(camera, blendWindow, blurEdges)

    const origin = lightOriginRef.current
    const object = modelObject
    if (!origin) return

    for (const light of lightRefs.current) {
      if (!light) continue

      if (Math.random() > ambientWeight) {
        // Sampled near the light origin, within lightRadius.
        light.position.set(
          origin.position.x + Math.random() * lightRadius,
          origin.position.y + Math.random() * lightRadius,
          origin.position.z + Math.random() * lightRadius,
        )
      } else {
        // Uniform hemispherical sample around the model — soft ambient-occlusion-like
        // shadowing once accumulated over many frames.
        const lambda = Math.acos(2 * Math.random() - 1) - Math.PI / 2
        const phi = 2 * Math.PI * Math.random()
        const objectX = object?.position.x ?? 0
        const objectY = object?.position.y ?? 0
        const objectZ = object?.position.z ?? 0
        light.position.set(
          Math.cos(lambda) * Math.cos(phi) * 300 + objectX,
          Math.abs(Math.cos(lambda) * Math.sin(phi)) * 300 + objectY + 20,
          Math.sin(lambda) * 300 + objectZ,
        )
      }
    }
  })

  const beginDrag = () => {
    if (controlsRef.current) controlsRef.current.enabled = false
  }
  const endDrag = () => {
    if (controlsRef.current) controlsRef.current.enabled = true
  }

  return (
    <>
      <group
        ref={(node) => {
          lightOriginRef.current = node
          if (node && !lightOriginObject) setLightOriginObject(node)
        }}
        position={[60, 150, 100]}
      />
      {Array.from({ length: LIGHT_COUNT }, (_, i) => (
        <directionalLight
          key={i}
          ref={(light) => {
            lightRefs.current[i] = light
          }}
          color="#ffffff"
          intensity={Math.PI / LIGHT_COUNT}
          position={[200, 200, 200]}
          castShadow
          shadow-camera-near={100}
          shadow-camera-far={5000}
          shadow-camera-left={-150}
          shadow-camera-right={150}
          shadow-camera-top={150}
          shadow-camera-bottom={-150}
          shadow-mapSize-width={SHADOW_MAP_RES}
          shadow-mapSize-height={SHADOW_MAP_RES}
        />
      ))}

      <mesh ref={groundRef} position={[0, -0.1, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[600, 600]} />
        <meshPhongMaterial color="#ffffff" depthWrite />
      </mesh>

      <primitive object={gltfScene} />

      {lightOriginObject && (
        <TransformControls object={lightOriginObject} onMouseDown={beginDrag} onMouseUp={endDrag} />
      )}
      {modelObject && (
        <TransformControls object={modelObject} onMouseDown={beginDrag} onMouseUp={endDrag} />
      )}

      {/* Debug lightmap plane toggle — showDebugLightmap() lazily creates its own
          display mesh the first time it's called with `true`. Gated on modelObject:
          it warns if called before addObjectsToLightMap() has registered anything,
          and modelObject is only set at the end of that same setup effect. */}
      {modelObject && <DebugLightmapToggle plm={plm} groundRef={groundRef} visible={debugLightmap} />}
    </>
  )
}

function DebugLightmapToggle({
  plm,
  groundRef,
  visible,
}: {
  plm: ProgressiveLightMap
  groundRef: React.RefObject<Mesh | null>
  visible: boolean
}) {
  useLayoutEffect(() => {
    if (!groundRef.current) return
    plm.showDebugLightmap(visible, groundRef.current.position.clone().setY(250))
  }, [plm, groundRef, visible])

  return null
}
