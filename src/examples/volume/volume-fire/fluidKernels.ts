// The 8 compute kernels of the GPU fluid simulation (semi-Lagrangian advection,
// buoyancy + curl-noise turbulence, Jacobi pressure projection, dye advection and
// teapot emission) — a mostly verbatim TSL port of the original's kernel bodies.
// Pure builder: called once from the component's `useNodes` creator, closing over
// the storage 3D textures and the shared uniform bag.
import {
  Fn,
  If,
  float,
  instanceIndex,
  max,
  min,
  mix,
  mx_noise_float,
  smoothstep,
  texture3D,
  textureStore,
  uvec3,
  vec3,
  vec4,
} from 'three/tsl'
import type { Node, StorageTexture } from 'three/webgpu'
import {
  CELL_COUNT,
  GRID_SIZE_X,
  GRID_SIZE_Y,
  GRID_SIZE_Z,
  MOTION_BOOST,
  SMOKE_WEIGHT,
  TEXEL_X,
  TEXEL_Y,
  TEXEL_Z,
  TURBULENCE_DECAY,
  TURB_FREQUENCY,
  VEL_DAMPING,
  VOLUME_WORLD_SIZE_X,
  VOLUME_WORLD_SIZE_Y,
  VOLUME_WORLD_SIZE_Z,
  WIND_STRENGTH,
} from './constants'
import type { FireUniforms } from './fireUniforms'
import { snoiseVec3 } from 'three/addons/tsl/math/curlNoise.js'

// instanceIndex (flat 1D dispatch) -> voxel coordinate (3D)
const getVoxelCoord = (id: typeof instanceIndex) => {
  const x = id.mod(GRID_SIZE_X)
  const y = id.div(GRID_SIZE_X).mod(GRID_SIZE_Y)
  const z = id.div(GRID_SIZE_X * GRID_SIZE_Y)
  return uvec3(x, y, z)
}

// voxel coordinate -> normalized uvw at the cell center
const coordToUVW = (coord: Node<'uvec3'>) =>
  vec3(coord).add(0.5).div(vec3(GRID_SIZE_X, GRID_SIZE_Y, GRID_SIZE_Z))

export interface FluidKernelDeps {
  u: FireUniforms
  velTexA: StorageTexture
  velTexB: StorageTexture
  divTex: StorageTexture
  pressTexA: StorageTexture
  pressTexB: StorageTexture
  curlNoiseTex: StorageTexture
  /** Ping-ponged dye READ node (its `.value` is swapped each substep). */
  dyeTexNode: ReturnType<typeof texture3D>
  /** Ping-ponged dye WRITE node (swapped together with the read node). */
  dyeTexWriteNode: ReturnType<typeof textureStore>
  curlNoiseTexNode: ReturnType<typeof texture3D>
  /** Teapot vertex positions as a read-only storage buffer (the fire emitter). */
  teapotVerts: { element: (i: Node<'uint'>) => Node<'vec3'> }
  vertexCount: number
}

