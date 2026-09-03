/**
 * animation-groups
 * Twenty-five boxes flip, change colour and fade in perfect unison — one three-second
 * clip, one mixer, driving every box through an `AnimationObjectGroup`.
 * Original: https://threejs.org/examples/#misc_animation_groups
 *
 * DEMONSTRATES
 * - `AnimationObjectGroup` as a mixer root: objects share ONE animation state, and can
 *   join or leave the group at any time
 * - Membership as a ref callback: each `<mesh>` adds itself to the group on mount and
 *   returns the `remove` as its cleanup — no `add()` loop, no bookkeeping
 * - Keyframe tracks built by hand (`QuaternionKeyframeTrack`, a discrete
 *   `ColorKeyframeTrack`, `NumberKeyframeTrack`) assembled into an `AnimationClip`
 * - A plain `AnimationMixer` stepped in `useFrame` — drei's `useAnimations` wants an
 *   `Object3D` root, which a group is not
 *
 * DIVERGENCE from original
 * - Each box carries its own material (a JSX child) where the original shares one; the
 *   group binds `.material.color` per object either way, and this makes that visible
 */
import { useMemo } from 'react';
import {
  AnimationClip,
  AnimationMixer,
  AnimationObjectGroup,
  ColorKeyframeTrack,
  InterpolateDiscrete,
  NoToneMapping,
  NumberKeyframeTrack,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
} from 'three/webgpu';
import { Canvas, useFrame } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const GRID = [0, 1, 2, 3, 4];

// Half a turn about X and back, colour stepping red -> green -> blue, opacity dipping
// to zero in the middle. Three seconds, then it loops.
function makeClip() {
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
  return new AnimationClip('default', 3, [quaternionKF, colorKF, opacityKF]);
}

function Boxes() {
  const group = useMemo(() => new AnimationObjectGroup(), []);
  const mixer = useMemo(() => {
    const m = new AnimationMixer(group);
    m.clipAction(makeClip()).play();
    return m;
  }, [group]);

  useFrame(({ delta }) => mixer.update(delta));

  return GRID.flatMap((i) =>
    GRID.map((j) => (
      <mesh
        key={`${i}-${j}`}
        position={[32 - 16 * i, 0, 32 - 16 * j]}
        ref={(mesh) => {
          if (!mesh) return;
          group.add(mesh);
          return () => group.remove(mesh);
        }}>
        <boxGeometry args={[5, 5, 5]} />
        <meshBasicNodeMaterial transparent />
      </mesh>
    )),
  );
}

export default function AnimationGroups() {
  return (
    <Canvas renderer={{ toneMapping: NoToneMapping }} camera={{ position: [50, 50, 100], fov: 40, near: 1, far: 1000 }}>
      <Boxes />
      <DemoHelpers />
    </Canvas>
  );
}
