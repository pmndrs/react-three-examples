/**
 * tsl-angular-slicing
 * R3F port of three.js `webgpu_tsl_angular_slicing`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_tsl_angular_slicing (~180 lines of JS)
 *
 * DEMONSTRATES
 * - `NodeMaterial.maskNode` as geometry-free CSG-style slicing: a TSL `Fn` measures
 *   the fragment's local-XY polar angle (`atan(y, x)`, wrapped into [0, 2π) relative
 *   to a start angle) and discards everything inside the [start, start+arc) wedge
 * - `NodeMaterial.outputNode` + `frontFacing` to recolor ONLY back faces: with
 *   `side: DoubleSide` the discard exposes the hull interior, and flat-colored back
 *   faces read as a solid machined cap over the cut
 * - `useUniforms` feeding leva straight into the mask/output graphs — create-or-update
 *   semantics mutate the live GPU uniforms per edit, the sliced wedge tracks it with
 *   zero graph rebuilds (build-time vs run-time rule)
 * - One node material shared across several glTF meshes via an imperative traverse
 *   (the showcased escape hatch, kept visible in the component that owns it);
 *   Draco decoding wired by drei's `useGLTF` second argument
 * - `useLoader(UltraHDRLoader, …)` for the gainmap-JPEG environment — the loader
 *   drei's `Environment` can't reach (UPSTREAM B13), set as both `scene.background`
 *   and `scene.environment` like the original
 *
 * DIVERGENCE from original
 * - Explicit `<Suspense>` gate wraps the lit scene (B17), which also guarantees the
 *   first shader build of the custom-node materials already sees `scene.environment`
 *   (B15) — replaces the original's build-scene-in-loader-callback flow
 * - `maskShadowNode` stays unset, matching the original's commented-out line: the
 *   shadow pass inherits the same angular discard from `maskNode`
 */
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import {
  ACESFilmicToneMapping,
  DoubleSide,
  EquirectangularReflectionMapping,
  MeshPhysicalNodeMaterial,
} from 'three/webgpu'
import type { Mesh } from 'three/webgpu'
import { Fn, If, TWO_PI, atan, frontFacing, output, positionLocal, vec4 } from 'three/tsl'
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js'

