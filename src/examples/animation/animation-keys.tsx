/**
 * animation-keys
 * One box slides out along X and back, doubles in size, flips over, steps through
 * red / green / blue and fades out and in — every property driven by a keyframe track
 * written by hand.
 * Original: https://threejs.org/examples/#misc_animation_keys
 *
 * DEMONSTRATES
 * - The keyframe track types and which property each one animates:
 *   `VectorKeyframeTrack` for `.position` / `.scale`, `QuaternionKeyframeTrack` for
 *   `.quaternion` (never Euler `.rotation`), a discrete `ColorKeyframeTrack` for
 *   `.material.color`, `NumberKeyframeTrack` for `.material.opacity`
 * - Tracks assembled into an `AnimationClip` and played through drei's `useAnimations`
 *   on a mesh ref — the same hook that plays GLTF clips plays hand-built ones
 */
import { useEffect, useRef } from 'react';
import {
  AnimationClip,
  ColorKeyframeTrack,
  InterpolateDiscrete,
  NoToneMapping,
  NumberKeyframeTrack,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
  type Mesh,
} from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import { useAnimations } from '@react-three/drei/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

function makeClip() {
  const positionKF = new VectorKeyframeTrack('.position', [0, 1, 2], [0, 0, 0, 30, 0, 0, 0, 0, 0]);
  const scaleKF = new VectorKeyframeTrack('.scale', [0, 1, 2], [1, 1, 1, 2, 2, 2, 1, 1, 1]);

  // Rotation goes through quaternions: interpolating Euler angles is not supported.
  const xAxis = new Vector3(1, 0, 0);
  const qInitial = new Quaternion().setFromAxisAngle(xAxis, 0);
  const qFinal = new Quaternion().setFromAxisAngle(xAxis, Math.PI);
  const quaternionKF = new QuaternionKeyframeTrack(
    '.quaternion',
    [0, 1, 2],
    [...qInitial.toArray(), ...qFinal.toArray(), ...qInitial.toArray()],
  );

  const colorKF = new ColorKeyframeTrack(
    '.material.color',
    [0, 1, 2],
    [1, 0, 0, 0, 1, 0, 0, 0, 1],
    InterpolateDiscrete,
  );
  const opacityKF = new NumberKeyframeTrack('.material.opacity', [0, 1, 2], [1, 0, 1]);

  // Duration 3 (a negative value would derive it from the tracks' last key).
  return new AnimationClip('Action', 3, [scaleKF, positionKF, quaternionKF, colorKF, opacityKF]);
}

const CLIPS = [makeClip()];

function AnimatedBox() {
  const meshRef = useRef<Mesh>(null);
  const { actions } = useAnimations(CLIPS, meshRef);

  useEffect(() => {
    actions.Action?.play();
  }, [actions]);

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[5, 5, 5]} />
      <meshBasicNodeMaterial color="#ffffff" transparent />
    </mesh>
  );
}

export default function AnimationKeys() {
  return (
    <Canvas renderer={{ toneMapping: NoToneMapping }} camera={{ position: [25, 25, 50], fov: 40, near: 1, far: 1000 }}>
      <axesHelper args={[10]} />
      <AnimatedBox />
      <DemoHelpers />
    </Canvas>
  );
}
