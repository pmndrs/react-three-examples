// Halftone TSL graph: one reusable dot-grid helper, composed over the current material
// output once and shared by every material using the effect.
import { Fn, mix, normalWorld, output, rotate, screenCoordinate, screenSize, vec4 } from 'three/tsl';
import type { Node } from 'three/webgpu';

type HalftoneLayer = {
  count: Node<'float'>;
  color: Node<'color'>;
  direction: Node<'vec3'>;
  start: Node<'float'>;
  end: Node<'float'>;
  radius: Node<'float'>;
  mixLow: Node<'float'>;
  mixHigh: Node<'float'>;
};

// One halftone "ink layer": a rotated screen-space dot grid, masked by how much the
// surface normal faces `direction` (remapped `end..start` -> `0..1`), tinted `color`.
function halftone({ count, color, direction, start, end, radius, mixLow, mixHigh }: HalftoneLayer) {
  const gridUv = rotate(screenCoordinate.xy.div(screenSize.yy).mul(count), Math.PI * 0.25).mod(1);

  const orientationStrength = normalWorld.dot(direction.normalize()).remapClamp(end, start, 0, 1);

  const mask = orientationStrength
    .mul(radius)
    .mul(0.5)
    .step(gridUv.sub(0.5).length())
    .mul(mix(mixLow, mixHigh, orientationStrength));

  return vec4(color, mask);
}

// Build the final material output once. `output` resolves against whichever material
// owns this shared graph, while the layer uniforms remain live.
export function createHalftoneOutput(layers: readonly HalftoneLayer[]) {
  return Fn(() => {
    const result = output;

    for (const layer of layers) {
      const dots = halftone(layer);
      result.rgb.assign(mix(result.rgb, dots.rgb, dots.a));
    }

    return result;
  })();
}