import { Canvas, useLoader, useThree, useUniforms } from '@react-three/fiber/webgpu'
import { useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'

import { DemoHelpers } from '../../utils/DemoHelpers'

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/gears.glb'
const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/royal_esplanade_2k.hdr.jpg'

// Loads the UltraHDR environment + Draco gears model, builds the sliced/default
// physical node materials, and assigns them across the model — see header block.
function SlicedGears() {
  //* Controls ====================================================
  const { sliceStart, sliceArc, sliceColor } = useControls('angular-slicing', {
    sliceStart: { value: 1.75, min: -Math.PI, max: Math.PI, step: 0.001 },
    sliceArc: { value: 1.25, min: 0, max: Math.PI * 2, step: 0.001 },
    sliceColor: '#b62f58',
  })

  const scene = useThree((s) => s.scene)
  const envMap = useLoader(UltraHDRLoader, HDR_URL)
  const gltf = useGLTF(MODEL_URL, { draco: true })

  // Live uniforms — create-or-update semantics sync leva edits into `.value` with
  // zero graph rebuilds; the two materials below are built once.
  const { uSliceStart, uSliceArc, uSliceColor } = useUniforms({
    uSliceStart: sliceStart,
    uSliceArc: sliceArc,
    uSliceColor: sliceColor,
  })

  // REVIEW(shared-instance): one default + one sliced MeshPhysicalNodeMaterial,
  // applied across every mesh in the gltf by the traverse below — genuinely shared,
  // not a per-mesh material.
  const { defaultMaterial, slicedMaterial } = useMemo(() => {
    // Is the local-XY polar angle of `position` inside the [start, start+arc) wedge?
    const inAngle = Fn(([positionIn, angleStartIn, angleArcIn]) => {
      // Fn's destructured params come back as bare `ShaderNodeObject<Node>` — too
      // loose for the swizzles/comparisons below (three-side gap, UPSTREAM.md B10).
      const position = positionIn
      const angleStart = angleStartIn
      const angleArc = angleArcIn

      const angle = atan(position.y, position.x).sub(angleStart).mod(TWO_PI).toVar()
      return angle.greaterThan(0).and(angle.lessThan(angleArc))
    })

    const defaultMaterial = new MeshPhysicalNodeMaterial({
      metalness: 0.5,
      roughness: 0.25,
      envMapIntensity: 0.5,
      color: '#858080',
    })

    // DoubleSide is load-bearing: the discard must expose back faces for the cap.
    const slicedMaterial = new MeshPhysicalNodeMaterial({
      metalness: 0.5,
      roughness: 0.25,
      envMapIntensity: 0.5,
      color: '#858080',
      side: DoubleSide,
    })

    // Discard fragments inside the wedge; the shadow depth pass inherits the mask.
    slicedMaterial.maskNode = inAngle(positionLocal.xy, uSliceStart, uSliceArc).not()

    // Back faces (the interior revealed by the discard) get the flat slice color.
    slicedMaterial.outputNode = Fn(() => {
      const finalOutput = output
      If(frontFacing.not(), () => {
        finalOutput.assign(vec4(uSliceColor, 1))
      })
      return finalOutput
    })()

    return { defaultMaterial, slicedMaterial }
  }, [uSliceStart, uSliceArc, uSliceColor])

  // Layout effect: `.mapping`/`scene.environment` are read at shader-graph build time
  // (first RAF render) by the physical materials — they must land before that
  // (AGENTS.md imperative-setup rule; the Suspense gate already ordered the fetch).
  useLayoutEffect(() => {
    envMap.mapping = EquirectangularReflectionMapping
    scene.background = envMap
    scene.environment = envMap
    return () => {
      scene.background = null
      scene.environment = null
    }
  }, [scene, envMap])

  // Same faithful traverse as the original: `outerHull` gets the sliced material,
  // everything else the plain one; every mesh casts and receives shadows.
  useLayoutEffect(() => {
    gltf.scene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh
        mesh.material = mesh.name === 'outerHull' ? slicedMaterial : defaultMaterial
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
  }, [gltf, defaultMaterial, slicedMaterial])

  return <primitive object={gltf.scene} />
}

// The original's tilted 10×10 backdrop plane, aimed at the origin to catch the shadow.
function Backdrop() {
  const ref = useRef<Mesh>(null)
  useLayoutEffect(() => {
    ref.current?.lookAt(0, 0, 0)
  }, [])
  return (
    <mesh ref={ref} position={[-4, -3, -4]} receiveShadow>
      <planeGeometry args={[10, 10, 10]} />
      <meshStandardNodeMaterial color="#aaaaaa" />
    </mesh>
  )
}

export default function TslAngularSlicing() {
  return (
    <Canvas
      shadows
      // Original sets ACESFilmic + exposure 1 explicitly — mirrored deliberately
      // (tone-mapping parity rule).
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [-5, 5, 12], fov: 35, near: 0.1, far: 100 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes TSL graphs. One boundary wraps lights + backdrop + model so the
          lit scene commits only after the environment is live (B15). */}
      <Suspense fallback={null}>
        <directionalLight
          position={[6.25, 3, 4]}
          intensity={4}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={0.1}
          shadow-camera-far={30}
          shadow-camera-top={8}
          shadow-camera-right={8}
          shadow-camera-bottom={-8}
          shadow-camera-left={-8}
          shadow-normalBias={0.05}
        />
        <Backdrop />
        <SlicedGears />
      </Suspense>
      <DemoHelpers grid={false} minDistance={0.1} maxDistance={50} />
    </Canvas>
  )
}
