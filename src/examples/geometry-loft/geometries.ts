// Pure `LoftGeometry` factories — no React, no TSL, just cross-section math ported
// near-verbatim from the original example. `LoftGeometry` (three.js addon) skins a
// surface through an array of cross sections; every shape below is just a different
// way of producing that `Vector3[][]` array (revolved profile, swept path, or a
// hand-parameterized ring-per-step loop).
import { LoftGeometry } from 'three/addons/geometries/LoftGeometry.js'
import { MathUtils, SplineCurve, Vector2, Vector3 } from 'three/webgpu'

// Revolves a smoothed 2d profile (x = radius, y = height) into circular sections,
// like a lathe — shared by every exhibit whose profile is a simple silhouette.
function createRevolvedSections(profile: Vector2[], divisions: number, segments: number): Vector3[][] {
  const points = new SplineCurve(profile).getPoints(divisions)
  const sections: Vector3[][] = []

  for (let i = 0; i <= divisions; i++) {
    const point = points[i]
    const ring: Vector3[] = []

    for (let j = 0; j < segments; j++) {
      const angle = (j / segments) * Math.PI * 2
      ring.push(new Vector3(Math.sin(angle) * point.x, point.y, Math.cos(angle) * point.x))
    }

    sections.push(ring)
  }

  return sections
}

// A stepped plinth, a tapered shaft and a cornice; revolved without smoothing, one
// ring per profile point. Doubled points split the vertex normals, keeping those
// turnings crisp.
export function createPedestalGeometry(radius: number, height: number): LoftGeometry {
  const profile = [
    new Vector2(0.2, 0),
    new Vector2(radius * 1.06, 0),
    new Vector2(radius * 1.06, height * 0.1),
    new Vector2(radius * 1.06, height * 0.1),
    new Vector2(radius * 0.98, height * 0.16),
    new Vector2(radius * 0.94, height * 0.55),
    new Vector2(radius * 0.97, height * 0.84),
    new Vector2(radius * 1.04, height * 0.88),
    new Vector2(radius * 1.04, height * 0.97),
    new Vector2(radius * 1.04, height * 0.97),
    new Vector2(radius * 0.98, height),
    new Vector2(radius * 0.98, height),
    new Vector2(radius * 0.5, height - 0.004),
    new Vector2(0.2, height),
  ]

  const sections: Vector3[][] = []

  for (const point of profile) {
    const ring: Vector3[] = []

    for (let j = 0; j < 48; j++) {
      const angle = (j / 48) * Math.PI * 2
      ring.push(new Vector3(Math.sin(angle) * point.x, point.y, Math.cos(angle) * point.x))
    }

    sections.push(ring)
  }

  return new LoftGeometry(sections, { capStart: true, capEnd: true })
}

// From the bottom center, up the egg shaped outer wall, over the lip and back down
// the inner wall.
export function createCupGeometry(): LoftGeometry {
  const profile = [
    new Vector2(0.2, 0),
    new Vector2(0.7, 0.04),
    new Vector2(1.05, 0.1),
    new Vector2(1.75, 0.55),
    new Vector2(2.25, 1.45),
    new Vector2(2.36, 2.2),
    new Vector2(2.3, 3.1),
    new Vector2(2.22, 3.82),
    new Vector2(2.18, 3.95),
    new Vector2(2.06, 3.8),
    new Vector2(2.18, 2.2),
    new Vector2(1.5, 0.75),
    new Vector2(0.9, 0.55),
    new Vector2(0.2, 0.62),
  ]

  return new LoftGeometry(createRevolvedSections(profile, 120, 64), { capStart: true, capEnd: true })
}

// From the bottom center, out along the underside, around the thin rim and back
// across the gently dished top.
export function createSaucerGeometry(): LoftGeometry {
  const profile = [
    new Vector2(0.2, 0),
    new Vector2(1.3, 0.08),
    new Vector2(2.6, 0.35),
    new Vector2(3.7, 0.8),
    new Vector2(4.2, 1),
    new Vector2(3.4, 0.68),
    new Vector2(2, 0.3),
    new Vector2(1, 0.18),
    new Vector2(0.2, 0.26),
  ]

  return new LoftGeometry(createRevolvedSections(profile, 120, 64), { capStart: true, capEnd: true })
}

