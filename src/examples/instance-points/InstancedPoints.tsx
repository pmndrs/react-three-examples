// InstancedPoints — the pulsing Hilbert-curve point field. One `<sprite count={n}>`
// drives n instanced quads through PointsNodeMaterial: per-instance position/color
// come from InstancedBufferAttributes, the per-instance pixel size lives in a GPU
// storage buffer that a per-frame compute kernel pulses with `time` — the render
// graph reads it back via `.toAttribute()` both as `sizeNode` and as the color-fade
// factor (small point -> dark). Uses fiber hooks, so it lives inside <Canvas>.
import { useEffect, useMemo, useRef } from 'react'
import { useBuffers, useFrame, useNodes, useThree, useUniforms } from '@react-three/fiber/webgpu'
import { Fn, float, instanceIndex, instancedArray, instancedBufferAttribute, mix, shapeCircle, sin, time, vec3 } from 'three/tsl'
import { CatmullRomCurve3, Color, InstancedBufferAttribute, SRGBColorSpace, Vector3 } from 'three/webgpu'
import type { Node, PointsNodeMaterial, WebGPURenderer } from 'three/webgpu'
import * as GeometryUtils from 'three/addons/utils/GeometryUtils.js'

// Hilbert curve -> Catmull-Rom spline -> flat position/color/size arrays, ported
// verbatim from the original's init(). Pure CPU data prep, runs once.
function buildPointData() {
  const points = GeometryUtils.hilbert3D(new Vector3(0, 0, 0), 20.0, 1, 0, 1, 2, 3, 4, 5, 6, 7)

  const spline = new CatmullRomCurve3(points)
  const divisions = Math.round(4 * points.length)
  const point = new Vector3()
  const pointColor = new Color()

  const positions = new Float32Array(divisions * 3)
  const colors = new Float32Array(divisions * 3)
  const sizes = new Float32Array(divisions)

  for (let i = 0; i < divisions; i++) {
    const t = i / divisions

    spline.getPoint(t, point)
    positions[i * 3 + 0] = point.x
    positions[i * 3 + 1] = point.y
    positions[i * 3 + 2] = point.z

    pointColor.setHSL(t, 1.0, 0.5, SRGBColorSpace)
    colors[i * 3 + 0] = pointColor.r
    colors[i * 3 + 1] = pointColor.g
    colors[i * 3 + 2] = pointColor.b

    sizes[i] = 10.0 // seed value; the compute kernel overwrites it every frame
  }

  return {
    divisions,
    positionAttribute: new InstancedBufferAttribute(positions, 3),
    colorsAttribute: new InstancedBufferAttribute(colors, 3),
    sizes,
  }
}

export interface InstancedPointsProps {
  alphaToCoverage: boolean
  /** Pulse floor, in pixels (sizeAttenuation is off). */
  minWidth: number
  /** Pulse ceiling, in pixels; also normalizes the color fade. */
  maxWidth: number
  pulseSpeed: number
}

