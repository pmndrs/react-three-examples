/**
 * lights-phong
 * Four orbiting point lights over three Phong teapots — each teapot shaded a
 * different way, and the outer two lit by only one light each.
 * Original: https://threejs.org/examples/#webgpu_lights_phong
 *
 * DEMONSTRATES
 * - `lightsNode={lights([oneLight])}` restricts a material to a SUBSET of the
 *   scene's lights. The outer teapots each see one; the centre one sees all four.
 * - Three Phong overrides on the same material — a texture `specularNode`, a
 *   tangent-space `normalNode`, and a procedural checker `specularNode`
 * - Shared addon registration makes `<teapotGeometry>` available directly in JSX
 * - A local ref with an optional override (`ref ?? localRef`), so every light is
 *   animatable while two of them are also handed to a sibling teapot — no state
 * - A marker mesh mounted as a CHILD of its light, inheriting the transform
 * - Plain `<fog attach="fog">` — the WebGPU renderer wraps it into a fog node, so
 *   no TSL fog graph is needed
 *
 * DIVERGENCE from original
 * - No Leva panel. The original has no UI either, and every value here is a
 *   constant, so controls would only add machinery.
 * - OrbitControls -> this repo's CameraControls, same 3/25 dolly limits
 */
import { useLayoutEffect, useMemo, useRef } from 'react'
import { checker, color, lights, mix, normalMap, texture, uv } from 'three/tsl'
import type { PointLight } from 'three/webgpu'

import { Canvas, useFrame, useNodes, useTexture, type ThreeElements } from '@react-three/fiber/webgpu'

import '../assets/TeapotGeometry'
import { DemoHelpers } from '../utils/DemoHelpers'

const TEXTURES = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/'

//* Lights ========================================================

/**
 * A point light on a Lissajous orbit, carrying its own visible marker as a child.
 * The parent can supply the ref to hand this light to another object; if it does
 * not, the local one still drives the orbit.
 */
type Orbit = readonly ({ s: number } | { c: number })[]

/** `ref` is optional — supply it only when another object needs this light. */
type OrbitLightProps = { color: string; orbit: Orbit; ref?: React.RefObject<PointLight | null> }

function OrbitLight({ color, orbit, ref }: OrbitLightProps) {
  // Hooks can't be conditional, so always make a local ref and then pick. Every
  // light ends up with a readable ref whether or not the parent supplied one.
  const localRef = useRef<PointLight>(null)
  const lightRef = ref ?? localRef

  useFrame(({ elapsed }) => {
    const t = elapsed * 0.5
    const position = orbit.map((a) => ('s' in a ? Math.sin(t * a.s) : Math.cos(t * a.c)))
    lightRef.current?.position.set(position[0] * 3, position[1] * 4, position[2] * 3)
  })

  return (
    <pointLight ref={lightRef} color={color} power={1700} distance={100}>
      <mesh>
        <sphereGeometry args={[0.1, 16, 8]} />
        {/* Emissive, not a colorNode — an unlit Phong material shades to black. */}
        <meshPhongNodeMaterial color="#000000" emissive={color} />
      </mesh>
    </pointLight>
  )
}

//* Teapots =======================================================

// Node props are PICKED off the material element rather than hand-written — the
// real node classes (LightsNode, TextureNode, NormalMapNode) don't satisfy a
// hand-guessed `Node<'vec3'>`, and guessing is what forces casts into examples.
// Node props are PICKED off the material element, never hand-written — the real
// node classes don't satisfy a guessed `Node<'vec3'>`, and guessing forces casts.
type TeapotProps = ThreeElements['mesh'] &
  Pick<ThreeElements['meshPhongNodeMaterial'], 'shininess' | 'specularNode' | 'normalNode'> &
  /** Restrict this teapot's lighting to just this one light. */
  { light?: React.RefObject<PointLight | null> }

function Teapot({ shininess, light, specularNode, normalNode, ...props }: TeapotProps) {
  // LightsNode holds its array BY REFERENCE and only reads it when the shader
  // builds — which is the first frame, after mount. So hand it an empty array now
  // and fill it in a layout effect, by which time the sibling light's ref is set.
  const lightsNode = useMemo(() => (light ? lights([]) : undefined), [light])

  useLayoutEffect(() => {
    if (light?.current) lightsNode?.setLights([light.current])
  }, [light, lightsNode])

  return (
    <mesh rotation-y={-Math.PI * 0.5} {...props}>
      <teapotGeometry args={[0.8, 18]} />
      <meshPhongNodeMaterial
        color="#555555"
        shininess={shininess}
        lightsNode={lightsNode}
        specularNode={specularNode}
        normalNode={normalNode}
      />
    </mesh>
  )
}

//* Scene =========================================================

function Experience() {
  const blueLightRef = useRef<PointLight>(null)
  const whiteLightRef = useRef<PointLight>(null)

  const { waterNormal, roughness } = useTexture({
    waterNormal: `${TEXTURES}water/Water_1_M_Normal.jpg`,
    roughness: `${TEXTURES}roughness_map.jpg`,
  })

  const { checkerSpecular, waterNormalNode, roughnessSpecular } = useNodes(() => ({
    checkerSpecular: mix(color('#0000ff'), color('#ff0000'), checker(uv().mul(5))),
    waterNormalNode: normalMap(texture(waterNormal)),
    roughnessSpecular: texture(roughness),
  }))

  return (
    <>
      <OrbitLight color="#0040ff" orbit={[{ s: 0.7 }, { c: 0.5 }, { c: 0.3 }]} ref={blueLightRef} />
      <OrbitLight color="#ffffff" orbit={[{ c: 0.3 }, { s: 0.5 }, { s: 0.7 }]} ref={whiteLightRef} />
      <OrbitLight color="#80ff80" orbit={[{ s: 0.7 }, { c: 0.3 }, { s: 0.5 }]} />
      <OrbitLight color="#ffaa00" orbit={[{ s: 0.3 }, { c: 0.7 }, { s: 0.5 }]} />

      <Teapot position={[-3, -1, 0]} light={blueLightRef} specularNode={roughnessSpecular} />
      <Teapot position={[0, -1, 0]} shininess={80} normalNode={waterNormalNode} />
      <Teapot position={[3, -1, 0]} shininess={90} light={whiteLightRef} specularNode={checkerSpecular} />
    </>
  )
}

export default function LightsPhong() {
  return (
    <Canvas renderer background="#000000" camera={{ position: [0, 0, 7], fov: 50, near: 0.01, far: 100 }}>
      <fog attach="fog" args={['#ff00ff', 12, 30]} />
      <Experience />
      <DemoHelpers grid={false} minDistance={3} maxDistance={25} />
    </Canvas>
  )
}
