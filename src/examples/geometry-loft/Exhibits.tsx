// The whole still-life: floor, curtain, nine marble pedestals and the seventeen
// lofted exhibits standing on them, plus a rope barrier ringing the exhibition.
// Built as one plain `THREE.Group` in a single `useMemo` — same manual-scene-graph
// escape hatch as `reflection/Tree.tsx` — because the "rebuild a skeleton of rings
// from geometry.parameters" feature (DEMONSTRATES) needs direct references to every
// loft mesh AND its final world matrix, which falls out for free when the group is
// built this way but would need prop-drilling refs through 17 separate JSX
// components for no benefit: this is a direct, mostly 1:1 port of the original's own
// imperative `init()`.
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import {
  BufferGeometry,
  CircleGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardNodeMaterial,
} from 'three/webgpu'
import type { Material, Vector3 } from 'three/webgpu'
import type { LoftGeometry } from 'three/addons/geometries/LoftGeometry.js'
import {
  createCupGeometry,
  createCurtainGeometry,
  createGobletGeometry,
  createHandleGeometry,
  createMushroomCapGeometry,
  createMushroomStemGeometry,
  createPedestalGeometry,
  createPumpkinGeometry,
  createPumpkinStemGeometry,
  createRibbonGeometry,
  createRopeGeometry,
  createSaucerGeometry,
  createShellGeometry,
  createStanchionGeometry,
  createStarGeometry,
  createToothpasteGeometry,
  createVaseGeometry,
} from './geometries'
import {
  createBrassMaterial,
  createCurtainMaterial,
  createFloorMaterial,
  createGobletMaterial,
  createLiquidMaterial,
  createMushroomCapMaterial,
  createMushroomStemMaterial,
  createPedestalMaterial,
  createPorcelainMaterial,
  createPumpkinMaterial,
  createPumpkinStemMaterial,
  createRibbonMaterial,
  createRopeMaterial,
  createShellMaterial,
  createStarMaterial,
  createToothpasteMaterial,
  createVaseMaterial,
} from './materials'

export interface ExhibitsProps {
  wireframe: boolean
  showSkeleton: boolean
  /** Turntable speed in rad/s (original: fixed `+= 0.001` rad PER FRAME — see header
   * DIVERGENCE for why this is delta-scaled instead). */
  rotationSpeed: number
}

// One entry per loft mesh: the mesh itself (for visibility toggling) and its ring
// positions in LOCAL space (built once from `geometry.parameters`, transformed into
// world space only after the full tree's `updateMatrixWorld` has run).
interface LoftEntry {
  mesh: Mesh
  ringPositions: Float32Array
}