export function InstancedPoints({ alphaToCoverage, minWidth, maxWidth, pulseSpeed }: InstancedPointsProps) {
  const rawRenderer = useThree((state) => state.renderer)
  // Cast: useThree types renderer as the WebGL/WebGPU union even on the `/webgpu`
  // entry (fiber typing gap, UPSTREAM.md B9) — `.compute()` exists only on WebGPURenderer.
  const renderer = rawRenderer as WebGPURenderer

  // Leva knobs → live uniforms: create-or-update semantics sync new values on every
  // re-render; the compute kernel and render graph reference the stable node instances.
  const { uPulseSpeed, uMinWidth, uMaxWidth } = useUniforms(
    { uPulseSpeed: pulseSpeed, uMinWidth: minWidth, uMaxWidth: maxWidth },
    'instancePoints', // WGSL-identifier rule: camelCase scope, never kebab-case
  )
  // Casts: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`
  // (documented fiber typing gap — see tsl-galaxy et al.).
  const uPulseSpeedNode = uPulseSpeed as unknown as Node<'float'>
  const uMinWidthNode = uMinWidth as unknown as Node<'float'>
  const uMaxWidthNode = uMaxWidth as unknown as Node<'float'>

  const { divisions, positionAttribute, colorsAttribute, sizes } = useMemo(buildPointData, [])

  // Per-instance size storage, GPU-resident after the seed upload. UNSCOPED on
  // purpose: scoped useBuffers names the buffer `${scope}.${name}` and the dot lands
  // in the WGSL struct name — runtime shader compile error (fiber bug, UPSTREAM.md
  // B16). Root-level keys are bare identifiers; prefix instead.
  const { ipPointSizes } = useBuffers(() => ({
    ipPointSizes: instancedArray(sizes, 'float'),
  }))

  // All node graphs built exactly once; we close over the TYPED hook return above
  // (creator-state reads widen to fiber's BufferLike, losing `.element()`/
  // `.toAttribute()`). Also UNSCOPED (UPSTREAM.md B16): these nodes reach WGSL codegen.
  const { ipComputeSize, ipPositionNode, ipColorNode, ipSizeNode, ipOpacityNode } = useNodes(() => {
    // One storage read shared by the render graph: per-instance size as a vertex
    // attribute — the quad's pixel size AND the color-fade factor below.
    const sizeAttrib = ipPointSizes.toAttribute()

    // Pulse kernel, ported verbatim: phase-offset each instance by its index so the
    // pulse travels along the curve; sin -> [0,1] -> lerp minWidth..maxWidth.
    const ipComputeSize = Fn(() => {
      const relativeTime = time.add(float(instanceIndex))
      const sizeFactor = sin(relativeTime.mul(uPulseSpeedNode)).add(1).div(2)

      ipPointSizes
        .element(instanceIndex)
        .assign(sizeFactor.mul(uMaxWidthNode.sub(uMinWidthNode)).add(uMinWidthNode))
    })().compute(divisions)

    return {
      ipComputeSize,
      // Explicit type args: typed-TSL creators don't infer from their value args
      // under strict tsc (corpus rule; same family as the Fn-param cast).
      ipPositionNode: instancedBufferAttribute<'vec3'>(positionAttribute, 'vec3'),
      // Fade the HSL rainbow toward black as the point shrinks (size / maxWidth).
      ipColorNode: mix(
        vec3(0.0),
        instancedBufferAttribute<'vec3'>(colorsAttribute, 'vec3'),
        sizeAttrib.div(uMaxWidthNode),
      ),
      ipSizeNode: sizeAttrib,
      ipOpacityNode: shapeCircle(),
    }
  })

  // EVERY FRAME: pulse the sizes before the render phase draws them (compute is not
  // a render takeover — never `phase: 'render'`).
  useFrame(
    () => {
      renderer.compute(ipComputeSize)
    },
    { phase: 'update' },
  )

  // alphaToCoverage is baked into shapeCircle()'s build-time branch AND the pipeline's
  // multisample state — a bare property write (all the original's GUI does) can't
  // rebuild the shader, so the toggle bumps needsUpdate explicitly (see header).
  const materialRef = useRef<PointsNodeMaterial>(null)
  useEffect(() => {
    const material = materialRef.current
    if (!material) return
    material.alphaToCoverage = alphaToCoverage
    material.needsUpdate = true
  }, [alphaToCoverage])

  return (
    // One Sprite drawing `divisions` instances; positionNode fully relocates the unit
    // quad, so three's CPU-side culling sphere knows nothing — frustumCulled off.
    <sprite count={divisions} frustumCulled={false}>
      <pointsNodeMaterial
        ref={materialRef}
        positionNode={ipPositionNode}
        colorNode={ipColorNode}
        sizeNode={ipSizeNode}
        opacityNode={ipOpacityNode}
        vertexColors
        sizeAttenuation={false}
        alphaToCoverage
      />
    </sprite>
  )
}
