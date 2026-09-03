/**
 * rapier-vehicle-controller
 * A red box car on four wheels. WASD or the arrows drive and steer, Space brakes, R puts
 * it back at the start; the orbit follows the car wherever it goes.
 * Original: https://threejs.org/examples/#physics_rapier_vehicle_controller
 *
 * DEMONSTRATES
 * - Rapier's `DynamicRayCastVehicleController` around one dynamic `<RigidBody>`: the
 *   wheels are raycasts, not bodies, so the chassis box is the only body in the car
 * - Wheels as `<group>` children of the chassis mesh — the body moves the car, and each
 *   step reads suspension, steering and spin off the controller to pose the wheel locally
 * - `useBeforePhysicsStep` owns the whole drive: keys → engine force, steering lerp and
 *   brakes, then `updateVehicle(1/60)` — all frame-loop state in one mutable record
 * - drei `<KeyboardControls>` read with `get()` in the step; R resets the body through
 *   its API, never through React
 * - DemoHelpers' `controlsRef` re-targets the orbit at the car every frame; `debug` on
 *   `<Physics>` is the original's RapierHelper outline
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import { MathUtils, NoToneMapping, Quaternion, RepeatWrapping, Vector3, type Group } from 'three/webgpu';
import { Canvas, useFrame, useTexture } from '@react-three/fiber/webgpu';
import { KeyboardControls, useKeyboardControls } from '@react-three/drei/webgpu';
import {
  CuboidCollider,
  Physics,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierContext,
  type RapierRigidBody,
} from '@react-three/rapier';
import type CameraControlsImpl from 'camera-controls';
import { useControls } from 'leva';

import { DemoHelpers } from '../../utils/DemoHelpers';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/';

const KEYS = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
  { name: 'brake', keys: ['Space'] },
  { name: 'reset', keys: ['KeyR'] },
];
type Key = (typeof KEYS)[number]['name'];

//* Car ===========================================================

const WHEEL_RADIUS = 0.3;
const WHEEL_WIDTH = 0.4;
const SUSPENSION_REST = 0.8;
const STEER_ANGLE = Math.PI / 4;
// Front wheels (negative z) steer.
const WHEELS: [number, number, number][] = [
  [-1, 0, -1.5],
  [1, 0, -1.5],
  [-1, 0, 1.5],
  [1, 0, 1.5],
];

type VehicleController = ReturnType<RapierContext['world']['createVehicleController']>;

function Car({ controlsRef }: { controlsRef: React.RefObject<CameraControlsImpl | null> }) {
  const { world } = useRapier();
  const chassisRef = useRef<RapierRigidBody>(null);
  const wheelRefs = useRef<(Group | null)[]>([]);
  const vehicleRef = useRef<VehicleController>(null);
  const [, getKeys] = useKeyboardControls<Key>();

  // Engine and brake ramp up while a key is held — state the step owns.
  const [drive] = useState(() => ({ accelerate: 0, brake: 0 }));
  const [scratch] = useState(() => ({
    steer: new Quaternion(),
    spin: new Quaternion(),
    axle: new Vector3(),
    up: new Vector3(0, 1, 0),
  }));

  useEffect(() => {
    const chassis = chassisRef.current;
    if (!chassis) return;
    const vehicle = world.createVehicleController(chassis);
    WHEELS.forEach((position, i) => {
      vehicle.addWheel(
        { x: position[0], y: position[1], z: position[2] },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        SUSPENSION_REST,
        WHEEL_RADIUS,
      );
      vehicle.setWheelSuspensionStiffness(i, 24);
      vehicle.setWheelFrictionSlip(i, 1000);
    });
    vehicle.setWheelSteering(0, STEER_ANGLE);
    vehicle.setWheelSteering(1, STEER_ANGLE);
    vehicleRef.current = vehicle;
    return () => {
      world.removeVehicleController(vehicle);
      vehicleRef.current = null;
    };
  }, [world]);

  useBeforePhysicsStep(() => {
    const chassis = chassisRef.current;
    const vehicle = vehicleRef.current;
    if (!chassis || !vehicle) return;
    const keys = getKeys();

    if (keys.reset) {
      chassis.setTranslation({ x: 0, y: 1, z: 0 }, true);
      chassis.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
      chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
      drive.accelerate = 0;
      drive.brake = 0;
    } else {
      // Forward is negative z, so the engine force ramps NEGATIVE for W.
      if (keys.forward) drive.accelerate = Math.max(drive.accelerate - 1, -30);
      else if (keys.backward) drive.accelerate = Math.min(drive.accelerate + 1, 30);
      else {
        drive.accelerate = 0;
        if (chassis.isSleeping()) chassis.wakeUp();
      }
      drive.brake = keys.brake ? Math.min(drive.brake + 0.05, 1) : 0;

      vehicle.setWheelEngineForce(0, drive.accelerate);
      vehicle.setWheelEngineForce(1, drive.accelerate);

      const steerTo = STEER_ANGLE * (Number(keys.left) - Number(keys.right));
      const steering = MathUtils.lerp(vehicle.wheelSteering(0) ?? 0, steerTo, 0.25);
      vehicle.setWheelSteering(0, steering);
      vehicle.setWheelSteering(1, steering);

      for (let i = 0; i < WHEELS.length; i++) vehicle.setWheelBrake(i, drive.brake);
    }

    vehicle.updateVehicle(1 / 60);

    // Pose each wheel in chassis space from what the controller just computed.
    wheelRefs.current.forEach((wheel, i) => {
      if (!wheel) return;
      const axle = vehicle.wheelAxleCs(i);
      if (axle) scratch.axle.set(axle.x, axle.y, axle.z);
      wheel.position.y = (vehicle.wheelChassisConnectionPointCs(i)?.y ?? 0) - (vehicle.wheelSuspensionLength(i) ?? 0);
      scratch.steer.setFromAxisAngle(scratch.up, vehicle.wheelSteering(i) ?? 0);
      scratch.spin.setFromAxisAngle(scratch.axle, vehicle.wheelRotation(i) ?? 0);
      wheel.quaternion.multiplyQuaternions(scratch.steer, scratch.spin);
    });
  });

  // The orbit's target rides along with the car; the camera itself stays put.
  useFrame(() => {
    const chassis = chassisRef.current;
    if (!chassis) return;
    const { x, y, z } = chassis.translation();
    controlsRef.current?.setTarget(x, y, z, false);
  });

  return (
    // One explicit box: auto-colliders would also wrap each wheel mesh below, and the
    // wheels are raycasts, not colliders.
    <RigidBody ref={chassisRef} position={[0, 1, 0]} colliders={false} mass={10} restitution={0.8}>
      <CuboidCollider args={[1, 0.5, 2]} />
      <mesh castShadow>
        <boxGeometry args={[2, 1, 4]} />
        <meshStandardNodeMaterial color="#ff0000" />
        {WHEELS.map((position, i) => (
          <group key={i} ref={(group) => void (wheelRefs.current[i] = group)} position={position}>
            {/* The cylinder lies along y; roll it onto the axle once, here. */}
            <mesh rotation-z={Math.PI / 2} castShadow>
              <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 16]} />
              <meshStandardNodeMaterial color="#000000" />
            </mesh>
          </group>
        ))}
      </mesh>
    </RigidBody>
  );
}

