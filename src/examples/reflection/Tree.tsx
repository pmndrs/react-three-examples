// The recursive "tree" of instanced boxes — one `MeshStandardNodeMaterial` drawn
// `instanceCount` times via `mesh.count` (three.js's own instancing escape hatch when
// there's no `InstancedMesh` class in play, same pattern as `skinning-instancing.tsx`).
// Per-instance position/normal/color/size-time-seed data is packed into plain
// `InstancedBufferAttribute`s and read back in TSL via `instancedBufferAttribute()`.
import { useEffect, useMemo } from 'react'
import { useFrame, useUniforms } from '@react-three/fiber/webgpu'
import {
  abs,
  float,
  Fn,
  instancedBufferAttribute,
  max,
  positionGeometry,
  positionLocal,
  pow2,
  sin,
  sub,
  time,
  uv,
  vec2,
  vec3,
} from 'three/tsl'
import { BoxGeometry, Color, InstancedBufferAttribute, Mesh, MeshStandardNodeMaterial, Vector3 } from 'three/webgpu'
import type { Node } from 'three/webgpu'

const MAX_STEPS = 5
const LENGTH_MULT = 0.8
const SUB_STEPS = 50
const BRANCHES = 6

// Escape hatch: three's own manual-instancing pattern is a plain Mesh with `.count`
// set directly (no `InstancedMesh` class) — `@types/three`'s `Mesh` doesn't declare
// `count` since that's normally an `InstancedMesh`-only field (documented in
// `skinning-instancing.tsx`'s `InstancedSkinnedMesh` type for the same reason).
type CountedMesh = Mesh & { count: number }

function random() {
  return (Math.random() - 0.5) * 2
}

interface TreeGeometryData {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  data: Float32Array
  instanceCount: number
}

// Recursive branch generator, ported near-verbatim from the original's
// `createTreePart` (random branching → a different tree shape on every load).
function generateTree(): TreeGeometryData {
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const data: number[] = []
  let instanceCount = 0

  const newPosition = new Vector3()
  const position = new Vector3()
  const normal = new Vector3()
  const color = new Color()

  function createTreePart(angle: number, x: number, y: number, z: number, length: number, count: number) {
    if (Math.random() > (MAX_STEPS / count) * 0.25) return

    if (count < MAX_STEPS) {
      const newLength = length * LENGTH_MULT
      const newX = x + Math.cos(angle) * length
      const newY = y + Math.sin(angle) * length
      const countSq = Math.min(3.2, count * count)
      const newZ = z + (Math.random() * countSq - countSq / 2) * length

      let size = 30 - count * 8
      if (size > 25) size = 25
      if (size < 10) size = 10
      size = size / 100

      for (let i = 0; i < SUB_STEPS; i++) {
        instanceCount++

        const percent = i / SUB_STEPS
        const extra = 1 / MAX_STEPS

        newPosition.set(x, y, z).lerp(new Vector3(newX, newY, newZ), percent)
        position.copy(newPosition)
        position.x += random() * size * 3
        position.y += random() * size * 3
        position.z += random() * size * 3
        positions.push(position.x, position.y, position.z)

        const scale = Math.random() + 5

        normal.copy(position).sub(newPosition).normalize()
        normals.push(normal.x, normal.y, normal.z)

        color.setHSL((count / MAX_STEPS) * 0.5 + Math.random() * 0.05, 0.75, 0.6 + Math.random() * 0.1)
        colors.push(color.r, color.g, color.b)

        // To save vertex buffers, size/time/seed are packed into a single attribute.
        const instanceSize = size * scale
        const instanceTime = count / MAX_STEPS + percent * extra
        const instanceSeed = Math.random()
        data.push(instanceSize, instanceTime, instanceSeed)
      }

      for (let branch = 0; branch < BRANCHES; branch++) {
        createTreePart(angle + random(), newX, newY, newZ, newLength + random(), count + 1)
      }
    }
  }

  createTreePart(Math.PI * 0.5, 0, 0, 0, 16, 0)

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    data: new Float32Array(data),
    instanceCount,
  }
}

// Matches TWEEN.Easing.Sinusoidal.InOut — see Tree()'s useFrame comment for why this
// replaces TWEEN.js entirely.
function sineInOut(t: number) {
  return 0.5 * (1 - Math.cos(Math.PI * t))
}

// Reproduces one `TWEEN.Tween(uniform).to({ value: 1.2 }, 3000).delay(delayMs).repeat(Infinity)`
// pulse: holds at -0.2 until `delay` elapses, then ramps -0.2 → 1.2 with sinusoidal-in-out
// easing over `period` seconds, snapping back to -0.2 and repeating (TWEEN's un-yoyo'd
// repeat replays the same ramp rather than reversing it).
function effectorValue(elapsed: number, delay: number, period: number) {
  const t = elapsed - delay
  if (t < 0) return -0.2
  const phase = (t % period) / period
  return -0.2 + 1.4 * sineInOut(phase)
}

export interface TreeProps {
  /** Multiplier on the traveling-pulse animation speed (leva `effectorSpeed`). */
  effectorSpeed: number
}