// An ear shaped loop swept along a spline, slightly tapering; the ends slim down so
// they stay buried inside the thin cup wall.
export function createHandleGeometry(): LoftGeometry {
  const path = new SplineCurve([
    new Vector2(2.2, 3.3),
    new Vector2(2.9, 3.45),
    new Vector2(3.6, 2.85),
    new Vector2(3.65, 1.95),
    new Vector2(3, 1.2),
    new Vector2(1.78, 1.05),
  ])

  const divisions = 60
  const points = path.getPoints(divisions)
  const sections: Vector3[][] = []

  for (let i = 0; i <= divisions; i++) {
    const t = i / divisions
    const point = points[i]
    const tangent = path.getTangent(t)

    const scale =
      (1 - 0.25 * t) *
      (0.28 + 0.72 * MathUtils.smoothstep(t, 0, 0.12)) *
      (0.28 + 0.72 * (1 - MathUtils.smoothstep(t, 0.88, 1)))

    const a = 0.22 * scale // in the plane of the loop
    const b = 0.27 * scale // across the loop

    const ring: Vector3[] = []

    for (let j = 0; j < 16; j++) {
      const phi = (j / 16) * Math.PI * 2
      const radial = a * Math.cos(phi)

      ring.push(
        new Vector3(point.x - radial * tangent.y, point.y + radial * tangent.x, b * Math.sin(phi)),
      )
    }

    sections.push(ring)
  }

  return new LoftGeometry(sections)
}

// A full belly, a slender waist and a flared lip.
export function createVaseGeometry(): LoftGeometry {
  const profile = [
    new Vector2(0.2, 0),
    new Vector2(1.05, 0.05),
    new Vector2(1.5, 0.3),
    new Vector2(2.1, 1.4),
    new Vector2(2.2, 2.3),
    new Vector2(1.8, 3.6),
    new Vector2(1.2, 4.8),
    new Vector2(0.85, 5.8),
    new Vector2(0.72, 6.6),
    new Vector2(0.8, 7.3),
    new Vector2(1.1, 7.9),
    new Vector2(1.3, 8.2),
  ]

  return new LoftGeometry(createRevolvedSections(profile, 100, 48), { capStart: true })
}

export function createShellGeometry(): LoftGeometry {
  const turns = 3
  const growth = 0.18
  const scale = Math.exp(growth * turns * Math.PI * 2)

  const sections: Vector3[][] = []

  for (let i = 0; i <= 150; i++) {
    const t = i / 150
    const angle = turns * Math.PI * 2 * t
    const e = Math.exp(growth * angle) / scale

    const pathRadius = 3 * e
    const sectionRadius = 2.4 * e
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)

    const points: Vector3[] = []

    for (let j = 0; j < 32; j++) {
      const phi = (j / 32) * Math.PI * 2
      const r = pathRadius + sectionRadius * Math.cos(phi)

      points.push(new Vector3(r * sin, 4.5 * (1 - e) + sectionRadius * Math.sin(phi), r * cos))
    }

    sections.push(points)
  }

  return new LoftGeometry(sections)
}

export function createStarGeometry(): LoftGeometry {
  const sections: Vector3[][] = []

  for (let i = 0; i <= 60; i++) {
    const t = i / 60
    const twist = (t * Math.PI) / 3
    const scale = 1 - 0.35 * Math.sin(t * Math.PI)

    const points: Vector3[] = []

    for (let j = 0; j < 96; j++) {
      const angle = (j / 96) * Math.PI * 2
      const radius = (2.4 + 0.7 * Math.cos(5 * angle)) * scale
      points.push(new Vector3(Math.sin(angle + twist) * radius, t * 10, Math.cos(angle + twist) * radius))
    }

    sections.push(points)
  }

  return new LoftGeometry(sections, { capStart: true, capEnd: true })
}