//* Scene =========================================================

function Ground() {
  const grid = useTexture(`${ASSETS}textures/grid.png`, (texture) => {
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(80, 80);
  });

  return (
    <RigidBody type="fixed" colliders="cuboid">
      <mesh position={[0, -0.25, -20]} receiveShadow>
        <boxGeometry args={[100, 0.5, 100]} />
        <meshStandardNodeMaterial map={grid} />
      </mesh>
    </RigidBody>
  );
}

function World({ controlsRef }: { controlsRef: React.RefObject<CameraControlsImpl | null> }) {
  const { colliders } = useControls('Rapier', { colliders: true });

  return (
    <Physics debug={colliders}>
      <Ground />
      <Car controlsRef={controlsRef} />
    </Physics>
  );
}

export default function RapierVehicleController() {
  const controlsRef = useRef<CameraControlsImpl>(null);

  return (
    <KeyboardControls map={KEYS}>
      <Canvas
        renderer={{ toneMapping: NoToneMapping }}
        shadows
        background="#bfd1e5"
        camera={{ fov: 60, position: [0, 4, 10], near: 0.1, far: 100 }}>
        <hemisphereLight args={['#555555', '#ffffff']} />
        <directionalLight
          position={[0, 12.5, 12.5]}
          intensity={4}
          castShadow
          shadow-radius={3}
          shadow-blurSamples={8}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-40}
          shadow-camera-right={40}
          shadow-camera-top={40}
          shadow-camera-bottom={-40}
          shadow-camera-near={1}
          shadow-camera-far={50}
        />

        <Suspense>
          <World controlsRef={controlsRef} />
        </Suspense>

        <DemoHelpers grid={false} target={[0, 2, 0]} controlsRef={controlsRef} />
      </Canvas>
    </KeyboardControls>
  );
}
