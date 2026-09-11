// The ground: a fading grid-and-dots pattern (bgolus's "best darn grid shader"),
// masked out with distance from the origin — both hand-rolled `Fn`s, ported verbatim.
import { Fn, abs, float, fract, fwidth, length, max, positionWorld, saturate, smoothstep, vec4 } from 'three/tsl';
import type { Node } from 'three/webgpu';

// https://bgolus.medium.com/the-best-darn-grid-shader-yet-727f9278b9d8
// Cast: Fn's destructured params come back as bare ShaderNodeObject<Node> with no
// default-value typing — AGENTS.md B10. `coord` is always called with a vec2
// (`positionWorld.xz`); regain that so `.x`/`.y` swizzles typecheck below.
const grid = Fn(([coordIn, lineWidth = float(0.01), dotSize = float(0.03)]) => {
  const coord = coordIn as Node<'vec2'>;
  const g = fract(coord);
  const fw = fwidth(coord);
  const gx = abs(g.x.sub(0.5));
  const gy = abs(g.y.sub(0.5));

  const lineX = saturate(lineWidth.sub(gx).div(fw.x).add(0.5));
  const lineY = saturate(lineWidth.sub(gy).div(fw.y).add(0.5));
  const lines = max(lineX, lineY);

  const squareDist = max(gx, gy);
  const aa = max(fw.x, fw.y);
  const dots = smoothstep(dotSize.add(aa), dotSize.sub(aa), squareDist);

  return max(dots, lines);
});

const fade = Fn(([radius = float(10.0), falloff = float(1.0)]) => {
  return smoothstep(radius, radius.sub(falloff), length(positionWorld));
});

const GRID_COLOR = vec4(0.5, 0.5, 0.5, 1.0);
const BASE_COLOR = vec4(1.0, 1.0, 1.0, 0.0);

export const gridFloorColor = grid(positionWorld.xz, 0.007, 0.03).mix(BASE_COLOR, GRID_COLOR).mul(fade(30.0, 20.0));

export function GridFloor() {
  return (
    <mesh rotation-x={-Math.PI / 2} renderOrder={-1}>
      <circleGeometry args={[40]} />
      <nodeMaterial colorNode={gridFloorColor} transparent />
    </mesh>
  );
}
