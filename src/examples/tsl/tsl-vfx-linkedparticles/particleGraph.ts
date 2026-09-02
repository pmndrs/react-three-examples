// The whole GPU side of tsl-vfx-linkedparticles: two compute kernels over a pair of
// vec4 storage buffers, plus the material nodes that draw the result. Nothing here
// touches React — the component in LinkedParticles.tsx owns the buffers and the
// dispatch cadence.
import {
  atan,
  color,
  cos,
  deltaTime,
  float,
  Fn,
  hash,
  hue,
  If,
  instanceIndex,
  Loop,
  max,
  min,
  mix,
  mx_fractal_noise_float,
  mx_fractal_noise_vec3,
  PI,
  pcurve,
  sin,
  step,
  time,
  TWO_PI,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { Vector3, type Node, type StorageBufferNode } from 'three/webgpu';

export const PARTICLE_COUNT = 2 ** 13;
/** Fixed dispatch width of the spawn kernel; the live rate gates it — see below. */
export const MAX_SPAWN_PER_FRAME = 100;
/** Two link quads per particle, four vertices each. */
export const LINK_VERTEX_COUNT = PARTICLE_COUNT * 8;
/** World size of one particle quad, folded into `scaleNode` so the leva "size"
 *  slider keeps the original's 0.01–3 range. */
const PARTICLE_QUAD_SIZE = 0.05;

/** Index buffer for the link quads. Fixed for the life of the buffer: the compute
 *  kernel only ever rewrites the vertices those indices point at. */
export function createLinkIndices() {
  const indices = new Uint32Array(PARTICLE_COUNT * 12);
  let write = 0;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    for (let quad = 0; quad < 2; quad++) {
      const o = i * 8 + quad * 4;
      indices.set([o, o + 1, o + 2, o, o + 2, o + 3], write);
      write += 6;
    }
  }
  return indices;
}

export interface ParticleControls {
  timeScale: Node<'float'>;
  particleLifetime: Node<'float'>;
  particleSize: Node<'float'>;
  linksWidth: Node<'float'>;
  colorVariance: Node<'float'>;
  spawnRate: Node<'float'>;
  turbFrequency: Node<'float'>;
  turbAmplitude: Node<'float'>;
  turbOctaves: Node<'float'>;
  turbLacunarity: Node<'float'>;
  turbGain: Node<'float'>;
  turbFriction: Node<'float'>;
}

export interface ParticleBuffers {
  /** xyz = position, w = life (w < 0 means dead). */
  positions: StorageBufferNode<'vec4'>;
  velocities: StorageBufferNode<'vec4'>;
  linkPositions: StorageBufferNode<'vec4'>;
  /** xyz = link color, w = link opacity. */
  linkColors: StorageBufferNode<'vec4'>;
}

