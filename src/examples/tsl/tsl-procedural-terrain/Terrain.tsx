// Terrain scene role: the TSL-displaced plane (position/normal/color node graph) plus
// the invisible drag plane that scrolls the noise domain. Everything here needs fiber
// hooks (`useUniforms`/`useThree`), so it lives inside <Canvas>, not in the page shell.
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useThree, useUniforms, type ThreeEvent } from '@react-three/fiber/webgpu'
import type CameraControlsImpl from 'camera-controls'
import {
  Fn,
  Loop,
  cross,
  dot,
  float,
  mx_noise_float,
  positionLocal,
  sign,
  step,
  transformNormalToView,
  uniform,
  varying,
  vec3,
} from 'three/tsl'
import { Mesh, MeshStandardNodeMaterial, PlaneGeometry, Vector2, Vector3 } from 'three/webgpu'
import type { Node } from 'three/webgpu'

// The original declares this as a uniform but never exposes it — folded to a constant
// (see header DIVERGENCE). It's the finite-difference step for normal reconstruction.
const NORMAL_LOOKUP_SHIFT = 0.01

export interface TerrainProps {
  noiseIterations: number
  positionFrequency: number
  strength: number
  warpFrequency: number
  warpStrength: number
  colorSand: string
  colorGrass: string
  colorSnow: string
  colorRock: string
  /** Live camera-controls instance — suspended while dragging the terrain. */
  controlsRef: RefObject<CameraControlsImpl | null>
}

