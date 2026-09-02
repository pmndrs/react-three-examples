/**
 * storage-buffer
 * Four storage buffers — one each of float, vec2, vec3 and vec4 — holding 32 numbers,
 * drawn as four stacked bands of bar charts. A compute pass reverses all four in place
 * once a second, so every ramp flips left-to-right and back again.
 * Original: https://threejs.org/examples/#webgpu_storage_buffer
 *
 * DEMONSTRATES
 * - `useBuffers` holding four `storage()` nodes of different element types over
 *   `StorageInstancedBufferAttribute`s, with `useNodes` compiling the kernels on top
 * - Reading an element the running thread does NOT own — `element(SIZE - 1 - i)` — and
 *   why `workgroupBarrier()` sits between that read and the write back: without it a
 *   neighbouring thread can overwrite the value before this one has copied it
 * - Two dispatch cadences, both `renderer.compute()`: a one-shot seed in `useEffect`
 *   (idempotent, so StrictMode's double run is harmless) and a `useFrame({ fps: 1 })`
 *   step — compute is never a `phase: 'render'` takeover
 * - A `colorNode` indexing a storage buffer straight off `uv().x`, so the buffer IS
 *   the picture — no attributes, no instancing, one plane
 *
 * DIVERGENCE from original
 * - The original draws the same scene twice side by side, once on the WebGPU backend
 *   and once on a `forceWebGL` one, to show WebGL's storage-buffer emulation matching.
 *   This repo is WebGPU-only, so the WebGL pane goes, and with it `.setPBO(true)`
 *   (a flag that exists purely for that backend) and the `trackTimestamp` readouts —
 *   the same call `compute-reduce` made.
 */
import { useEffect, useLayoutEffect } from 'react';
import { NoToneMapping, StorageInstancedBufferAttribute, type Node, type OrthographicCamera } from 'three/webgpu';
import { Fn, If, instanceIndex, storage, uint, uv, vec3, workgroupBarrier } from 'three/tsl';
import { Canvas, useBuffers, useFrame, useNodes, useThree } from '@react-three/fiber/webgpu';

import { DemoHelpers } from '../../utils/DemoHelpers';

// Original values. Non-power-of-two storage sizes are poorly supported on WebGPU.
const SIZE = 32;
const BAR_COUNT = 32;

//* Framing =======================================================

// The original's camera has a frustum two world units tall, so its 1x1 plane fills
// half the height. fiber sizes an orthographic frustum in PIXELS, so the equivalent
// is a zoom (compute-reduce / compute-points pattern).
function PlaneFraming() {
  // `camera` types as the base Camera union even on an `orthographic` Canvas — safe
  // here because this only ever mounts under one.
  const camera = useThree((state) => state.camera) as OrthographicCamera;
  const height = useThree((state) => state.size.height);

  useLayoutEffect(() => {
    camera.zoom = height / 2;
    camera.updateProjectionMatrix();
  }, [camera, height]);

  return null;
}

//* Scene =========================================================

function BarChart() {
  const renderer = useThree((state) => state.renderer);

  // One buffer per element width. They hold identical values — the point is that the
  // same index arithmetic works whatever the element type is.
  const { barsFloat, barsVec2, barsVec3, barsVec4 } = useBuffers(() => ({
    barsFloat: storage(new StorageInstancedBufferAttribute(new Float32Array(SIZE), 1), 'float', SIZE),
    barsVec2: storage(new StorageInstancedBufferAttribute(new Float32Array(SIZE * 2), 2), 'vec2', SIZE),
    barsVec3: storage(new StorageInstancedBufferAttribute(new Float32Array(SIZE * 3), 3), 'vec3', SIZE),
    barsVec4: storage(new StorageInstancedBufferAttribute(new Float32Array(SIZE * 4), 4), 'vec4', SIZE),
  }));

  const { seed, reverse, colorNode } = useNodes(() => {
    const buffers = [barsFloat, barsVec2, barsVec3, barsVec4];

    // A bar's height, quantised to BAR_COUNT steps.
    const barHeight = (value: Node<'float'>) => value.div(SIZE).mul(BAR_COUNT).floor().div(BAR_COUNT);

    return {
      // Fill each buffer with 0..SIZE-1: thread i writes its own index.
      seed: Fn(() => {
        for (const buffer of buffers) buffer.element(instanceIndex).assign(instanceIndex);
      })().compute(SIZE),

      // Reverse in place. Every thread reads the element MIRRORED across the buffer —
      // someone else's — before anyone writes, which is what the barrier guarantees.
      reverse: Fn(() => {
        for (const buffer of buffers) {
          const mirrored = buffer.element(uint(SIZE - 1).sub(instanceIndex)).toVar();
          workgroupBarrier();
          buffer.element(instanceIndex).assign(mirrored);
        }
      })().compute(SIZE),

      // Four bands up the plane, each reading a different buffer at the column the
      // pixel lands in. The Ifs cascade, so the topmost band that matches wins. Every
      // lane of a vector element holds the same number, so `.x` is the whole value —
      // the original writes `float(element)` and lets three's converter take the x.
      colorNode: Fn(() => {
        const index = uint(uv().x.mul(SIZE).floor()).toVar();
        If(index.greaterThanEqual(SIZE), () => {
          index.assign(uint(SIZE).sub(1));
        });

        const barColor = vec3(0, 0, 0).toVar();

        If(uv().y.greaterThan(0.0), () => {
          barColor.assign(vec3(barHeight(barsFloat.element(index)), 0, 0));
        });
        If(uv().y.greaterThan(0.25), () => {
          barColor.assign(vec3(0, barHeight(barsVec2.element(index).x), 0));
        });
        If(uv().y.greaterThan(0.5), () => {
          barColor.assign(vec3(0, 0, barHeight(barsVec3.element(index).x)));
        });
        If(uv().y.greaterThan(0.75), () => {
          const value = barHeight(barsVec4.element(index).x);
          barColor.assign(vec3(value, value, value));
        });

        return barColor;
      })(),
    };
  });

  // Seed once. The kernel is idempotent, so StrictMode running this twice is fine.
  useEffect(() => {
    renderer.compute(seed);
  }, [renderer, seed]);

  // The original steps on a chained `setTimeout(…, 1000)`; the scheduler's fps throttle
  // says the same thing without leaving the frame loop.
  useFrame(
    () => {
      renderer.compute(reverse);
    },
    { fps: 1 },
  );

  return (
    <mesh>
      <planeGeometry args={[1, 1]} />
      <meshBasicNodeMaterial colorNode={colorNode} />
    </mesh>
  );
}

export default function StorageBuffer() {
  return (
    <Canvas
      // The original never sets a tone mapping (WebGPURenderer's default) and the bars
      // are pure primaries — ACESFilmic would visibly mute them.
      renderer={{ toneMapping: NoToneMapping }}
      orthographic
      background="#313131"
      camera={{ position: [0, 0, 1], near: 0, far: 2 }}>
      <PlaneFraming />
      <BarChart />
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  );
}