// Open two-point sections (`closed: false`) — a strip, not a tube.
export function createRibbonGeometry(): LoftGeometry {
  const sections: Vector3[][] = []

  for (let i = 0; i <= 120; i++) {
    const t = i / 120
    const angle = t * Math.PI * 2 * 2.5
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)

    sections.push([new Vector3(3 * sin, t * 7.5, 3 * cos), new Vector3(3 * sin, t * 7.5 + 2, 3 * cos)])
  }

  return new LoftGeometry(sections, { closed: false })
}

// A cap, a shoulder, and a body whose circular sections flatten into a wide crimped
// seam at the top.
export function createToothpasteGeometry(): LoftGeometry {
  const sections: Vector3[][] = []

  for (let i = 0; i <= 80; i++) {
    const t = i / 80

    const radius = 0.5 + 0.28 * MathUtils.smoothstep(t, 0.08, 0.2)
    const crimp = MathUtils.smoothstep(t, 0.3, 0.95)

    const width = radius * (1 - crimp) + 1.15 * crimp
    const depth = radius * (1 - crimp) + 0.05 * crimp

    const points: Vector3[] = []

    for (let j = 0; j < 48; j++) {
      const angle = (j / 48) * Math.PI * 2
      points.push(new Vector3(Math.sin(angle) * width, t * 4.2, Math.cos(angle) * depth))
    }

    sections.push(points)
  }

  return new LoftGeometry(sections, { capStart: true, capEnd: true })
}

// A squashed sphere with broad lobes split by narrow creases, and a sunken hollow
// around the stem.
export function createPumpkinGeometry(): LoftGeometry {
  const sections: Vector3[][] = []

  for (let i = 0; i <= 60; i++) {
    const t = i / 60

    const angle = Math.PI * (0.03 + 0.94 * t)
    const radius = 1.85 * Math.pow(Math.sin(angle), 0.62)
    const creases = 0.15 * Math.sin(Math.PI * t)

    const y = 2.05 * t - 0.75 * MathUtils.smoothstep(t, 0.8, 1)

    const points: Vector3[] = []

    for (let j = 0; j < 96; j++) {
      const theta = (j / 96) * Math.PI * 2
      const lobe = Math.pow(Math.abs(Math.cos(3.5 * theta)), 0.35)
      const r = radius * (1 - creases + creases * lobe)

      points.push(new Vector3(Math.sin(theta) * r, y, Math.cos(theta) * r))
    }

    sections.push(points)
  }

  return new LoftGeometry(sections, { capStart: true, capEnd: true })
}

// A ribbed stalk, flared at its base, that rises out of the hollow and leans over.
export function createPumpkinStemGeometry(): LoftGeometry {
  const sections: Vector3[][] = []

  for (let i = 0; i <= 30; i++) {
    const t = i / 30

    const radius = 0.2 - 0.09 * t + 0.14 * Math.pow(1 - t, 4)
    const lean = 0.45 * t * t

    const points: Vector3[] = []

    for (let j = 0; j < 32; j++) {
      const angle = (j / 32) * Math.PI * 2
      const r = radius * (0.92 + 0.13 * Math.pow(Math.abs(Math.cos(2.5 * angle)), 0.5))

      points.push(new Vector3(lean + Math.sin(angle) * r, 1.3 + 1.15 * t, Math.cos(angle) * r))
    }

    sections.push(points)
  }

  return new LoftGeometry(sections, { capEnd: true })
}

// From under the rim, around the edge and over the dome.
export function createMushroomCapGeometry(): LoftGeometry {
  const profile = [
    new Vector2(0.35, 2.02),
    new Vector2(1.1, 2),
    new Vector2(1.65, 2.15),
    new Vector2(1.78, 2.4),
    new Vector2(1.5, 2.85),
    new Vector2(0.95, 3.18),
    new Vector2(0.2, 3.32),
  ]

  return new LoftGeometry(createRevolvedSections(profile, 80, 48), { capEnd: true })
}

