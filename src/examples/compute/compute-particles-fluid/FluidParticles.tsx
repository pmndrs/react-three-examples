// The MLS-MPM fluid: a struct particle buffer, an atomic fixed-point grid, the five
// compute kernels that move energy particles -> grid -> particles, the GPU-written
// indirect dispatch sizes, and the pointer force rig. Uses fiber hooks
// (`useControls`/`useBuffers`/`useNodes`/`useLoader`/`useFrame`/`useThree`), so it
// lives inside <Canvas>, not in the page shell.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  array,
  atomicAdd,
  atomicLoad,
  atomicStore,
  clamp,
  cross,
  float,
  Fn,
  If,
  instancedArray,
  instanceIndex,
  int,
  ivec3,
  Loop,
  mat3,
  max,
  positionLocal,
  pow,
  Return,
  step,
  storage,
  struct,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import {
  EquirectangularReflectionMapping,
  IcosahedronGeometry,
  IndirectStorageBufferAttribute,
  MathUtils,
  Vector3,
  type Node,
  type StorageBufferNode,
} from 'three/webgpu';
import { useBuffers, useFrame, useLoader, useNodes, useThree, type ThreeEvent } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/royal_esplanade_2k.hdr.jpg';

// Original values throughout.
const MAX_PARTICLES = 8192 * 16;
const DEFAULT_PARTICLE_COUNT = 8192 * 4;
const GRID_SIZE = 64;
const CELL_COUNT = GRID_SIZE * GRID_SIZE * GRID_SIZE;
const WORKGROUP_SIZE = 64;
// WebGPU only has INTEGER atomics, so the grid accumulates floats scaled by this.
const FIXED_POINT_MULTIPLIER = 1e7;
// position<vec3> + velocity<vec3> + C<mat3> = 20 floats once WebGPU alignment rounds
// each vec3 up to 4 and the mat3 up to 12.
const PARTICLE_STRIDE = 20;

// Material parameters. The original holds these in uniforms but its GUI exposes only
// particleCount — it has a commented-out restDensity slider with a note that moving
// it destabilises the sim, so they stay constants here.
const STIFFNESS = 50;
const REST_DENSITY = 1.5;
const DYNAMIC_VISCOSITY = 0.1;
const GRAVITY = -(9.81 * 9.81);

