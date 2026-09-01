// Pure `MeshStandardNodeMaterial` factories — one per exhibit, each composing
// `colorNode`/`roughnessNode`/`normalNode` from MaterialX noise functions
// (`mx_noise_float`/`mx_fractal_noise_float`/`mx_worley_noise_float`) and the loft's
// own uvs (`uv().x` runs along the loft, `uv().y` around each section — see
// LoftGeometry's uv generation) so every surface detail follows the geometry with no
// textures at all.
import {
  bumpMap,
  color,
  cos,
  float,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  mx_worley_noise_float,
  positionLocal,
  sin,
  smoothstep,
  uv,
  vec3,
} from 'three/tsl'
import { DoubleSide, MeshStandardNodeMaterial } from 'three/webgpu'

// Floor: large, softly mottled, running under the curtain so its edge is never seen.
export function createFloorMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: 1 })
  material.colorNode = color(0x555577).mul(mx_noise_float(positionLocal.mul(0.4)).mul(0.1).add(0.95))
  return material
}

// A theater curtain encircling the exhibition.
export function createCurtainMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: 0.9, side: DoubleSide })
  material.colorNode = color(0x86222e).mul(
    mx_noise_float(vec3(uv().y.mul(300), uv().x.mul(6), 0)).mul(0.08).add(0.96),
  )
  return material
}

// Polished marble pedestals: the veins meander and branch along the zero crossings
// of a domain-warped fractal noise — a sharp dark core inside a soft halo — over a
// gently clouded white base.
export function createPedestalMaterial(): MeshStandardNodeMaterial {
  const p = positionLocal.mul(0.9)

  const vein = mx_fractal_noise_float(p.add(mx_fractal_noise_float(p.mul(0.4), 3).mul(2)), 4).abs().oneMinus()
  const fine = mx_fractal_noise_float(p.mul(3).add(11), 3).abs().oneMinus()

  const veining = vein.pow(4).mul(0.3).add(vein.pow(12).mul(0.7)).add(fine.pow(14).mul(0.2))
  const clouds = mx_noise_float(p.mul(0.5)).mul(0.5).add(0.5)

  const material = new MeshStandardNodeMaterial()
  material.colorNode = mix(mix(color(0xf4f4f7), color(0xeeeef2), clouds), color(0xd0d0d5), veining)
  material.roughnessNode = veining.mul(0.14).add(0.07)
  material.envMapIntensity = 1.5
  return material
}

// Coffee cup, saucer and handle — shared porcelain glaze with a faint waviness.
export function createPorcelainMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial()
  material.roughnessNode = mx_noise_float(positionLocal.mul(6)).mul(0.08).add(0.2)
  material.normalNode = bumpMap(mx_noise_float(positionLocal.mul(2)).mul(0.05))
  return material
}

// The coffee itself: a lazy swirl on its surface.
export function createLiquidMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: 0.08 })
  material.colorNode = mix(color(0x2b1a12), color(0x4a2c1a), mx_noise_float(positionLocal.mul(1.5)).mul(0.5).add(0.5))
  return material
}

// Vase: circular sections with a varying radius — the glaze pools in throwing rings
// along the profile.
export function createVaseMaterial(): MeshStandardNodeMaterial {
  const vaseRings = sin(uv().x.mul(160))

  const material = new MeshStandardNodeMaterial({ side: DoubleSide })
  material.colorNode = mix(color(0x2e6f9e), color(0x82b8d8), mx_noise_float(positionLocal.mul(1.2)).mul(0.5).add(0.5))
  material.roughnessNode = vaseRings.mul(0.08).add(0.3)
  material.normalNode = bumpMap(vaseRings.mul(0.012))
  return material
}

// Seashell: growth bands and fine ridges swept along the logarithmic spiral.
export function createShellMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: 0.5, side: DoubleSide })
  material.colorNode = mix(
    color(0xc9a87f),
    color(0xf2e6d8),
    mx_noise_float(vec3(uv().x.mul(24), 0, 0)).mul(0.5).add(0.5),
  )
  material.normalNode = bumpMap(sin(uv().x.mul(480)).mul(0.02))
  return material
}

// Twisted star: non-circular sections rotating and scaling along the loft, in sandy
// terracotta.
export function createStarMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: 0.6 })
  material.colorNode = color(0xcc5544).mul(mx_noise_float(positionLocal.mul(3)).mul(0.12).add(0.94))
  material.normalNode = bumpMap(mx_noise_float(positionLocal.mul(50)).mul(0.008))
  return material
}

