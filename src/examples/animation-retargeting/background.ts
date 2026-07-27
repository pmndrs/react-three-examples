// The "light-speed" starfield backdrop: a hue-cycling vignette (`coloredVignette`)
// dodge-blended with a radial streak effect (`lightSpeed`, forked from a Shadertoy) that
// only shows near the horizon (`remapClamp` on the up-facing world normal). Assigned to
// `scene.backgroundNode` by the example component — no JSX here, same "effect" scene
// role as tsl-halftone's `halftoneEffect.ts`.
import {
  Fn,
  atan,
  blendDodge,
  color,
  cos,
  float,
  hue,
  length,
  mul,
  normalWorldGeometry,
  pow,
  screenUV,
  sin,
  sub,
  time,
  vec2,
  vec3,
} from 'three/tsl'
import type { Node } from 'three/webgpu'

// forked from https://www.shadertoy.com/view/7ly3D1
// Cast: the Fn's destructured param comes back as bare `ShaderNodeObject<Node>` (no
// vec2 type parameter) — same class of gap as tsl-halftone's `halftoneLayer` params
// (AGENTS.md Fn-param cast, B10).
const lightSpeed = /*#__PURE__*/ Fn(([suvIn]) => {
  const suv = vec2(suvIn as unknown as Node<'vec2'>)
  const uv = vec2(length(suv), atan(suv.y, suv.x))
  const offset = float(
    float(0.1)
      .mul(sin(uv.y.mul(10).sub(time.mul(0.6))))
      .mul(cos(uv.y.mul(48).add(time.mul(0.3))))
      .mul(cos(uv.y.mul(3.7).add(time))),
  )
  const rays = vec3(
    vec3(sin(uv.y.mul(150).add(time)).mul(0.5).add(0.5))
      .mul(vec3(sin(uv.y.mul(80).sub(time.mul(0.6))).mul(0.5).add(0.5)))
      .mul(vec3(sin(uv.y.mul(45).add(time.mul(0.8))).mul(0.5).add(0.5)))
      .mul(
        vec3(
          sub(
            1,
            cos(uv.y.add(mul(22, time).sub(pow(uv.x.add(offset), 0.3).mul(60)))),
          ),
        ),
      )
      .mul(vec3(uv.x.mul(2))),
  )

  return rays
})
// Original calls `.setLayout(...)` here (named/typed inputs for raw-shader interop);
// dropped — this Fn is only ever invoked from other TSL code with a single Node
// argument, and `.setLayout` isn't in this repo's `ShaderCallable<Node>` typings
// (same "typed TSL surface doesn't fully expose the runtime API" family as the other
// documented casts, but nothing here depends on the layout metadata it would add).

const coloredVignette = screenUV
  .distance(0.5)
  .mix(hue(color(0x0175ad), time.mul(0.1)), hue(color(0x02274f), time.mul(0.5)))
const lightSpeedEffect = lightSpeed(normalWorldGeometry).clamp()
const lightSpeedSky = normalWorldGeometry.y.remapClamp(-0.1, 1).mix(0, lightSpeedEffect)

export const retargetingBackground = blendDodge(coloredVignette, lightSpeedSky)