export function createFluidKernels({
  u,
  velTexA,
  velTexB,
  divTex,
  pressTexA,
  pressTexB,
  curlNoiseTex,
  dyeTexNode,
  dyeTexWriteNode,
  curlNoiseTexNode,
  teapotVerts,
  vertexCount,
}: FluidKernelDeps) {
  // 0) Precompute divergence-free curl noise into a repeating 3D texture (run once).
  const computeCurlNoise = Fn(() => {
    const coord = getVoxelCoord(instanceIndex)
    const uvw = coordToUVW(coord)

    const freq = float(TURB_FREQUENCY)
    const e = float(0.1).div(freq)
    const dx = vec3(e, 0.0, 0.0)
    const dy = vec3(0.0, e, 0.0)
    const dz = vec3(0.0, 0.0, e)

    const p = uvw.mul(
      vec3(VOLUME_WORLD_SIZE_X / VOLUME_WORLD_SIZE_Y, 1.0, VOLUME_WORLD_SIZE_Z / VOLUME_WORLD_SIZE_Y),
    )
    const p_x0 = snoiseVec3(p.sub(dx).mul(freq))
    const p_x1 = snoiseVec3(p.add(dx).mul(freq))
    const p_y0 = snoiseVec3(p.sub(dy).mul(freq))
    const p_y1 = snoiseVec3(p.add(dy).mul(freq))
    const p_z0 = snoiseVec3(p.sub(dz).mul(freq))
    const p_z1 = snoiseVec3(p.add(dz).mul(freq))

    const x = p_y1.z.sub(p_y0.z).sub(p_z1.y).add(p_z0.y)
    const y = p_z1.x.sub(p_z0.x).sub(p_x1.z).add(p_x0.z)
    const z = p_x1.y.sub(p_x0.y).sub(p_y1.x).add(p_y0.x)

    // Analytical curl multiplier 1 / (2 * e) = 5.0 (e = 0.1)
    const noiseVal = vec3(x, y, z).mul(5.0)

    textureStore(curlNoiseTex, coord, vec4(noiseVal, 0.0)).toWriteOnly()
  })().compute(CELL_COUNT)

  // 1) Advect velocity + external forces (buoyancy, weight, turbulence, drag wind).
  //    read: velTexA, dyeTexNode -> write: velTexB
  const advectVelocity = Fn(() => {
    const coord = getVoxelCoord(instanceIndex)
    const uvw = coordToUVW(coord)

    const vel = texture3D(velTexA, uvw, 0).xyz

    // semi-Lagrangian advection: look back along the velocity
    const velUVW = vel.div(u.uVolumeWorldSize)
    const prevPos = uvw.sub(velUVW.mul(u.uDt))
    const newVel = texture3D(velTexA, prevPos, 0).xyz.toVar()

    const dye = dyeTexNode.sample(uvw).level(float(0))
    const density = dye.r
    const temperature = dye.g
    const age = dye.b

    // buoyancy (hot rises) vs smoke weight (cold falls)
    const buoyancyForce = temperature
      .mul(u.uBuoyancy)
      .sub(density.mul(SMOKE_WEIGHT))
      .mul(VOLUME_WORLD_SIZE_Y)
    newVel.addAssign(vec3(0, buoyancyForce, 0).mul(u.uDt))

    // 1) Thermal/convective turbulence: stronger where it's hot, decaying over age
    const thermalNoisePos = uvw.add(
      vec3(0, age.negate().mul(0.6), age.mul(0.13)).div(TURB_FREQUENCY),
    )
    const decay = age.mul(-TURBULENCE_DECAY).exp()
    const thermalTurbulence = curlNoiseTexNode
      .sample(thermalNoisePos)
      .level(float(0))
      .xyz.mul(u.uTurbulence)
      .mul(temperature)
      .mul(decay)

    // 2) Ambient turbulence: lower frequency, weaker, acts on smoke density
    const ambientNoisePos = uvw
      .mul(0.5)
      .add(vec3(0, u.uTime.mul(0.25), u.uTime.mul(0.06)).div(TURB_FREQUENCY))
    const ambientTurbulence = curlNoiseTexNode
      .sample(ambientNoisePos)
      .level(float(0))
      .xyz.mul(u.uTurbulence.mul(0.2))
      .mul(density)

    const turbulence = thermalTurbulence.add(ambientTurbulence).mul(VOLUME_WORLD_SIZE_Y)
    newVel.addAssign(turbulence.mul(u.uDt))

    // damping
    newVel.mulAssign(max(float(1).sub(u.uDt.mul(VEL_DAMPING)), 0))

    // Wind effect: bounding sphere around the (dragged) teapot
    const worldPos = uvw
      .sub(0.5)
      .mul(u.uVolumeWorldSize)
      .add(vec3(0, VOLUME_WORLD_SIZE_Y / 2, 0))
    const dist = worldPos.distance(u.uTeapotPosition)
    const teapotRadius = float(1.0)

    If(dist.lessThan(teapotRadius), () => {
      const ratio = dist.div(teapotRadius)
      const falloff = smoothstep(0.0, 1.0, float(1.0).sub(ratio))

      const windNoisePos = uvw.add(vec3(0.0, u.uTime.mul(0.5), 0.0).div(TURB_FREQUENCY))
      const windTurbulence = curlNoiseTexNode
        .sample(windNoisePos)
        .level(float(0))
        .xyz.mul(u.uTurbulence)
        .mul(u.uTeapotSpeed)

      const windVel = u.uTeapotVelocity.mul(WIND_STRENGTH).add(windTurbulence).mul(u.uDt).mul(falloff)

      newVel.addAssign(windVel)
    })

    // fade velocity near the volume borders (soft boundary condition)
    const edge = min(uvw, vec3(1).sub(uvw))
    const boundary = smoothstep(0.0, 0.08, min(edge.x, min(edge.y, edge.z)))
    newVel.mulAssign(boundary)

    textureStore(velTexB, coord, vec4(newVel, 0)).toWriteOnly()
  })().compute(CELL_COUNT)

  // 2) Divergence of the advected velocity. read: velTexB -> write: divTex
  const divergence = Fn(() => {
    const coord = getVoxelCoord(instanceIndex)
    const uvw = coordToUVW(coord)

    const vR = texture3D(velTexB, uvw.add(vec3(TEXEL_X, 0, 0)), 0).x
    const vL = texture3D(velTexB, uvw.sub(vec3(TEXEL_X, 0, 0)), 0).x
    const vU = texture3D(velTexB, uvw.add(vec3(0, TEXEL_Y, 0)), 0).y
    const vD = texture3D(velTexB, uvw.sub(vec3(0, TEXEL_Y, 0)), 0).y
    const vF = texture3D(velTexB, uvw.add(vec3(0, 0, TEXEL_Z)), 0).z
    const vB = texture3D(velTexB, uvw.sub(vec3(0, 0, TEXEL_Z)), 0).z

    const div = vR.sub(vL).add(vU.sub(vD)).add(vF.sub(vB)).mul(0.5)

    textureStore(divTex, coord, vec4(div, 0, 0, 0)).toWriteOnly()
  })().compute(CELL_COUNT)

  // 3) Jacobi pressure solve (ping-pong A <-> B)
  const jacobi = (pressRead: StorageTexture, pressWrite: StorageTexture) =>
    Fn(() => {
      const coord = getVoxelCoord(instanceIndex)
      const uvw = coordToUVW(coord)

      const pR = texture3D(pressRead, uvw.add(vec3(TEXEL_X, 0, 0)), 0).x
      const pL = texture3D(pressRead, uvw.sub(vec3(TEXEL_X, 0, 0)), 0).x
      const pU = texture3D(pressRead, uvw.add(vec3(0, TEXEL_Y, 0)), 0).x
      const pD = texture3D(pressRead, uvw.sub(vec3(0, TEXEL_Y, 0)), 0).x
      const pF = texture3D(pressRead, uvw.add(vec3(0, 0, TEXEL_Z)), 0).x
      const pB = texture3D(pressRead, uvw.sub(vec3(0, 0, TEXEL_Z)), 0).x

      const div = texture3D(divTex, uvw, 0).x

      const pressure = pR.add(pL).add(pU).add(pD).add(pF).add(pB).sub(div).div(6)

      textureStore(pressWrite, coord, vec4(pressure, 0, 0, 0)).toWriteOnly()
    })().compute(CELL_COUNT)

  const jacobiAB = jacobi(pressTexA, pressTexB)
  const jacobiBA = jacobi(pressTexB, pressTexA)

  // 4) Project: subtract the pressure gradient -> divergence-free velocity.
  //    read: velTexB, pressTexA -> write: velTexA (final velocity of the substep)
  const project = Fn(() => {
    const coord = getVoxelCoord(instanceIndex)
    const uvw = coordToUVW(coord)

    const pR = texture3D(pressTexA, uvw.add(vec3(TEXEL_X, 0, 0)), 0).x
    const pL = texture3D(pressTexA, uvw.sub(vec3(TEXEL_X, 0, 0)), 0).x
    const pU = texture3D(pressTexA, uvw.add(vec3(0, TEXEL_Y, 0)), 0).x
    const pD = texture3D(pressTexA, uvw.sub(vec3(0, TEXEL_Y, 0)), 0).x
    const pF = texture3D(pressTexA, uvw.add(vec3(0, 0, TEXEL_Z)), 0).x
    const pB = texture3D(pressTexA, uvw.sub(vec3(0, 0, TEXEL_Z)), 0).x

    const gradient = vec3(pR.sub(pL), pU.sub(pD), pF.sub(pB)).mul(0.5)

    const vel = texture3D(velTexB, uvw, 0).xyz.sub(gradient)

    textureStore(velTexA, coord, vec4(vel, 0)).toWriteOnly()
  })().compute(CELL_COUNT)

  // 5) Advect density (r) / temperature (g) / age (b).
  //    read: dyeTexNode, velTexA -> write: dyeTexWriteNode
  const advectDye = Fn(() => {
    const coord = getVoxelCoord(instanceIndex)
    const uvw = coordToUVW(coord)

    const vel = texture3D(velTexA, uvw, 0).xyz
    const velUVW = vel.div(u.uVolumeWorldSize)
    const prevPos = uvw.sub(velUVW.mul(u.uDt))

    const dye = dyeTexNode.sample(prevPos).level(float(0))

    const density = dye.r.mul(max(float(1).sub(u.uDissipation.mul(u.uDt)), 0)).toVar()
    const temperature = dye.g.mul(max(float(1).sub(u.uCooling.mul(u.uDt)), 0)).toVar()

    // Nearest-neighbor lookup for age to prevent numerical diffusion
    const gridDims = vec3(GRID_SIZE_X, GRID_SIZE_Y, GRID_SIZE_Z)
    const nearestUVW = prevPos.mul(gridDims).floor().add(0.5).div(gridDims)
    const age = dyeTexNode.sample(nearestUVW).level(float(0)).b.add(u.uDt).toVar()

    temperature.assign(temperature.clamp(0, 12))

    If(density.lessThanEqual(0.01), () => {
      age.assign(0.0)
    })

    textureStore(dyeTexWriteNode, coord, vec4(density, temperature, age, 1.0)).toWriteOnly()
  })().compute(CELL_COUNT)

  // 6) Emit density/temperature from the teapot's vertices. write: dyeTexWriteNode
  const emitTeapot = Fn(() => {
    const vertexPos = teapotVerts.element(instanceIndex)
    const worldPos = u.uTeapotMatrix.mul(vec4(vertexPos, 1.0)).xyz

    // Map world position to volume box UVW space [0..1]
    const uvw = worldPos
      .sub(vec3(0, VOLUME_WORLD_SIZE_Y / 2, 0))
      .div(u.uVolumeWorldSize)
      .add(0.5)

    If(
      uvw.x
        .greaterThanEqual(0)
        .and(uvw.x.lessThanEqual(1))
        .and(uvw.y.greaterThanEqual(0))
        .and(uvw.y.lessThanEqual(1))
        .and(uvw.z.greaterThanEqual(0))
        .and(uvw.z.lessThanEqual(1)),
      () => {
        const coord = uvec3(uvw.mul(vec3(GRID_SIZE_X, GRID_SIZE_Y, GRID_SIZE_Z)))

        // Flicker / animated noise based on the local vertex position
        const flicker = mx_noise_float(
          vertexPos.mul(9.0).add(vec3(0.0, u.uTime.negate().mul(2.5), u.uTime.mul(0.7))),
        )
          .mul(0.5)
          .add(0.5)

        // Baseline emission is on only while the temperature rate is positive
        const baseEmission = u.uEmitTemperature.greaterThan(0.0).select(float(1.0), float(0.0))

        // Movement-based boost scales with the teapot's drag speed
        const movementEmission = u.uTeapotSpeed.mul(MOTION_BOOST)
        const emissionFactor = baseEmission.add(movementEmission)

        const densityVal = u.uEmitDensity
          .mul(float(1 / 120))
          .mul(flicker.mul(0.85).add(0.15))
          .mul(emissionFactor)

        If(densityVal.greaterThan(0.0), () => {
          const tempVal = u.uEmitTemperature
            .mul(float(1 / 120))
            .mul(flicker.mul(0.85).add(0.15))
            .mul(emissionFactor)

          // Read current dye and add emission
          const currentDye = dyeTexNode.sample(uvw).level(float(0))
          const newDensity = currentDye.r.add(densityVal)
          const newTemp = currentDye.g.add(tempVal).clamp(0.0, 12.0)

          const currentAge = currentDye.b
          const newAge = mix(currentAge, float(0.0), densityVal.div(max(newDensity, 0.001)))

          textureStore(dyeTexWriteNode, coord, vec4(newDensity, newTemp, newAge, 1.0)).toWriteOnly()
        })
      },
    )
  })().compute(vertexCount)

  return {
    computeCurlNoise,
    advectVelocity,
    divergence,
    jacobiAB,
    jacobiBA,
    project,
    advectDye,
    emitTeapot,
  }
}