export function createParticleGraph(buffers: ParticleBuffers, u: ParticleControls) {
  const { positions, velocities, linkPositions, linkColors } = buffers;

  // Driven only by the frame loop, so these stay plain `uniform()` nodes: a
  // `useUniforms` input is re-synced whenever React re-renders, which would stamp on
  // values the animation owns (a leva drag would snap the hue back to 0).
  const colorOffset = uniform(0);
  const spawnIndex = uniform(0);
  const spawnPosition = uniform(new Vector3());
  const previousSpawnPosition = uniform(new Vector3());

  // Per-particle hue: a rotating global offset plus fractal noise over the index, so
  // neighbours in the spawn order land near each other on the colour wheel.
  const instanceColor = Fn(([i]) =>
    hue(color(0x0000ff), colorOffset.add(mx_fractal_noise_float(i.mul(0.1), 2, 2.0, 0.5, u.colorVariance))),
  );

  //* Compute kernels ==============================================

  const computeInit = Fn(() => {
    positions.element(instanceIndex).xyz.assign(vec3(10000));
    positions.element(instanceIndex).w.assign(-1);
  })().compute(PARTICLE_COUNT);

  const computeUpdate = Fn(() => {
    const position = positions.element(instanceIndex).xyz;
    const life = positions.element(instanceIndex).w;
    const velocity = velocities.element(instanceIndex).xyz;
    const dt = deltaTime.mul(0.1).mul(u.timeScale);

    If(life.greaterThan(0.0), () => {
      // Velocity comes from a turbulence field, scaled by the remaining lifetime so a
      // particle slows down as it fades.
      const localVel = mx_fractal_noise_vec3(
        position.mul(u.turbFrequency),
        u.turbOctaves,
        u.turbLacunarity,
        u.turbGain,
        u.turbAmplitude,
      ).mul(life.add(0.01));
      velocity.addAssign(localVel);
      velocity.mulAssign(u.turbFriction.oneMinus());
      position.addAssign(velocity.mul(dt));

      life.subAssign(dt.mul(u.particleLifetime.reciprocal()));

      // Brute-force nearest-two search: every particle scans every other one. This is
      // the expensive half of the demo and the reason the count stays at 8k.
      const closestDist1 = float(10000).toVar();
      const closestPos1 = vec3(0).toVar();
      const closestLife1 = float(0).toVar();
      const closestDist2 = float(10000).toVar();
      const closestPos2 = vec3(0).toVar();
      const closestLife2 = float(0).toVar();

      Loop(PARTICLE_COUNT, ({ i }) => {
        const other = positions.element(i);

        If(i.notEqual(instanceIndex).and(other.w.greaterThan(0.0)), () => {
          const otherPosition = other.xyz;
          const dist = position.sub(otherPosition).lengthSq();
          const moreThanZero = dist.greaterThan(0.0);

          If(dist.lessThan(closestDist1).and(moreThanZero), () => {
            closestDist1.assign(dist);
            closestPos1.assign(otherPosition);
            closestLife1.assign(other.w);
          }).ElseIf(dist.lessThan(closestDist2).and(moreThanZero), () => {
            closestDist2.assign(dist);
            closestPos2.assign(otherPosition);
            closestLife2.assign(other.w);
          });
        });
      });

      // Each particle owns eight link vertices: one flat quad to each neighbour,
      // widened along world Y (not billboarded — they thin out when seen edge-on).
      // `writeLink` is plain JS, so it unrolls at graph build; the original writes
      // the same sixteen lines out twice.
      const firstLink = instanceIndex.mul(8);
      const secondLink = firstLink.add(4);

      const writeLink = (base: Node<'uint'>, target: Node<'vec3'>) => {
        linkPositions.element(base).xyz.assign(position);
        linkPositions.element(base).y.addAssign(u.linksWidth);
        linkPositions.element(base.add(1)).xyz.assign(position);
        linkPositions.element(base.add(1)).y.addAssign(u.linksWidth.negate());
        linkPositions.element(base.add(2)).xyz.assign(target);
        linkPositions.element(base.add(2)).y.addAssign(u.linksWidth.negate());
        linkPositions.element(base.add(3)).xyz.assign(target);
        linkPositions.element(base.add(3)).y.addAssign(u.linksWidth);
      };
      writeLink(firstLink, closestPos1);
      writeLink(secondLink, closestPos2);

      // Colour is uniform across both quads; the w component carries the link's
      // opacity — the shorter of the two lifetimes, curved slightly.
      const linkColor = instanceColor(instanceIndex.toFloat());
      const l1 = max(0.0, min(closestLife1, life)).pow(0.8);
      const l2 = max(0.0, min(closestLife2, life)).pow(0.8);

      // `type: 'uint'` so the counter matches the uint link indices (a bare
      // `Loop(4, …)` counts in ints and won't add to them in typed TSL).
      Loop({ start: 0, end: 4, type: 'uint' }, ({ i }) => {
        linkColors.element(firstLink.add(i)).xyz.assign(linkColor);
        linkColors.element(firstLink.add(i)).w.assign(l1);
        linkColors.element(secondLink.add(i)).xyz.assign(linkColor);
        linkColors.element(secondLink.add(i)).w.assign(l2);
      });
    });
  })().compute(PARTICLE_COUNT);

  const computeSpawn = Fn(() => {
    // A compute node's thread count is baked in at build, so the spawn-rate slider
    // cannot move it. Dispatch the maximum and gate the body on the live uniform —
    // upstream leaves the dispatch at its initial 5 and only advances the CPU-side
    // index, which makes its "Spawn rate" slider thin the emitter out instead.
    If(instanceIndex.toFloat().lessThan(u.spawnRate), () => {
      const particleIndex = spawnIndex.add(instanceIndex).mod(PARTICLE_COUNT).toInt();
      const position = positions.element(particleIndex).xyz;
      const life = positions.element(particleIndex).w;
      const velocity = velocities.element(particleIndex).xyz;

      life.assign(1.0);

      // Random direction on a sphere, seeded off the slot index.
      const rTheta = hash(particleIndex).mul(TWO_PI);
      const rPhi = hash(particleIndex.add(1)).mul(PI);
      const rDir = vec3(sin(rTheta).mul(cos(rPhi)), sin(rTheta).mul(sin(rPhi)), cos(rTheta));

      // Spread this frame's batch along the segment the cursor travelled, so a fast
      // sweep draws a line of particles rather than a clump.
      const pos = mix(previousSpawnPosition, spawnPosition, instanceIndex.toFloat().div(u.spawnRate.sub(1)).clamp());
      position.assign(pos.add(rDir.mul(0.01)));
      velocity.assign(rDir.mul(5.0));
    });
  })().compute(MAX_SPAWN_PER_FRAME);

  //* Material nodes ===============================================

  const life = positions.toAttribute().w;

  // Life fades the sprite out; an index-seeded sine makes each particle flare on its
  // own beat, and `pcurve` sharpens both into spikes rather than ramps.
  const spriteColorNode = Fn(() => {
    const modLife = pcurve(life.oneMinus(), 8.0, 1.0);
    const pulse = pcurve(
      sin(hash(instanceIndex).mul(TWO_PI).add(time.mul(0.5).mul(TWO_PI)))
        .mul(0.5)
        .add(0.5),
      0.25,
      0.25,
    )
      .mul(10.0)
      .add(1.0);

    return instanceColor(instanceIndex.toFloat()).mul(pulse.mul(modLife));
  })();

  return {
    computeInit,
    computeUpdate,
    computeSpawn,
    colorOffset,
    spawnIndex,
    spawnPosition,
    previousSpawnPosition,
    spritePositionNode: positions.toAttribute(),
    spriteScaleNode: vec2(u.particleSize.mul(PARTICLE_QUAD_SIZE)),
    spriteRotationNode: atan(velocities.toAttribute().y, velocities.toAttribute().x),
    spriteColorNode,
    // Round the quad off and fade it with the particle's life.
    spriteOpacityNode: step(uv().xy.sub(0.5).length(), 0.5).mul(life),
    linkOpacityNode: linkColors.toAttribute().w,
  };
}