export function FluidParticles() {
  //* Controls =====================================================
  // The one knob the original's Inspector panel carries.
  const { particleCount } = useControls('compute-particles-fluid', {
    particleCount: { value: DEFAULT_PARTICLE_COUNT, min: 4096, max: MAX_PARTICLES, step: 4096 },
  });

  const scene = useThree((state) => state.scene);
  const renderer = useThree((state) => state.renderer);

  //* GPU State ====================================================
  const { particleBuffer, cellBuffer, cellVelocity, p2g1Dispatch, p2g2Dispatch, g2pDispatch } = useBuffers(() => {
    // Cast: instancedArray's typed overloads stop at vec4 — struct layouts exist at
    // runtime (Arrays.js hands the layout straight to StorageBufferNode, and
    // `storage()`'s own typing names the case StorageBufferNode<'struct'>) but the
    // instancedArray overload is missing (typed-TSL inference family, AGENTS.md B10).
    const structArray = instancedArray as unknown as (
      countOrValues: number | Float32Array,
      structType: ReturnType<typeof struct>,
    ) => StorageBufferNode<'struct'>;

    const initialDispatch = () =>
      new IndirectStorageBufferAttribute(
        new Uint32Array([Math.ceil(DEFAULT_PARTICLE_COUNT / WORKGROUP_SIZE), 1, 1]),
        1,
      );

    // Particles start scattered through the middle 80% of the unit cube.
    const particleArray = new Float32Array(MAX_PARTICLES * PARTICLE_STRIDE);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      particleArray[i * PARTICLE_STRIDE + 0] = Math.random() * 0.8 + 0.1;
      particleArray[i * PARTICLE_STRIDE + 1] = Math.random() * 0.8 + 0.1;
      particleArray[i * PARTICLE_STRIDE + 2] = Math.random() * 0.8 + 0.1;
    }

    return {
      particleBuffer: structArray(
        particleArray,
        struct({ position: { type: 'vec3' }, velocity: { type: 'vec3' }, C: { type: 'mat3' } }),
      ),
      // Momentum + mass per grid cell, as ATOMIC ints — every particle in a cell's
      // 3x3x3 neighbourhood adds into it from a different thread.
      cellBuffer: structArray(
        CELL_COUNT,
        struct({
          x: { type: 'int', atomic: true },
          y: { type: 'int', atomic: true },
          z: { type: 'int', atomic: true },
          mass: { type: 'int', atomic: true },
        }),
      ),
      // The same grid decoded back to floats: vec4(velocity, mass).
      cellVelocity: instancedArray(CELL_COUNT, 'vec4'),
      // Indirect dispatch sizes. workgroupKernel WRITES these on the GPU, so changing
      // particleCount costs one uniform write and no CPU-side dispatch math. They live
      // in the buffer STORE rather than a lazy useState because both the node graph
      // and the frame loop have to see the same instance: StrictMode re-runs a
      // useState initializer, and the create-once node graph would then be holding the
      // discarded first pair while useFrame dispatched from the second — an
      // `IndirectStorageBufferAttribute` with no GPU buffer behind it.
      p2g1Dispatch: initialDispatch(),
      p2g2Dispatch: initialDispatch(),
      g2pDispatch: initialDispatch(),
    };
  }, 'fluid');

  //* Compute Graph =================================================
  const {
    workgroupKernel,
    clearGridKernel,
    p2g1Kernel,
    p2g2Kernel,
    updateGridKernel,
    g2pKernel,
    uParticleCount,
    uDelta,
    uMouseRayOrigin,
    uMouseRayDirection,
    uMouseForce,
    particlePositionNode,
  } = useNodes(() => {
    // Imperatively-driven uniforms, so plain TSL `uniform()` rather than
    // `useUniforms`: they are written from useFrame and pointer handlers, and a React
    // re-render must never write them back. particleCount is uint, which useUniforms
    // cannot express for a JS number anyway.
    const uParticleCount = uniform(DEFAULT_PARTICLE_COUNT, 'uint');
    const uDelta = uniform(1 / 60);
    const uMouseRayOrigin = uniform(new Vector3());
    const uMouseRayDirection = uniform(new Vector3());
    const uMouseForce = uniform(new Vector3());

    // Fixed-point codec for the atomic grid. Cast: struct member access types as a bare
    // `Node`, which has no fluent surface (typed-TSL gap, AGENTS.md B10/B11 cast family).
    const encodeFixedPoint = (value: Node<'float'>) => int(value.mul(FIXED_POINT_MULTIPLIER));
    const readCell = (field: Node) => float(atomicLoad(field as Node<'int'>)).div(FIXED_POINT_MULTIPLIER);

    // Cast: @types/three's Loop overloads stop at two ranges and both are handed to
    // the callback as `{ i, j }`. The runtime takes any number of ranges and names
    // them i, j, k… — and naming matters: three nested single-range Loops would each
    // generate a `k`-less `i` and the inner would shadow the outer (the original
    // passes explicit `name: 'gx'`, a LoopNode field the typings mark TODO). B10 family.
    const Loop3 = Loop as unknown as (
      x: { start: number; end: number; type: 'int'; condition: string },
      y: { start: number; end: number; type: 'int'; condition: string },
      z: { start: number; end: number; type: 'int'; condition: string },
      body: (inputs: { i: Node<'int'>; j: Node<'int'>; k: Node<'int'> }) => void,
    ) => void;
    const axis = { start: 0, end: 3, type: 'int' as const, condition: '<' };

    // Quadratic B-spline weights for the 3x3x3 cells around a particle, shared by all
    // three transfer kernels.
    // The const is load-bearing — the weights are indexed from two separate Loops in
    // p2g2, so they have to exist as one function-scope variable. Cast: `.toConst()`
    // returns a VarNode, which drops the ArrayNode interface `.element` lives on, and
    // @types/three exports no ArrayNode to name (B10 family).
    const splineWeights = (cellDiff: Node<'vec3'>) =>
      array([
        float(0.5).mul(float(0.5).sub(cellDiff)).mul(float(0.5).sub(cellDiff)),
        float(0.75).sub(cellDiff.mul(cellDiff)),
        float(0.5).mul(float(0.5).add(cellDiff)).mul(float(0.5).add(cellDiff)),
      ]).toConst() as unknown as { element: (index: Node<'int'>) => Node<'vec3'> };

    // Row-major flattening of an ivec3 cell coordinate.
    const cellPointer = (cell: Node<'ivec3'>) =>
      cell.x
        .mul(int(GRID_SIZE * GRID_SIZE))
        .add(cell.y.mul(int(GRID_SIZE)))
        .add(cell.z)
        .toConst();

    // (0) Dispatch sizes for the three per-particle kernels, computed ON the GPU from
    // the count uniform and written straight into the indirect buffers they dispatch
    // from — the CPU never sees a workgroup count.
    const workgroupKernel = Fn(() => {
      const workgroups = uParticleCount.sub(1).div(WORKGROUP_SIZE).add(1);
      storage(p2g1Dispatch, 'uint', 3).element(0).assign(workgroups);
      storage(p2g2Dispatch, 'uint', 3).element(0).assign(workgroups);
      storage(g2pDispatch, 'uint', 3).element(0).assign(workgroups);
    })().compute(1);

    // (1) Wipe the accumulation grid before every step.
    const clearGridKernel = Fn(() => {
      const cell = cellBuffer.element(instanceIndex);
      atomicStore(cell.get('x'), 0);
      atomicStore(cell.get('y'), 0);
      atomicStore(cell.get('z'), 0);
      atomicStore(cell.get('mass'), 0);
    })().compute(CELL_COUNT);

    // (2) Particle -> grid, pass one: scatter mass and affine-corrected momentum.
    const p2g1Kernel = Fn(() => {
      const element = particleBuffer.element(instanceIndex);
      // Casts: struct member access types as a bare `Node`, which has no fluent vec
      // surface (typed-TSL gap, AGENTS.md B10/B11 cast family).
      const particlePosition = (element.get('position') as Node<'vec3'>).toConst();
      const particleVelocity = (element.get('velocity') as unknown as Node<'vec3'>).toConst();
      const affineMomentum = (element.get('C') as Node<'mat3'>).toConst();

      const gridPosition = particlePosition.mul(GRID_SIZE).toVar();
      const cellIndex = ivec3(gridPosition).sub(1).toConst();
      const cellDiff = gridPosition.fract().sub(0.5).toConst();
      const weights = splineWeights(cellDiff);

      Loop3(axis, axis, axis, ({ i: gx, j: gy, k: gz }) => {
        const weight = weights.element(gx).x.mul(weights.element(gy).y).mul(weights.element(gz).z);
        const cell = cellIndex.add(ivec3(gx, gy, gz)).toConst();
        const cellDist = vec3(cell).add(0.5).sub(gridPosition).toConst();
        // Particle mass is 1, so the weight IS the mass contribution.
        const velocityContribution = weight.mul(particleVelocity.add(affineMomentum.mul(cellDist))).toConst();

        const target = cellBuffer.element(cellPointer(cell));
        atomicAdd(target.get('x'), encodeFixedPoint(velocityContribution.x));
        atomicAdd(target.get('y'), encodeFixedPoint(velocityContribution.y));
        atomicAdd(target.get('z'), encodeFixedPoint(velocityContribution.z));
        atomicAdd(target.get('mass'), encodeFixedPoint(weight));
      });
    })().compute(DEFAULT_PARTICLE_COUNT, [WORKGROUP_SIZE, 1, 1]);

    // (3) Particle -> grid, pass two: gather the density the first pass built, turn it
    // into a pressure + viscosity stress tensor, scatter that back as momentum.
    const p2g2Kernel = Fn(() => {
      const element = particleBuffer.element(instanceIndex);
      const particlePosition = (element.get('position') as unknown as Node<'vec3'>).toConst();
      const gridPosition = particlePosition.mul(GRID_SIZE).toVar();
      const cellIndex = ivec3(gridPosition).sub(1).toConst();
      const cellDiff = gridPosition.fract().sub(0.5).toConst();
      const weights = splineWeights(cellDiff);

      const density = float(0).toVar();
      Loop3(axis, axis, axis, ({ i: gx, j: gy, k: gz }) => {
        const weight = weights.element(gx).x.mul(weights.element(gy).y).mul(weights.element(gz).z);
        const cell = cellIndex.add(ivec3(gx, gy, gz)).toConst();
        const mass = readCell(cellBuffer.element(cellPointer(cell)).get('mass'));
        density.addAssign(mass.mul(weight));
      });

      const volume = float(1).div(density);
      const pressure = max(0, pow(density.div(REST_DENSITY), 5).sub(1).mul(STIFFNESS)).toConst();
      const stress = mat3(pressure.negate(), 0, 0, 0, pressure.negate(), 0, 0, 0, pressure.negate()).toVar();
      const dudv = (element.get('C') as Node<'mat3'>).toConst();
      const strain = dudv.add(dudv.transpose());
      stress.addAssign(strain.mul(DYNAMIC_VISCOSITY));
      const eq16Term0 = volume.mul(-4).mul(stress).mul(uDelta);

      Loop3(axis, axis, axis, ({ i: gx, j: gy, k: gz }) => {
        const weight = weights.element(gx).x.mul(weights.element(gy).y).mul(weights.element(gz).z);
        const cell = cellIndex.add(ivec3(gx, gy, gz)).toConst();
        const cellDist = vec3(cell).add(0.5).sub(gridPosition).toConst();
        const momentum = eq16Term0.mul(weight).mul(cellDist).toConst();

        const target = cellBuffer.element(cellPointer(cell));
        atomicAdd(target.get('x'), encodeFixedPoint(momentum.x));
        atomicAdd(target.get('y'), encodeFixedPoint(momentum.y));
        atomicAdd(target.get('z'), encodeFixedPoint(momentum.z));
      });
    })().compute(DEFAULT_PARTICLE_COUNT, [WORKGROUP_SIZE, 1, 1]);

    // (4) Grid update: momentum / mass back to a velocity, with a no-slip wall on the
    // outermost cell of every axis.
    const updateGridKernel = Fn(() => {
      const cell = cellBuffer.element(instanceIndex);
      const mass = readCell(cell.get('mass')).toConst();
      If(mass.lessThanEqual(0), () => {
        Return();
      });

      const vx = readCell(cell.get('x')).div(mass).toVar();
      const vy = readCell(cell.get('y')).div(mass).toVar();
      const vz = readCell(cell.get('z')).div(mass).toVar();

      const x = int(instanceIndex).div(int(GRID_SIZE * GRID_SIZE));
      const y = int(instanceIndex).div(int(GRID_SIZE)).mod(int(GRID_SIZE));
      const z = int(instanceIndex).mod(int(GRID_SIZE));
      If(x.lessThan(int(1)).or(x.greaterThan(int(GRID_SIZE - 2))), () => {
        vx.assign(0);
      });
      If(y.lessThan(int(1)).or(y.greaterThan(int(GRID_SIZE - 2))), () => {
        vy.assign(0);
      });
      If(z.lessThan(int(1)).or(z.greaterThan(int(GRID_SIZE - 2))), () => {
        vz.assign(0);
      });

      cellVelocity.element(instanceIndex).assign(vec4(vx, vy, vz, mass));
    })().compute(CELL_COUNT);

    // Push a position back inside a rounded box — the invisible container the fluid
    // sloshes around in.
    const clampToRoundedBox = (position: Node<'vec3'>, box: Node<'vec3'>, radius: Node<'float'>) => {
      const result = position.sub(0.5).toVar();
      const outside = step(box, result.abs()).mul(result.add(box.negate().mul(result.sign())));
      const distance = outside.length().sub(radius);
      If(distance.greaterThan(0), () => {
        result.subAssign(outside.normalize().mul(distance).mul(1.3));
      });
      result.addAssign(0.5);
      return result;
    };

    // (5) Grid -> particle: gather velocity and the affine matrix C back, then
    // integrate gravity, the pointer force and the container.
    const g2pKernel = Fn(() => {
      const element = particleBuffer.element(instanceIndex);
      const particlePosition = (element.get('position') as unknown as Node<'vec3'>).toVar();
      const gridPosition = particlePosition.mul(GRID_SIZE).toVar();
      const particleVelocity = vec3(0).toVar();

      const cellIndex = ivec3(gridPosition).sub(1).toConst();
      const cellDiff = gridPosition.fract().sub(0.5).toConst();
      const weights = splineWeights(cellDiff);

      // A zero matrix. Typed TSL has no single-scalar mat3 overload — the original's
      // `mat3( 0 )` routes through `new Matrix3( 0 )`, which leaves eight of the nine
      // elements undefined — so spell the zeros out rather than cast.
      const B = mat3(0, 0, 0, 0, 0, 0, 0, 0, 0).toVar();
      Loop3(axis, axis, axis, ({ i: gx, j: gy, k: gz }) => {
        const weight = weights.element(gx).x.mul(weights.element(gy).y).mul(weights.element(gz).z);
        const cell = cellIndex.add(ivec3(gx, gy, gz)).toConst();
        const cellDist = vec3(cell).add(0.5).sub(gridPosition).toConst();
        const weightedVelocity = cellVelocity.element(cellPointer(cell)).xyz.mul(weight).toConst();

        B.addAssign(
          mat3(weightedVelocity.mul(cellDist.x), weightedVelocity.mul(cellDist.y), weightedVelocity.mul(cellDist.z)),
        );
        particleVelocity.addAssign(weightedVelocity);
      });

      (element.get('C') as Node<'mat3'>).assign(B.mul(4));

      particleVelocity.addAssign(vec3(0, GRAVITY, 0).mul(uDelta));
      // Grid units -> unit cube, so the rest of this runs in the particle's own space.
      particleVelocity.divAssign(GRID_SIZE);

      // Pointer force, falling off with distance from the picking RAY rather than from
      // a point — the whole line through the scene pushes.
      const distanceToRay = cross(uMouseRayDirection, particlePosition.sub(uMouseRayOrigin)).length();
      particleVelocity.addAssign(uMouseForce.mul(distanceToRay.mul(3).oneMinus().max(0).pow(2)));

      particlePosition.addAssign(particleVelocity.mul(uDelta));
      // Never reach the outermost grid cells — those are the no-slip wall above.
      particlePosition.assign(clamp(particlePosition, vec3(1 / GRID_SIZE), vec3((GRID_SIZE - 1) / GRID_SIZE)));

      // Steer back toward the rounded container by looking two steps ahead.
      const innerBox = vec3((GRID_SIZE * 0.5 - 9) / GRID_SIZE).toVar();
      const innerRadius = float(6 / GRID_SIZE);
      const positionNext = particlePosition.add(particleVelocity.mul(uDelta).mul(2)).toConst();
      particleVelocity.addAssign(clampToRoundedBox(positionNext, innerBox, innerRadius).sub(positionNext));

      particleVelocity.mulAssign(GRID_SIZE);

      (element.get('position') as unknown as Node<'vec3'>).assign(particlePosition);
      (element.get('velocity') as Node<'vec3'>).assign(particleVelocity);
    })().compute(DEFAULT_PARTICLE_COUNT, [WORKGROUP_SIZE, 1, 1]);

    return {
      workgroupKernel,
      clearGridKernel,
      p2g1Kernel,
      p2g2Kernel,
      updateGridKernel,
      g2pKernel,
      uParticleCount,
      uDelta,
      uMouseRayOrigin,
      uMouseRayDirection,
      uMouseForce,
      // One icosahedron per particle, offset by its simulated position.
      particlePositionNode: Fn(() =>
        positionLocal.add(particleBuffer.element(instanceIndex).get('position') as unknown as Node<'vec3'>),
      )(),
    };
  }, 'fluid');

  // SUSPENDS — after every creator hook above (AGENTS.md B18) and before the mesh
  // renders: the particle material carries a custom positionNode, so its first shader
  // build must already see scene.environment (three 0.185.1 IBL race, B15).
  const hdrTexture = useLoader(UltraHDRLoader, HDR_URL);

  useLayoutEffect(() => {
    hdrTexture.mapping = EquirectangularReflectionMapping;
    scene.background = hdrTexture;
    scene.backgroundBlurriness = 0.5;
    scene.environment = hdrTexture;
    return () => {
      scene.background = null;
      scene.backgroundBlurriness = 0;
      scene.environment = null;
    };
  }, [scene, hdrTexture]);

  // The GPU reads its own dispatch sizes from uParticleCount, so this one write is all
  // a count change needs. (The original also re-assigns `kernel.count`, which the
  // renderer ignores entirely once a dispatch is indirect.)
  useEffect(() => {
    uParticleCount.value = particleCount;
  }, [particleCount, uParticleCount]);

  // mergeVertices keeps the vertex-shader cost down — every one of these runs the
  // storage-buffer read above.
  const particleGeometry = useMemo(() => mergeVertices(new IcosahedronGeometry(0.008, 1).deleteAttribute('uv')), []);

  //* Pointer ======================================================
  // The pointer's plane intersection, in the simulation's unit-cube space. Refs, not
  // uniforms: the FORCE is the frame-to-frame delta, so the previous value has to
  // survive a render without becoming shader state.
  const pointerRef = useRef({ current: new Vector3(), previous: new Vector3() });

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    // Simulation space is the unit cube; the mesh is drawn at (-0.5, 0, -0.5).
    uMouseRayOrigin.value.set(event.ray.origin.x + 0.5, event.ray.origin.y, event.ray.origin.z + 0.5);
    uMouseRayDirection.value.copy(event.ray.direction);
    pointerRef.current.current.set(event.point.x + 0.5, event.point.y, event.point.z + 0.5);
  };

  //* Frame ========================================================
  // EVERY FRAME, before the default render phase draws: five kernels, in order, with
  // the p2g/g2p passes dispatched indirectly. Compute is not a render takeover, so
  // this is phase 'update'.
  useFrame(
    ({ delta }) => {
      // Don't advance the sim too far after the tab loses focus.
      uDelta.value = MathUtils.clamp(delta, 0.00001, 1 / 60);

      const pointer = pointerRef.current;
      uMouseForce.value.subVectors(pointer.current, pointer.previous).multiplyScalar(2);
      uMouseForce.value.clampLength(0, 0.3);
      pointer.previous.copy(pointer.current);

      renderer.compute(workgroupKernel);
      renderer.compute(clearGridKernel);
      renderer.compute(p2g1Kernel, p2g1Dispatch);
      renderer.compute(p2g2Kernel, p2g2Dispatch);
      renderer.compute(updateGridKernel);
      renderer.compute(g2pKernel, g2pDispatch);
    },
    { phase: 'update' },
  );

  return (
    <>
      {/* One mesh drawing `count` instances; positions live only on the GPU, so
          three's culling sphere knows nothing — frustumCulled must be off. */}
      <mesh geometry={particleGeometry} count={particleCount} position={[-0.5, 0, -0.5]} frustumCulled={false}>
        <meshStandardNodeMaterial color="#0066ff" positionNode={particlePositionNode} />
      </mesh>

      {/* Invisible pick plane: material-invisible (not mesh-invisible) so it still
          raycasts. R3F hands the handler the ray AND its intersection, which is
          exactly the pair the original raycasts for by hand. */}
      <mesh rotation-x={-Math.PI / 2} onPointerMove={onPointerMove}>
        <planeGeometry args={[20, 20]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </>
  );
}
