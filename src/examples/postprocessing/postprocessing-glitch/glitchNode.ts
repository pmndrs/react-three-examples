// A hand-port of three.js's addon `DigitalGlitch` shader (three/addons/shaders/
// DigitalGlitch.js, driving GlitchPass). r185 ships no TSL `GlitchNode`, so this
// rewrites the original's GLSL fragment shader directly — see AGENTS.md's TSL
// idioms section: `Fn()`'s stack is load-bearing for the `.toVar()`/`.assign()` calls
// below, and `If()`/`.Else()` replace the GLSL `if` blocks that mutate the sample UV.
import { Fn, If, cos, dot, float, fract, screenCoordinate, sin, texture, uv, vec2, vec4 } from 'three/tsl';
import type { DataTexture, Node, TextureNode } from 'three/webgpu';

export interface GlitchUniforms {
  byp: Node<'float'>; // 0 = glitch this frame, >=1 = bypass (plain passthrough)
  amount: Node<'float'>;
  angle: Node<'float'>;
  seed: Node<'float'>;
  seedX: Node<'float'>;
  seedY: Node<'float'>;
  distortionX: Node<'float'>;
  distortionY: Node<'float'>;
  colS: Node<'float'>;
}

// Cheap hash noise for the "snow" static — same constants as the original's `rand()`.
// `co`'s destructured param types as `any` (AGENTS.md B10: `Fn(([a]) => …)` params don't
// infer — as of the current @types/three this is a silent `any`, not a blocking type
// error, so both `dot(co, …)` and `co.dot(…)` compile; the standalone form here is just
// a style choice, not a workaround).
const rand = Fn(([co]) => {
  return fract(sin(dot(co, vec2(12.9898, 78.233))).mul(43758.5453));
});

export function glitch(inputTexture: TextureNode, dispMap: DataTexture, u: GlitchUniforms): Node<'vec4'> {
  return Fn(() => {
    const p = uv().toVar();
    const xs = screenCoordinate.x.div(0.5).floor();
    const ys = screenCoordinate.y.div(0.5).floor();

    // Staffantan's Unity glitch shader, via the original: displacement lookup, then
    // two scanline "tear" bands (one horizontal, one vertical) that jump a strip of
    // the image to a different row/column.
    const disp = texture(dispMap, p.mul(u.seed).mul(u.seed)).r;

    If(p.y.lessThan(u.distortionX.add(u.colS)).and(p.y.greaterThan(u.distortionX.sub(u.colS.mul(u.seed)))), () => {
      If(u.seedX.greaterThan(0), () => {
        p.y.assign(float(1).sub(p.y.add(u.distortionY)));
      }).Else(() => {
        p.y.assign(u.distortionY);
      });
    });

    If(p.x.lessThan(u.distortionY.add(u.colS)).and(p.x.greaterThan(u.distortionY.sub(u.colS.mul(u.seed)))), () => {
      If(u.seedY.greaterThan(0), () => {
        p.x.assign(u.distortionX);
      }).Else(() => {
        p.x.assign(float(1).sub(p.x.add(u.distortionX)));
      });
    });

    p.x.addAssign(disp.mul(u.seedX).mul(u.seed.div(5)));
    p.y.addAssign(disp.mul(u.seedY).mul(u.seed.div(5)));

    // RGB-shift base: sample the three channels at slightly offset UVs.
    const offset = vec2(cos(u.angle), sin(u.angle)).mul(u.amount);
    const cr = inputTexture.sample(p.add(offset));
    const cga = inputTexture.sample(p);
    const cb = inputTexture.sample(p.sub(offset));
    const color = vec4(cr.r, cga.g, cb.b, cga.a).toVar();

    const snow = rand(vec2(xs.mul(u.seed), ys.mul(u.seed).mul(50))).mul(0.2);
    color.addAssign(vec4(snow).mul(u.amount).mul(200));

    const bypassed = inputTexture.sample(uv());
    return u.byp.lessThan(1).select(color, bypassed);
  })();
}
