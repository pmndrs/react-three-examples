// The two flame sprites and their TSL node graphs — ported near-verbatim from the
// original's flame1/flame2 materials (see the header block in tsl-vfx-flames.tsx for
// the full DEMONSTRATES/DIVERGENCE story). Lives in its own file because it needs
// fiber hooks (`useUniforms`) and therefore must render inside `<Canvas>`.
import { useEffect, useMemo } from 'react'
import { useUniforms } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import {
  billboarding,
  Fn,
  mix,
  oneMinus,
  sin,
  spherizeUV,
  step,
  texture,
  time,
  TWO_PI,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import { CanvasTexture, DoubleSide, SpriteNodeMaterial, SRGBColorSpace } from 'three/webgpu'
import type { Node } from 'three/webgpu'

const CDN = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples'
const CELLULAR_URL = `${CDN}/textures/noises/voronoi/grayscale-256x256.png`
const PERLIN_URL = `${CDN}/textures/noises/perlin/rgb-256x256.png`

export interface FlamesProps {
  timeScale: number
  gradientColors: string[]
}

export function Flames({ timeScale, gradientColors }: FlamesProps) {
  const [cellularTexture, perlinTexture] = useTexture([CELLULAR_URL, PERLIN_URL])

  const { uTimeScale } = useUniforms({ uTimeScale: timeScale }, 'vfxFlames')
  // Cast: fiber's `UniformNode<T>` pins its TSL type param to `unknown` — documented
  // upstream typing gap (see header DIVERGENCE).
  const uTimeScaleNode = uTimeScale as unknown as Node<'float'>

  // 128x1 gradient LUT. The texture object is identity-stable (painted in the effect
  // below), so leva color edits never rebuild the node graph.
  const gradientTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 1
    const lut = new CanvasTexture(canvas)
    lut.colorSpace = SRGBColorSpace
    return lut
  }, [])

  useEffect(() => {
    const canvas = gradientTexture.image as HTMLCanvasElement
    const context = canvas.getContext('2d')
    if (!context) return
    const fillGradient = context.createLinearGradient(0, 0, canvas.width, 0)
    for (let i = 0; i < gradientColors.length; i++) {
      fillGradient.addColorStop(i / (gradientColors.length - 1), gradientColors[i])
    }
    context.fillStyle = fillGradient
    context.fillRect(0, 0, canvas.width, canvas.height)
    gradientTexture.needsUpdate = true
  }, [gradientTexture, gradientColors])

  const { flame1Material, flame2Material } = useMemo(() => {
    // Every `time` term in the original scales through the live uniform — slow-mo
    // with zero graph rebuilds.
    const t = time.mul(uTimeScaleNode)

    // flame 1 — the gradient-toned core

    const flame1Material = new SpriteNodeMaterial({ side: DoubleSide })

    flame1Material.colorNode = Fn(() => {
      // main UV
      const mainUv = uv().toVar()
      mainUv.assign(spherizeUV(mainUv, 10).mul(0.6).add(0.2)) // spherize
      mainUv.assign(mainUv.pow(vec2(1, 2))) // stretch
      mainUv.assign(mainUv.mul(2, 1).sub(vec2(0.5, 0))) // scale

      // gradients
      const gradient1 = sin(t.mul(10).sub(mainUv.y.mul(TWO_PI).mul(2))).toVar()
      const gradient2 = mainUv.y.smoothstep(0, 1).toVar()
      mainUv.x.addAssign(gradient1.mul(gradient2).mul(0.2))

      // cellular noise
      const cellularUv = mainUv.mul(0.5).add(vec2(0, t.negate().mul(0.5))).mod(1)
      const cellularNoise = texture(cellularTexture, cellularUv, 0).r.oneMinus().smoothstep(0, 0.5).oneMinus().toVar()
      cellularNoise.mulAssign(gradient2)

      // shape
      const shape = mainUv.sub(0.5).mul(vec2(3, 2)).length().oneMinus().toVar()
      shape.assign(shape.sub(cellularNoise))

      // gradient color
      const gradientColor = texture(gradientTexture, vec2(shape.remap(0, 1, 0, 1), 0))

      // output
      const color = mix(gradientColor, vec3(1), shape.step(0.8))
      const alpha = shape.smoothstep(0, 0.3)
      return vec4(color.rgb, alpha)
    })()

    // flame 2 — the white silhouette flame

    const flame2Material = new SpriteNodeMaterial({ side: DoubleSide })

    flame2Material.colorNode = Fn(() => {
      // main UV
      const mainUv = uv().toVar()
      mainUv.assign(spherizeUV(mainUv, 10).mul(0.6).add(0.2)) // spherize
      mainUv.assign(mainUv.abs().pow(vec2(1, 3)).mul(mainUv.sign())) // stretch
      mainUv.assign(mainUv.mul(2, 1).sub(vec2(0.5, 0))) // scale

      // perlin noise
      const perlinUv = mainUv.add(vec2(0, t.negate().mul(1))).mod(1)
      const perlinNoise = texture(perlinTexture, perlinUv, 0).sub(0.5).mul(1)
      mainUv.x.addAssign(perlinNoise.x.mul(0.5))

      // gradients
      const gradient1 = sin(t.mul(10).sub(mainUv.y.mul(TWO_PI).mul(2)))
      const gradient2 = mainUv.y.smoothstep(0, 1)
      const gradient3 = oneMinus(mainUv.y).smoothstep(0, 0.3)
      mainUv.x.addAssign(gradient1.mul(gradient2).mul(0.2))

      // displaced perlin noise
      const displacementPerlinUv = mainUv.mul(0.5).add(vec2(0, t.negate().mul(0.25))).mod(1)
      const displacementPerlinNoise = texture(perlinTexture, displacementPerlinUv, 0).sub(0.5).mul(1)
      const displacedPerlinUv = mainUv.add(vec2(0, t.negate().mul(0.5))).add(displacementPerlinNoise).mod(1)
      const displacedPerlinNoise = texture(perlinTexture, displacedPerlinUv, 0).sub(0.5).mul(1)
      mainUv.x.addAssign(displacedPerlinNoise.mul(0.5))

      // cellular noise
      const cellularUv = mainUv.add(vec2(0, t.negate().mul(1.5))).mod(1)
      const cellularNoise = texture(cellularTexture, cellularUv, 0).r.oneMinus().smoothstep(0.25, 1)

      // shape
      const shape = step(mainUv.sub(0.5).mul(vec2(6, 1)).length(), 0.5).toVar()
      shape.assign(shape.mul(cellularNoise))
      shape.mulAssign(gradient3)
      shape.assign(step(0.01, shape))

      // output
      return vec4(vec3(1), shape)
    })()

    // billboarding — follow the camera rotation only horizontally
    flame1Material.vertexNode = billboarding()
    flame2Material.vertexNode = billboarding()

    return { flame1Material, flame2Material }
  }, [cellularTexture, perlinTexture, gradientTexture, uTimeScaleNode])

  return (
    <>
      <sprite material={flame1Material} position={[-0.5, 0, 0]} scale={[0.5, 1, 1]} />
      <sprite material={flame2Material} position={[0.5, 0, 0]} />
    </>
  )
}
