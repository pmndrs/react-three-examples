// The same CRT/aperture-grille effect, written twice: once as raw WGSL handed to
// `wgslFn`, once as a TSL `Fn` graph. Both halves read the SAME uniform nodes and the
// same texture, which is the whole point — a WGSL function is just another node.
import {
  attribute,
  clamp,
  float,
  floor,
  Fn,
  fract,
  positionGeometry,
  sampler,
  sin,
  texture,
  time,
  uv,
  varyingProperty,
  vec2,
  vec3,
  wgslFn,
} from 'three/tsl';
import type { Node, Texture } from 'three/webgpu';

// Every knob both implementations read. Written out rather than derived from a JSX
// element: these are values we PRODUCE and chain on, not props we receive.
export interface CrtUniforms {
  crtWidth: Node<'float'>;
  crtHeight: Node<'float'>;
  cellOffset: Node<'float'>;
  cellSize: Node<'float'>;
  borderMask: Node<'float'>;
  pulseIntensity: Node<'float'>;
  pulseWidth: Node<'float'>;
  pulseRate: Node<'float'>;
  speed: Node<'float'>;
}

//* WGSL side =====================================================

// A WGSL vertex function writes varyings through the implicit `varyings` struct. The
// `varyingProperty` node it should route to is passed as a wgslFn *include*.
const CRT_VERTEX_WGSL = /* wgsl */ `
  fn crtVertex( position: vec3f, uv: vec2f ) -> vec3<f32> {
    varyings.vUv = uv;
    return position;
  }
`;

// A WGSL fragment function takes no varyings argument — the varying value arrives as
// an ordinary named input, fed with the same `varyingProperty` node.
const CRT_FRAGMENT_WGSL = /* wgsl */ `
  fn crtFragment(
    vUv: vec2f,
    tex: texture_2d<f32>,
    texSampler: sampler,
    crtWidth: f32,
    crtHeight: f32,
    cellOffset: f32,
    cellSize: f32,
    borderMask: f32,
    time: f32,
    speed: f32,
    pulseIntensity: f32,
    pulseWidth: f32,
    pulseRate: f32
  ) -> vec3<f32> {
    // Convert uv into map of pixels
    var pixel = ( vUv * 0.5 + 0.5 ) * vec2<f32>( crtWidth, crtHeight );
    // Coordinate for each cell in the pixel map
    let coord = pixel / cellSize;
    // Three color values for each cell (r, g, b)
    let subcoord = coord * vec2f( 3.0, 1.0 );
    let offset = vec2<f32>( 0, fract( floor( coord.x ) * cellOffset ) );

    let maskCoord = floor( coord + offset ) * cellSize;

    var samplePoint = maskCoord / vec2<f32>( crtWidth, crtHeight );
    samplePoint.x += fract( time * speed / 20 );

    var color = textureSample( tex, texSampler, samplePoint ).xyz;

    // Current implementation does not give an even amount of space to each r, g, b unit
    // of a cell. Fix/hack this by multiplying subCoord.x by cellSize at cellSizes below 6
    let ind = floor( subcoord.x ) % 3;

    var maskColor = vec3<f32>(
      f32( ind == 0.0 ),
      f32( ind == 1.0 ),
      f32( ind == 2.0 )
    ) * 3.0;

    let cellUV = fract( subcoord + offset ) * 2.0 - 1.0;
    var border: vec2<f32> = 1.0 - cellUV * cellUV * borderMask;

    maskColor *= vec3f( clamp( border.x, 0.0, 1.0 ) * clamp( border.y, 0.0, 1.0 ) );

    color *= maskColor;

    color.r *= 1.0 + pulseIntensity * sin( pixel.y / pulseWidth + time * pulseRate );
    color.b *= 1.0 + pulseIntensity * sin( pixel.y / pulseWidth + time * pulseRate );
    color.g *= 1.0 + pulseIntensity * sin( pixel.y / pulseWidth + time * pulseRate );

    return color;
  }
`;

export function createWgslCrtNodes(map: Texture, u: CrtUniforms) {
  const vUv = varyingProperty('vec2', 'vUv');

  const crtVertex = wgslFn<{ position: Node; uv: Node }>(CRT_VERTEX_WGSL, [vUv]);
  const crtFragment = wgslFn<Record<string, Node>>(CRT_FRAGMENT_WGSL);

  return {
    // `attribute()` names line up with the geometry's own setAttribute() calls.
    positionNode: crtVertex({ position: attribute('position'), uv: attribute('uv') }),
    fragmentNode: crtFragment({
      vUv,
      tex: texture(map),
      // WGSL wants the sampler separately; TSL's `texture()` bundles both.
      texSampler: sampler(map),
      crtWidth: u.crtWidth,
      crtHeight: u.crtHeight,
      cellOffset: u.cellOffset,
      cellSize: u.cellSize,
      borderMask: u.borderMask,
      time,
      speed: u.speed,
      pulseIntensity: u.pulseIntensity,
      pulseWidth: u.pulseWidth,
      pulseRate: u.pulseRate,
    }),
  };
}

//* TSL side ======================================================

export function createTslCrtNodes(map: Texture, u: CrtUniforms) {
  const vUv = varyingProperty('vec2', 'vUv');

  // The `Fn()` wrappers are load-bearing on both nodes: `vUv.assign()` and the
  // swizzle write below need an active stack.
  const crtVertex = Fn(() => {
    vUv.assign(uv());
    return positionGeometry;
  });

  const crtFragment = Fn(() => {
    const dimensions = vec2(u.crtWidth, u.crtHeight);
    const translatedUV = vUv.mul(0.5).add(0.5);
    const pixel = translatedUV.mul(dimensions);

    const coord = pixel.div(u.cellSize);
    const subCoord = coord.mul(vec2(3.0, 1.0));

    const cellOffset = vec2(0.0, fract(floor(coord.x).mul(u.cellOffset)));

    const maskCoord = floor(coord.add(cellOffset)).mul(u.cellSize);
    const samplePoint = maskCoord.div(dimensions).toVar();
    const scaledTime = time.mul(u.speed);
    samplePoint.x = samplePoint.x.add(fract(scaledTime.div(20)));
    samplePoint.y = samplePoint.y.sub(1.5);

    const sampled = texture(map, samplePoint);

    const ind = floor(subCoord.x).mod(3);

    // One of r/g/b lit per cell column — the aperture grille.
    let maskColor = vec3(ind.equal(0.0), ind.equal(1.0), ind.equal(2.0)).mul(3.0);

    const subCoordOffset = fract(subCoord.add(cellOffset));
    let cellUV = subCoordOffset.mul(2.0);
    cellUV = cellUV.sub(1.0);

    const border = vec2(1.0).sub(cellUV.mul(cellUV).mul(u.borderMask));

    const clampX = clamp(border.x, 0.0, 1.0);
    const clampY = clamp(border.y, 0.0, 1.0);
    const borderClamp = clampX.mul(clampY);
    maskColor = maskColor.mul(borderClamp);

    const color = sampled.mul(maskColor);

    const pixelDampen = pixel.y.div(u.pulseWidth);
    const pulse = sin(pixelDampen.add(time.mul(u.pulseRate))).mul(u.pulseIntensity);

    return color.mul(float(1.0).add(pulse));
  });

  return { positionNode: crtVertex(), colorNode: crtFragment() };
}
