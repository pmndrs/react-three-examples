// The swatch grid: every WoodNodeMaterial genus/finish preset as a rounded
// block, TextGeometry row/column labels, and the leva-driven "custom" block.
// Suspends on the label font — mounted inside the page's one Suspense gate.
import { useMemo } from 'react'
import { useLoader } from '@react-three/fiber/webgpu'
import { Matrix4, MeshStandardNodeMaterial, type MeshPhysicalNodeMaterial } from 'three/webgpu'
import { FontLoader, type Font } from 'three/addons/loaders/FontLoader.js'
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { Finishes, WoodGenuses, WoodNodeMaterial } from 'three/addons/materials/WoodNodeMaterial.js'

const FONT_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/fonts/helvetiker_regular.typeface.json'

// Live-mutable parameters of the leva "custom wood" block (all of them are
// onObjectUpdate-backed uniforms or reference-backed physical properties on
// the material instance — see header DEMONSTRATES).
export interface CustomWoodParams {
  centerSize: number
  largeWarpScale: number
  largeGrainStretch: number
  smallWarpStrength: number
  smallWarpScale: number
  fineWarpStrength: number
  fineWarpScale: number
  ringThickness: number
  ringBias: number
  ringSizeVariance: number
  ringVarianceScale: number
  barkThickness: number
  splotchScale: number
  splotchIntensity: number
  cellScale: number
  cellSize: number
  darkGrainColor: string
  lightGrainColor: string
  clearcoat: number
  clearcoatRoughness: number
}

// Original's getGridPosition — coordinates are local to the rotated base group.
function gridPosition(woodIndex: number, finishIndex: number): [number, number, number] {
  return [
    0,
    (finishIndex - Finishes.length / 2) * 1.0,
    (woodIndex - WoodGenuses.length / 2 + 0.45) * 1.0,
  ]
}

// A bbox-centered TextGeometry label, rotated to face up through the base
// group's -PI/2 z-rotation (same as the original's createLabel).
function Label({
  text,
  font,
  material,
  position,
}: {
  text: string
  font: Font
  material: MeshStandardNodeMaterial
  position: [number, number, number]
}) {
  const geometry = useMemo(() => {
    const geo = new TextGeometry(text, {
      font,
      size: 0.1,
      depth: 0.001,
      curveSegments: 12,
      bevelEnabled: false,
    })
    geo.computeBoundingBox()
    const bb = geo.boundingBox!
    geo.translate(
      -0.5 * (bb.max.x - bb.min.x),
      -0.5 * (bb.max.y - bb.min.y),
      -0.5 * (bb.max.z - bb.min.z),
    )
    return geo
  }, [text, font])

  return (
    <group position={position} rotation-y={-Math.PI / 2}>
      <mesh geometry={geometry} material={material} />
    </group>
  )
}

export function WoodShowcase({ custom }: { custom: CustomWoodParams }) {
  const font = useLoader(FontLoader, FONT_URL)

  // One shared rounded slab, one shared black label material (like the original).
  const blockGeometry = useMemo(() => new RoundedBoxGeometry(0.125, 0.9, 0.9, 10, 0.02), [])
  const labelMaterial = useMemo(() => new MeshStandardNodeMaterial({ color: '#000000' }), [])

  // 10 genuses x 4 finishes. Each material samples a different slice of the
  // procedural log via its transformationMatrix uniform (random z, like the
  // original) — the colorNode graph itself is shared across all instances.
  const presetBlocks = useMemo(
    () =>
      WoodGenuses.flatMap((genus, x) =>
        Finishes.map((finish, y) => {
          const material = WoodNodeMaterial.fromPreset(genus, finish)
          material.transformationMatrix = new Matrix4().setPosition(-0.1, 0, Math.random())
          return { key: `${genus}-${finish}`, material, position: gridPosition(x, y) }
        }),
      ),
    [],
  )

  const customMaterial = useMemo(() => {
    // Constructed with the leva defaults so the first shader build matches the
    // panel; every later change flows through the <primitive> prop diff below.
    const material = new WoodNodeMaterial({
      centerSize: 1.11,
      largeWarpScale: 0.32,
      largeGrainStretch: 0.24,
      smallWarpStrength: 0.059,
      smallWarpScale: 2,
      fineWarpStrength: 0.006,
      fineWarpScale: 32.8,
      ringThickness: 1 / 34,
      ringBias: 0.03,
      ringSizeVariance: 0.03,
      ringVarianceScale: 4.4,
      barkThickness: 0.3,
      splotchScale: 0.2,
      splotchIntensity: 0.541,
      cellScale: 910,
      cellSize: 0.1,
      darkGrainColor: '#0c0504',
      lightGrainColor: '#926c50',
      clearcoat: 1,
      clearcoatRoughness: 0.2,
    })
    material.transformationMatrix = new Matrix4().setPosition(-0.1, 0, Math.random())
    // The r185 constructor bakes clearcoatNode to a CONSTANT, which overrides
    // the live `clearcoat` property (the original's GUI slider is inert because
    // of this). Null it before the first build so the reference-backed property
    // drives the coat instead. Cast: @types declares WoodNodeMaterial as the
    // classic MeshPhysicalMaterial, which omits the *Node fields (B11 family).
    ;(material as unknown as MeshPhysicalNodeMaterial).clearcoatNode = null
    return material
  }, [])

  return (
    // The original's `base` group: rotated so the slab grid lies flat under the
    // top-down camera, shifted to keep the grid centered on the controls target.
    <group rotation={[0, 0, -Math.PI / 2]} position={[0, 0, 0.548]}>
      {/* Finish labels (left column) and genus labels (top row). */}
      {Finishes.map((finish, y) => (
        <Label key={finish} text={finish} font={font} material={labelMaterial} position={gridPosition(-1, y)} />
      ))}
      {WoodGenuses.map((genus, x) => (
        <Label key={genus} text={genus} font={font} material={labelMaterial} position={gridPosition(x, -1)} />
      ))}

      {presetBlocks.map((block) => (
        <mesh key={block.key} geometry={blockGeometry} material={block.material} position={block.position} />
      ))}

      {/* The leva-driven custom block, off the end of the grid. Spreading the
          leva values onto <primitive attach="material"> mutates the live
          material properties — every one is re-read per frame by the shared
          wood node graph, zero rebuilds. */}
      <Label text="custom" font={font} material={labelMaterial} position={gridPosition(WoodGenuses.length / 2 - 1, 5)} />
      <mesh geometry={blockGeometry} position={gridPosition(WoodGenuses.length / 2, 5)}>
        <primitive object={customMaterial} attach="material" {...custom} />
      </mesh>
    </group>
  )
}