export function createMushroomStemGeometry(): LoftGeometry {
  const profile = [
    new Vector2(0.2, 0),
    new Vector2(0.55, 0.05),
    new Vector2(0.45, 0.9),
    new Vector2(0.4, 1.7),
    new Vector2(0.42, 2.3),
  ]

  return new LoftGeometry(createRevolvedSections(profile, 60, 32), { capStart: true, capEnd: true })
}

// A foot, a thin stem, and a bowl that folds back down inside.
export function createGobletGeometry(): LoftGeometry {
  const profile = [
    new Vector2(0.2, 0),
    new Vector2(1.25, 0.05),
    new Vector2(1.35, 0.2),
    new Vector2(0.6, 0.5),
    new Vector2(0.28, 0.9),
    new Vector2(0.24, 1.7),
    new Vector2(0.7, 2.15),
    new Vector2(1.15, 2.8),
    new Vector2(1.28, 3.5),
    new Vector2(1.27, 3.62),
    new Vector2(1.16, 3.5),
    new Vector2(0.95, 2.85),
    new Vector2(0.45, 2.25),
    new Vector2(0.2, 2.32),
  ]

  return new LoftGeometry(createRevolvedSections(profile, 140, 48), { capStart: true, capEnd: true })
}

// A flat disc base, a slender pole and a small ball finial.
export function createStanchionGeometry(): LoftGeometry {
  const profile = [
    new Vector2(0.16, 0),
    new Vector2(0.42, 0.04),
    new Vector2(0.46, 0.12),
    new Vector2(0.28, 0.22),
    new Vector2(0.08, 0.38),
    new Vector2(0.06, 1),
    new Vector2(0.06, 1.85),
    new Vector2(0.11, 1.95),
    new Vector2(0.19, 2.08),
    new Vector2(0.2, 2.2),
    new Vector2(0.11, 2.3),
    new Vector2(0.04, 2.34),
  ]

  return new LoftGeometry(createRevolvedSections(profile, 80, 24), { capStart: true, capEnd: true })
}

// A cord sagging between two stanchions, with both ends buried in their poles.
export function createRopeGeometry(length: number): LoftGeometry {
  const sag = 0.9
  const sections: Vector3[][] = []

  for (let i = 0; i <= 40; i++) {
    const t = i / 40

    const x = (t - 0.5) * length
    const y = -sag * 4 * t * (1 - t)

    // The in-plane tangent orients the rings along the curve.
    const tx = length
    const ty = -sag * 4 * (1 - 2 * t)
    const tl = Math.sqrt(tx * tx + ty * ty)

    const points: Vector3[] = []

    for (let j = 0; j < 16; j++) {
      const phi = (j / 16) * Math.PI * 2
      const radial = 0.08 * Math.cos(phi)

      points.push(new Vector3(x - (radial * ty) / tl, y + (radial * tx) / tl, 0.08 * Math.sin(phi)))
    }

    sections.push(points)
  }

  return new LoftGeometry(sections)
}

// Rows of pleated rings hanging from above; the folds deepen and drift sideways as
// they fall.
export function createCurtainGeometry(): LoftGeometry {
  const sections: Vector3[][] = []

  for (let i = 0; i <= 30; i++) {
    const t = i / 30
    const y = -5 + 25 * t

    const points: Vector3[] = []

    for (let j = 0; j < 480; j++) {
      const s = j / 480

      const folds = (1.2 - 0.5 * t) * Math.sin(s * Math.PI * 2 * 48 + t * 2)
      const sway = 0.5 * Math.sin(s * Math.PI * 2 * 5 + t * 3)

      const theta = s * Math.PI * 2
      const r = 55 + folds + sway

      points.push(new Vector3(Math.sin(theta) * r, y, Math.cos(theta) * r))
    }

    sections.push(points)
  }

  return new LoftGeometry(sections)
}