export function Terrain({
  noiseIterations,
  positionFrequency,
  strength,
  warpFrequency,
  warpStrength,
  colorSand,
  colorGrass,
  colorSnow,
  colorRock,
  controlsRef,
}: TerrainProps) {
  const {
    uNoiseIterations,
    uPositionFrequency,
    uStrength,
    uWarpFrequency,
    uWarpStrength,
    uColorSand,
    uColorGrass,
    uColorSnow,
    uColorRock,
  } = useUniforms(
    {
      uNoiseIterations: noiseIterations,
      uPositionFrequency: positionFrequency,
      uStrength: strength,
      uWarpFrequency: warpFrequency,
      uWarpStrength: warpStrength,
      uColorSand: colorSand,
      uColorGrass: colorGrass,
      uColorSnow: colorSnow,
      uColorRock: colorRock,
    },
    'terrain',
  )

  // Casts: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`, so the
  // uniforms won't feed typed TSL math under strict tsc (upstream fiber gap — same cast
  // family as tsl-earth / skinning-instancing).
  const uNoiseIterationsNode = uNoiseIterations as unknown as Node<'float'>
  const uPositionFrequencyNode = uPositionFrequency as unknown as Node<'float'>
  const uStrengthNode = uStrength as unknown as Node<'float'>
  const uWarpFrequencyNode = uWarpFrequency as unknown as Node<'float'>
  const uWarpStrengthNode = uWarpStrength as unknown as Node<'float'>
  const uColorSandNode = uColorSand as unknown as Node<'vec3'>
  const uColorGrassNode = uColorGrass as unknown as Node<'vec3'>
  const uColorSnowNode = uColorSnow as unknown as Node<'vec3'>
  const uColorRockNode = uColorRock as unknown as Node<'vec3'>

  // Built once — `useUniforms` returns stable node instances across re-renders (leva
  // edits mutate `.value` in place), so this graph never rebuilds after the first pass,
  // matching the original's single `init()`.
  const rig = useMemo(() => {
    // Drag-driven noise-domain scroll. Plain TSL `uniform()` wrapping a live Vector2
    // (not `useUniforms`): the drag handlers mutate `.value` imperatively and a React
    // re-render must never write it back to its initial value.
    const uOffset = uniform(new Vector2(0, 0))

    const vNormal = varying(vec3())
    const vPosition = varying(vec3())

    const terrainElevation = Fn(([positionIn]) => {
      // Fn's destructured params come back as bare `ShaderNodeObject<Node>` — too loose
      // for typed TSL math (three-side gap, UPSTREAM.md B10).
      const position = positionIn as unknown as Node<'vec2'>

      const warpedPosition = position.add(uOffset).toVar()
      warpedPosition.addAssign(
        mx_noise_float(warpedPosition.mul(uPositionFrequencyNode).mul(uWarpFrequencyNode), 1, 0).mul(
          uWarpStrengthNode,
        ),
      )

      const elevation = float(0).toVar()
      // Run-time loop: the octave count is a uniform, so the iteration bound must be a
      // TSL `Loop` (a JS `for` here would bake the count at graph build).
      Loop({ type: 'float', start: float(1), end: uNoiseIterationsNode, condition: '<=' }, ({ i }) => {
        const noiseInput = warpedPosition.mul(uPositionFrequencyNode).mul(i.mul(2)).add(i.mul(987))
        const noise = mx_noise_float(noiseInput, 1, 0).div(i.add(1).mul(2))
        elevation.addAssign(noise)
      })

      const elevationSign = sign(elevation)
      elevation.assign(elevation.abs().pow(2).mul(elevationSign).mul(uStrengthNode))

      return elevation
    })

    const material = new MeshStandardNodeMaterial({ metalness: 0, roughness: 0.5, color: '#85d534' })

    material.positionNode = Fn(() => {
      // neighbours positions
      const neighbourA = positionLocal.xyz.add(vec3(NORMAL_LOOKUP_SHIFT, 0.0, 0.0)).toVar()
      const neighbourB = positionLocal.xyz.add(vec3(0.0, 0.0, -NORMAL_LOOKUP_SHIFT)).toVar()

      // elevations
      const position = positionLocal.xyz.toVar()
      const elevation = terrainElevation(positionLocal.xz)
      position.y.addAssign(elevation)

      neighbourA.y.addAssign(terrainElevation(neighbourA.xz))
      neighbourB.y.addAssign(terrainElevation(neighbourB.xz))

      // compute normal from the neighbour taps (geometry has no normal attribute)
      const toA = neighbourA.sub(position).normalize()
      const toB = neighbourB.sub(position).normalize()
      vNormal.assign(cross(toA, toB))

      // varyings — world-ish position including the drag offset, for the color bands
      vPosition.assign(position.add(vec3(uOffset.x, 0, uOffset.y)))

      return position
    })()

    material.normalNode = transformNormalToView(vNormal)

    material.colorNode = Fn(() => {
      const finalColor = vec3(uColorSandNode).toVar()

      // grass
      const grassMix = step(-0.06, vPosition.y)
      finalColor.assign(grassMix.mix(finalColor, uColorGrassNode))

      // rock — steep faces above the sand line
      const rockMix = step(0.5, dot(vNormal, vec3(0, 1, 0)))
        .oneMinus()
        .mul(step(-0.06, vPosition.y))
      finalColor.assign(rockMix.mix(finalColor, uColorRockNode))

      // snow — noisy altitude threshold
      const snowThreshold = mx_noise_float(vPosition.xz.mul(25), 1, 0).mul(0.1).add(0.45)
      const snowMix = step(snowThreshold, vPosition.y)
      finalColor.assign(snowMix.mix(finalColor, uColorSnowNode))

      return finalColor
    })()

    // normal/uv deleted like the original: normals are rebuilt in `positionNode`, and
    // keeping the attributes would only feed stale data into the standard material.
    const geometry = new PlaneGeometry(10, 10, 500, 500)
    geometry.deleteAttribute('uv')
    geometry.deleteAttribute('normal')
    geometry.rotateX(-Math.PI * 0.5)

    return { geometry, material, uOffset }
  }, [
    uNoiseIterationsNode,
    uPositionFrequencyNode,
    uStrengthNode,
    uWarpFrequencyNode,
    uWarpStrengthNode,
    uColorSandNode,
    uColorGrassNode,
    uColorSnowNode,
    uColorRockNode,
  ])

  // --- drag-to-scroll -----------------------------------------------------------
  const domElement = useThree((s) => s.renderer.domElement)
  const dragPlane = useRef<Mesh>(null)
  const dragging = useRef(false)
  const prevWorld = useRef(new Vector3())

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    dragging.current = true
    prevWorld.current.copy(e.point)
    // Grow the hit plane 10x for the duration of the drag so a fast pointer can't
    // leave the raycast area mid-gesture (original trick, ported verbatim).
    dragPlane.current?.scale.setScalar(10)
    if (controlsRef.current) controlsRef.current.enabled = false
    domElement.style.cursor = 'grabbing'
  }

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return
    rig.uOffset.value.x += prevWorld.current.x - e.point.x
    rig.uOffset.value.y += prevWorld.current.z - e.point.z
    prevWorld.current.copy(e.point)
  }

  // End-of-drag on window: the pointer can be released outside the canvas.
  useEffect(() => {
    const endDrag = () => {
      if (!dragging.current) return
      dragging.current = false
      dragPlane.current?.scale.setScalar(1)
      if (controlsRef.current) controlsRef.current.enabled = true
      domElement.style.cursor = 'default'
    }
    window.addEventListener('pointerup', endDrag)
    return () => window.removeEventListener('pointerup', endDrag)
  }, [controlsRef, domElement])

  return (
    <>
      <mesh geometry={rig.geometry} material={rig.material} castShadow receiveShadow />
      {/* Invisible drag plane: material-invisible (not mesh-invisible) so it still
          raycasts; only this mesh has pointer handlers, so R3F's event raycaster never
          considers the displaced terrain — same as the original's dedicated drag.object. */}
      <mesh
        ref={dragPlane}
        rotation-x={-Math.PI * 0.5}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerOver={() => {
          if (!dragging.current) domElement.style.cursor = 'grab'
        }}
        onPointerOut={() => {
          if (!dragging.current) domElement.style.cursor = 'default'
        }}
      >
        <planeGeometry args={[10, 10]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </>
  )
}