export function Tree({ effectorSpeed }: TreeProps) {
  // Two independent uniforms driving the "energy pulse" traveling along the branches
  // (`uniformEffector1/2` in the original, there animated via TWEEN.js).
  const { uEffector1, uEffector2 } = useUniforms(() => ({ uEffector1: -0.2, uEffector2: -0.2 }))

  useFrame((state) => {
    const period = 3 / effectorSpeed
    uEffector1.value = effectorValue(state.elapsed, 0.8 / effectorSpeed, period)
    uEffector2.value = effectorValue(state.elapsed, 0, period)
  })

  const mesh = useMemo(() => {
    const treeData = generateTree()

    const attributePosition = new InstancedBufferAttribute(treeData.positions, 3)
    const attributeNormal = new InstancedBufferAttribute(treeData.normals, 3)
    const attributeColor = new InstancedBufferAttribute(treeData.colors, 3)
    const attributeData = new InstancedBufferAttribute(treeData.data, 3)

    // Explicit `'vec3'` type param: `instancedBufferAttribute`'s inferred type defaults
    // to `unknown` when the (optional, three.js-side-inferred) buffer-type argument is
    // omitted, which doesn't structurally narrow to the swizzle/math API used below.
    const instancePosition = instancedBufferAttribute<'vec3'>(attributePosition, 'vec3')
    const instanceNormal = instancedBufferAttribute<'vec3'>(attributeNormal, 'vec3')
    const instanceColor = instancedBufferAttribute<'vec3'>(attributeColor, 'vec3')
    const instanceData = instancedBufferAttribute<'vec3'>(attributeData, 'vec3')

    // Cast: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`, so it
    // never structurally narrows to `Node<'float'>` for TSL math (documented fiber
    // typing gap, see skinning-instancing/rtt/shadow-contact).
    const effector1 = uEffector1 as unknown as Node<'float'>
    const effector2 = uEffector2 as unknown as Node<'float'>

    const material = new MeshStandardNodeMaterial()

    material.positionNode = Fn(() => {
      const instanceSize = instanceData.x
      const instanceTime = instanceData.y

      // Effectors: blob-like scale bumps as the traveling pulse passes each instance's
      // `instanceTime` position along the branch.
      const dif1 = abs(instanceTime.sub(effector1)).toConst()
      let effect = dif1
        .lessThanEqual(0.15)
        .select(sub(0.15, dif1).mul(sub(1.7, instanceTime).mul(10)), float(0))

      const dif2 = abs(instanceTime.sub(effector2)).toConst()
      effect = dif2.lessThanEqual(0.15).select(sub(0.15, dif2).mul(sub(1.7, instanceTime).mul(10)), effect)

      // Accumulate different vertex animations. Widened to `Node<'vec3'>`: `.toVar()`
      // types its result as the narrower `VarNode<'vec3', ...>`, which the chained
      // `.add`/`.sub` reassignments below (plain `Node<'vec3'>` results) don't narrow
      // back to.
      let animated: Node<'vec3'> = positionLocal.add(instancePosition).toVar()
      const direction = positionGeometry.normalize().toConst()

      animated = animated.add(direction.mul(effect.add(instanceSize)))
      animated = animated.sub(direction.mul(effect))
      animated = animated.add(instanceNormal.mul(effect.mul(1)))
      animated = animated.add(instanceNormal.mul(abs(sin(time.add(instanceData.z.mul(2))).mul(1.5))))

      return animated
    })()

    const squareEdge = Fn(() => {
      const pos = uv().sub(vec2(0.5, 0.5))
      const squareDistance = max(abs(pos.x), abs(pos.y))
      return squareDistance.div(0.5).clamp(0.85, 1).sub(0.5).mul(2.0)
    })()

    material.colorNode = Fn(() => squareEdge.sub(instanceColor))()

    material.emissiveNode = Fn(() => {
      const instanceTime = instanceData.y

      const dif1 = abs(instanceTime.sub(effector1)).toConst()
      const effect1 = dif1
        .lessThanEqual(0.15)
        .select(sub(0.15, dif1).mul(sub(1.7, instanceTime).mul(10)), float(0))

      const dif2 = abs(instanceTime.sub(effector2)).toConst()
      const effect2 = dif2.lessThanEqual(0.15).select(sub(0.15, dif2).mul(sub(1.7, instanceTime).mul(10)), effect1)

      return pow2(vec3(effect1, 0, effect2)).mul(instanceColor)
    })()

    const geometry = new BoxGeometry()
    const mesh = new Mesh(geometry, material) as CountedMesh
    mesh.scale.setScalar(0.05)
    mesh.count = treeData.instanceCount
    mesh.frustumCulled = false

    return mesh
    // `uEffector1`/`uEffector2` are create-if-not-exists (stable identity across
    // re-renders) — listed for the lint rule, not because this rebuilds on change.
  }, [uEffector1, uEffector2])

  useEffect(() => {
    return () => {
      mesh.geometry.dispose()
      ;(mesh.material as MeshStandardNodeMaterial).dispose()
    }
  }, [mesh])

  return <primitive object={mesh} castShadow receiveShadow />
}