// Ribbon: open two-point sections brushed along its length, in gold.
export function createRibbonMaterial(): MeshStandardNodeMaterial {
  const brush = mx_noise_float(vec3(uv().x.mul(6), uv().y.mul(160), 0))

  const material = new MeshStandardNodeMaterial({ color: 0xffcc44, metalness: 1, side: DoubleSide })
  material.roughnessNode = brush.mul(0.08).add(0.1)
  material.normalNode = bumpMap(brush.mul(0.004))
  material.envMapIntensity = 2.5
  return material
}

// Toothpaste tube: circular sections morphing into a flat crimped seam, with
// stripes printed around the body.
export function createToothpasteMaterial(): MeshStandardNodeMaterial {
  const tubeU = uv().x
  const tealStripe = smoothstep(0.48, 0.5, tubeU).sub(smoothstep(0.6, 0.62, tubeU))
  const redStripe = smoothstep(0.66, 0.68, tubeU).sub(smoothstep(0.72, 0.74, tubeU))

  const material = new MeshStandardNodeMaterial({ roughness: 0.25 })
  material.colorNode = mix(mix(color(0xf2f2f2), color(0x2aa6b8), tealStripe), color(0xd0543a), redStripe)
  return material
}

// Pumpkin: the shading follows the same crease function as the geometry, so the
// narrow creases are darker and rougher than the broad lobes.
export function createPumpkinMaterial(): MeshStandardNodeMaterial {
  const lobe = cos(uv().y.mul(Math.PI * 7)).abs().pow(0.35)

  const material = new MeshStandardNodeMaterial()
  material.colorNode = mix(
    mix(color(0x9c4f16), color(0xe6913d), lobe),
    color(0x8a7a2e), // greener around the stem
    smoothstep(0.88, 1, uv().x).mul(0.6),
  )
  material.roughnessNode = float(0.7).sub(lobe.mul(0.2))
  material.normalNode = bumpMap(mx_noise_float(vec3(uv().y.mul(120), uv().x.mul(5), 0)).mul(0.01))
  return material
}

export function createPumpkinStemMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ color: 0x667744 })
  material.roughnessNode = mx_noise_float(positionLocal.mul(20)).mul(0.2).add(0.7)
  return material
}

// Mushroom cap: uvs run from under the rim (u 0) over the edge to the top center
// (u 1), so the red dome with its raised warts and the pale underside with its
// radial gills can share one material.
export function createMushroomCapMaterial(): MeshStandardNodeMaterial {
  const capU = uv().x
  const dome = smoothstep(0.42, 0.58, capU)
  const warts = smoothstep(0.18, 0.38, mx_worley_noise_float(positionLocal.mul(2.4))).oneMinus().mul(dome)
  const gills = sin(uv().y.mul(Math.PI * 120)).mul(0.5).add(0.5).mul(dome.oneMinus())

  const material = new MeshStandardNodeMaterial()
  material.colorNode = mix(
    mix(color(0xe8dcc4), color(0xbfae8e), gills),
    mix(color(0xa32d20), color(0xf2e9d8), warts),
    dome,
  )
  material.roughnessNode = float(0.55).sub(dome.mul(0.2)).add(warts.mul(0.25))
  material.normalNode = bumpMap(warts.mul(0.08).sub(gills.mul(0.015)))
  return material
}

export function createMushroomStemMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial()
  material.colorNode = color(0xe5d5b5).mul(
    mx_noise_float(vec3(uv().y.mul(24), uv().x.mul(2), 0)).mul(0.1).add(0.94),
  )
  material.roughnessNode = mx_noise_float(positionLocal.mul(12)).mul(0.15).add(0.55)
  return material
}

// Goblet: hammered copper — dents from Worley (cellular) noise.
export function createGobletMaterial(): MeshStandardNodeMaterial {
  const dents = mx_worley_noise_float(positionLocal.mul(5))

  const material = new MeshStandardNodeMaterial({ color: 0xb87333, metalness: 1 })
  material.roughnessNode = dents.mul(0.18).add(0.12)
  material.normalNode = bumpMap(dents.mul(0.1))
  material.envMapIntensity = 2
  return material
}

// Rope barrier: brass stanchions...
export function createBrassMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ color: 0xc9a86a, metalness: 1 })
  material.roughnessNode = mx_noise_float(positionLocal.mul(10)).mul(0.06).add(0.16)
  material.envMapIntensity = 2
  return material
}

// ...and a twisted cord sagging between them.
export function createRopeMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ color: 0x8a2433, roughness: 0.65 })
  // The twist of the cord.
  material.normalNode = bumpMap(sin(uv().x.mul(200).add(uv().y.mul(Math.PI * 2))).mul(0.015))
  return material
}