// Every loft "remembers" the sections it was skinned through in `geometry.parameters`
// (three.js's own convention for procedural geometries), so a ring skeleton can be
// rebuilt straight from the geometry — no separate bookkeeping needed.
function buildRingPositions(loft: LoftGeometry): Float32Array {
  const { sections, closed } = loft.parameters
  const step = Math.max(1, Math.round(sections.length / 20))
  const positions: number[] = []

  function addRing(ring: Vector3[]) {
    const segments = closed ? ring.length : ring.length - 1
    for (let j = 0; j < segments; j++) {
      const a = ring[j]
      const b = ring[(j + 1) % ring.length]
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }

  for (let i = 0; i < sections.length; i += step) addRing(sections[i])
  if ((sections.length - 1) % step !== 0) addRing(sections[sections.length - 1])

  return new Float32Array(positions)
}

interface BuiltExhibits {
  group: Group
  skeleton: Group
  liquid: Mesh
  loftMeshes: Mesh[]
  geometries: BufferGeometry[]
  materials: Material[]
}

function buildExhibits(): BuiltExhibits {
  const geometries: BufferGeometry[] = []
  const materials: Material[] = []
  const lofts: LoftEntry[] = []

  const group = new Group()

  // Adds a loft mesh to `parent`, shadow-enabled, and remembers it (mesh + ring
  // positions) for the skeleton pass below.
  function addLoft(parent: Group, loft: LoftGeometry, material: Material): Mesh {
    geometries.push(loft)
    const mesh = new Mesh(loft, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    lofts.push({ mesh, ringPositions: buildRingPositions(loft) })
    return mesh
  }

  // Floor: large, softly mottled, running under the curtain so its edge is never seen.
  const floorMaterial = createFloorMaterial()
  materials.push(floorMaterial)
  const floorGeometry = new CircleGeometry(58, 64).rotateX(-Math.PI / 2)
  geometries.push(floorGeometry)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.position.y = -5.01
  floor.receiveShadow = true
  group.add(floor)

  // A theater curtain encircles the exhibition.
  const curtainMaterial = createCurtainMaterial()
  materials.push(curtainMaterial)
  addLoft(group, createCurtainGeometry(), curtainMaterial)

  // Pedestals: polished marble, one `LoftGeometry` per exhibit (radius/height pairs
  // repeat but are never cached — matches the original's `addPedestal`, which builds
  // fresh geometry on every call) sharing a single material instance.
  const pedestalMaterial = createPedestalMaterial()
  materials.push(pedestalMaterial)

  function addPedestal(x: number, z: number, radius: number, height: number): number {
    const pedestal = addLoft(group, createPedestalGeometry(radius, height), pedestalMaterial)
    pedestal.position.set(x, -5, z)
    pedestal.rotation.y = x * 0.7 + z * 1.3 // so the marbling differs per pedestal
    return -5 + height // the top of the pedestal
  }

  // A coffee set: a cup and a saucer lofted from the bottom center, up one side of
  // the wall and back down the inside, and a handle swept along a spline.
  const porcelain = createPorcelainMaterial()
  materials.push(porcelain)

  const coffee = new Group()
  coffee.position.y = addPedestal(0, 0, 3.6, 2.2)
  coffee.scale.setScalar(0.75)
  group.add(coffee)

  addLoft(coffee, createSaucerGeometry(), porcelain)

  const cup = addLoft(coffee, createCupGeometry(), porcelain)
  cup.position.y = 0.3

  const handle = addLoft(coffee, createHandleGeometry(), porcelain)
  handle.position.y = 0.3
  handle.rotation.y = 0.15

  // The coffee has a lazy swirl on its surface.
  const liquidMaterial = createLiquidMaterial()
  materials.push(liquidMaterial)
  const liquidGeometry = new CircleGeometry(2, 48).rotateX(-Math.PI / 2)
  geometries.push(liquidGeometry)
  const liquid = new Mesh(liquidGeometry, liquidMaterial)
  liquid.position.y = 3.6
  liquid.castShadow = false
  liquid.receiveShadow = true
  coffee.add(liquid)

  // A vase: circular sections with a varying radius.
  const vaseMaterial = createVaseMaterial()
  materials.push(vaseMaterial)
  const vase = addLoft(group, createVaseGeometry(), vaseMaterial)
  vase.position.set(-10.5, addPedestal(-10.5, -10.5, 3.6, 1.1), -10.5)

  // A seashell: circular sections that grow while sweeping along a logarithmic spiral.
  const shellMaterial = createShellMaterial()
  materials.push(shellMaterial)
  const shell = addLoft(group, createShellGeometry(), shellMaterial)
  shell.position.set(10.5, addPedestal(10.5, -10.5, 3.6, 1.1) + 1.92, -10.5)
  shell.rotation.y = -Math.PI / 2
  shell.scale.setScalar(0.8)

  // A twisted star: non-circular sections that rotate and scale along the loft.
  const starMaterial = createStarMaterial()
  materials.push(starMaterial)
  const star = addLoft(group, createStarGeometry(), starMaterial)
  star.position.set(-10.5, addPedestal(-10.5, 10.5, 3.6, 1.1), 10.5)
  star.scale.setScalar(0.8)

  // A ribbon: open two-point sections (`closed: false`), brushed along its length.
  const ribbonMaterial = createRibbonMaterial()
  materials.push(ribbonMaterial)
  const ribbon = addLoft(group, createRibbonGeometry(), ribbonMaterial)
  ribbon.position.set(10.5, addPedestal(10.5, 10.5, 3.6, 1.1), 10.5)

  // A toothpaste tube: circular sections that morph into a flat crimped seam.
  const toothpasteMaterial = createToothpasteMaterial()
  materials.push(toothpasteMaterial)
  const tube = addLoft(group, createToothpasteGeometry(), toothpasteMaterial)
  tube.position.set(7.8, addPedestal(7.8, 0, 2, 1.6), 0)
  tube.rotation.y = 0.5

  // A pumpkin: lobed sections around a squashed profile, and its stem.
  const pumpkinMaterial = createPumpkinMaterial()
  materials.push(pumpkinMaterial)
  const pumpkinStemMaterial = createPumpkinStemMaterial()
  materials.push(pumpkinStemMaterial)

  const pumpkinY = addPedestal(0, 7.8, 2, 1.6)
  const pumpkin = addLoft(group, createPumpkinGeometry(), pumpkinMaterial)
  pumpkin.position.set(0, pumpkinY, 7.8)
  const pumpkinStem = addLoft(group, createPumpkinStemGeometry(), pumpkinStemMaterial)
  pumpkinStem.position.set(0, pumpkinY, 7.8)

  // A mushroom: a cap that folds under its own rim, and its stem.
  const mushroomCapMaterial = createMushroomCapMaterial()
  materials.push(mushroomCapMaterial)
  const mushroomStemMaterial = createMushroomStemMaterial()
  materials.push(mushroomStemMaterial)

  const mushroomY = addPedestal(-7.8, 0, 2, 1.6)
  const mushroomCap = addLoft(group, createMushroomCapGeometry(), mushroomCapMaterial)
  mushroomCap.position.set(-7.8, mushroomY, 0)
  const mushroomStem = addLoft(group, createMushroomStemGeometry(), mushroomStemMaterial)
  mushroomStem.position.set(-7.8, mushroomY, 0)

  // A goblet: a foot, a thin stem and a bowl with folded back walls, in hammered copper.
  const gobletMaterial = createGobletMaterial()
  materials.push(gobletMaterial)
  const goblet = addLoft(group, createGobletGeometry(), gobletMaterial)
  goblet.position.set(0, addPedestal(0, -7.8, 2, 1.6), -7.8)

  // A rope barrier around the exhibition: brass stanchions, and a twisted cord
  // sagging between them. Both geometries are shared across every post/span, same
  // as the original — the skeleton pass below still produces one ring set per mesh
  // INSTANCE since each carries its own world matrix.
  const brassMaterial = createBrassMaterial()
  materials.push(brassMaterial)
  const ropeMaterial = createRopeMaterial()
  materials.push(ropeMaterial)

  const posts = 14
  const barrierRadius = 20

  const stanchionGeometry = createStanchionGeometry()
  const ropeGeometry = createRopeGeometry(2 * barrierRadius * Math.sin(Math.PI / posts))

  for (let i = 0; i < posts; i++) {
    const angle = ((i + 0.5) / posts) * Math.PI * 2

    const post = addLoft(group, stanchionGeometry, brassMaterial)
    post.position.set(Math.sin(angle) * barrierRadius, -5, Math.cos(angle) * barrierRadius)

    const mid = angle + Math.PI / posts
    const midRadius = barrierRadius * Math.cos(Math.PI / posts)

    const rope = addLoft(group, ropeGeometry, ropeMaterial)
    rope.position.set(Math.sin(mid) * midRadius, -5 + 2.05, Math.cos(mid) * midRadius)
    rope.rotation.y = mid
  }

  // Every loft remembers the sections it was skinned through in geometry.parameters,
  // so a skeleton of rings can be rebuilt from the meshes themselves.
  const skeleton = new Group()
  skeleton.visible = false
  group.add(skeleton)

  const lineMaterial = new LineBasicMaterial({ color: 0xaaccee })
  materials.push(lineMaterial)

  group.updateMatrixWorld(true)

  for (const { mesh, ringPositions } of lofts) {
    const lineGeometry = new BufferGeometry()
    lineGeometry.setAttribute('position', new Float32BufferAttribute(ringPositions, 3))
    geometries.push(lineGeometry)

    const lines = new LineSegments(lineGeometry, lineMaterial)
    lines.applyMatrix4(mesh.matrixWorld)
    skeleton.add(lines)
  }

  return {
    group,
    skeleton,
    liquid,
    loftMeshes: lofts.map((entry) => entry.mesh),
    geometries,
    materials,
  }
}

export function Exhibits({ wireframe, showSkeleton, rotationSpeed }: ExhibitsProps) {
  const built = useMemo(() => buildExhibits(), [])

  useFrame((_state, delta) => {
    built.group.rotation.y += rotationSpeed * delta
  })

  useEffect(() => {
    built.skeleton.visible = showSkeleton
    built.liquid.visible = !showSkeleton
    for (const mesh of built.loftMeshes) mesh.visible = !showSkeleton
  }, [built, showSkeleton])

  useEffect(() => {
    for (const material of built.materials) {
      if (material instanceof MeshStandardNodeMaterial) {
        material.wireframe = wireframe
        material.needsUpdate = true
      }
    }
  }, [built, wireframe])

  useEffect(() => {
    return () => {
      for (const geometry of built.geometries) geometry.dispose()
      for (const material of built.materials) material.dispose()
    }
  }, [built])

  return <primitive object={built.group} />
}
