/**
 * interactive-cubes-gpu
 * Five thousand boxes merged into ONE mesh, so no raycaster could tell them apart —
 * instead each box carries an integer id, a 1x1 pick pass renders the id under the
 * pointer into an integer render target, and a GPU->CPU readback names the box. The
 * yellow highlight snaps onto whatever you hover.
 * Original: https://threejs.org/examples/#webgl_interactive_cubes_gpu
 *
 * DEMONSTRATES
 * - GPU colour-ID picking — a real technique, deliberately NOT fiber's event raycaster
 * - An `RGBAIntegerFormat` + `IntType` render target: the node builder derives the
 *   fragment output from the BOUND target, so the same `fragmentNode` compiles to a
 *   `vec4<i32>` write and the readback comes back as an `Int32Array`
 * - `camera.setViewOffset(..., 1, 1)` to render only the pixel under the pointer, and
 *   `renderer.readRenderTargetPixelsAsync` throttled to one in-flight request
 * - An extra offscreen pass in `useFrame({ phase: 'update' })` — the default loop still
 *   draws the visible scene afterwards; `createPortal` builds the pick scene in JSX
 * - `mergeGeometries` with a custom per-vertex integer attribute (`attribute<'int'>`)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { attribute, ivec4 } from 'three/tsl';
import {
  BoxGeometry,
  Color,
  Euler,
  Float32BufferAttribute,
  Int32BufferAttribute,
  IntType,
  Matrix4,
  NoToneMapping,
  Quaternion,
  RenderTarget,
  RGBAIntegerFormat,
  Scene,
  Vector2,
  Vector3,
} from 'three/webgpu';
import type { Mesh } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Canvas, createPortal, useFrame, useLocalNodes, useThree } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const BOX_COUNT = 5000;
const HIGHLIGHT_PADDING = new Vector3(10, 10, 10);
// Clear value for the pick target: -1 means "nothing under the pointer".
const NO_HIT = new Color(-1, -1, -1);

//* Geometry ======================================================

interface BoxTransform {
  position: Vector3;
  rotation: Euler;
  scale: Vector3;
}

// 5000 randomly placed boxes merged into one geometry. Each box's vertices carry its
// colour and — the part that makes picking possible — its index as an `id` attribute.
function buildBoxes() {
  const geometries = [];
  const transforms: BoxTransform[] = [];
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const color = new Color();

  for (let i = 0; i < BOX_COUNT; i++) {
    const geometry = new BoxGeometry();
    const position = new Vector3(
      Math.random() * 10000 - 5000,
      Math.random() * 6000 - 3000,
      Math.random() * 8000 - 4000,
    );
    const rotation = new Euler(Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI);
    const scale = new Vector3(Math.random() * 200 + 100, Math.random() * 200 + 100, Math.random() * 200 + 100);
    geometry.applyMatrix4(matrix.compose(position, quaternion.setFromEuler(rotation), scale));

    const count = geometry.attributes.position.count;
    color.setHex(Math.random() * 0xffffff);
    geometry.setAttribute('color', new Float32BufferAttribute(Array(count).fill(color.toArray()).flat(), 3));
    // Original: Int16 with `gpuType = IntType`; three's WebGPU backend widens that to
    // sint32 anyway, so declare it as Int32 up front.
    geometry.setAttribute('id', new Int32BufferAttribute(new Int32Array(count).fill(i), 1));

    geometries.push(geometry);
    transforms.push({ position, rotation, scale });
  }

  return { merged: mergeGeometries(geometries), transforms };
}

//* Picking =======================================================

function PickableBoxes() {
  const renderer = useThree((s) => s.renderer);
  const camera = useThree((s) => s.camera);
  const highlightRef = useRef<Mesh>(null);

  const { merged, transforms } = useMemo(buildBoxes, []);
  const [pickScene] = useState(() => new Scene());
  const [pickTarget] = useState(() => new RenderTarget(1, 1, { type: IntType, format: RGBAIntegerFormat }));

  // Whatever the pick target's format, this is "write my id" — the builder converts it
  // to the target's integer output type. Int varyings interpolate flat automatically.
  const { idNode } = useLocalNodes(() => ({ idNode: ivec4(attribute<'int'>('id')) }));

  // Canvas-pixel pointer, tracked from the DOM rather than `state.pointer` so that
  // "no pointer yet" reads as no pick instead of a pick at the canvas centre.
  const pointer = useRef(new Vector2(-1, -1));
  useEffect(() => {
    const canvas = renderer.domElement;
    const onPointerMove = (event: PointerEvent) => pointer.current.set(event.offsetX, event.offsetY);
    canvas.addEventListener('pointermove', onPointerMove);
    return () => canvas.removeEventListener('pointermove', onPointerMove);
  }, [renderer]);

  const readbackInFlight = useRef(false);

  useFrame(
    () => {
      if (pointer.current.x < 0 || readbackInFlight.current) return;

      // Render just the one pixel under the pointer into the 1x1 pick target.
      const dpr = renderer.getPixelRatio();
      const { width, height } = renderer.domElement;
      camera.setViewOffset(
        width,
        height,
        Math.floor(pointer.current.x * dpr),
        Math.floor(pointer.current.y * dpr),
        1,
        1,
      );
      renderer.setClearColor(NO_HIT);
      renderer.setRenderTarget(pickTarget);
      renderer.render(pickScene, camera);
      renderer.setRenderTarget(null);
      camera.clearViewOffset();

      // Never `await` in a frame callback — the readback is a detached, throttled promise.
      readbackInFlight.current = true;
      renderer
        .readRenderTargetPixelsAsync(pickTarget, 0, 0, 1, 1)
        .then((pixels) => {
          const highlight = highlightRef.current;
          const id = pixels[0];
          if (!highlight) return;
          if (id === -1) {
            highlight.visible = false;
            return;
          }
          const { position, rotation, scale } = transforms[id];
          highlight.position.copy(position);
          highlight.rotation.copy(rotation);
          highlight.scale.copy(scale).add(HIGHLIGHT_PADDING);
          highlight.visible = true;
        })
        .finally(() => {
          readbackInFlight.current = false;
        });
    },
    { phase: 'update' },
  );

  return (
    <>
      <mesh geometry={merged}>
        <meshPhongNodeMaterial color="#ffffff" flatShading vertexColors shininess={0} />
      </mesh>
      <mesh ref={highlightRef} visible={false}>
        <boxGeometry />
        <meshLambertNodeMaterial color="#ffff00" />
      </mesh>
      {/* The pick scene: the same merged geometry, drawn with ids instead of colours. */}
      {createPortal(
        <mesh geometry={merged}>
          <nodeMaterial fragmentNode={idNode} />
        </mesh>,
        pickScene,
      )}
    </>
  );
}

export default function InteractiveCubesGpu() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#ffffff"
      camera={{ position: [0, 0, 1000], fov: 70, near: 1, far: 10000 }}>
      <ambientLight color="#cccccc" />
      <directionalLight color="#ffffff" intensity={3} position={[0, 500, 2000]} />
      <PickableBoxes />
      <DemoHelpers grid={false} />
    </Canvas>
  );
}
