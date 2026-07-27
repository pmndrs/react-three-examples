// All live uniforms of the fire simulation and its shading graphs, created in one
// place. These are plain three-side TSL `uniform()` nodes (typed, no fiber casts)
// built ONCE inside the component's `useNodes` creator, so they live in fiber's
// node store and survive StrictMode remounts together with the compute kernels
// that close over them. Leva-driven values are synced in an effect, frame-driven
// values in `useFrame` — the same split the original's render loop uses.
import { uniform } from 'three/tsl'
import { Color, Matrix4, Vector3 } from 'three/webgpu'
import {
  KEY_LIGHT_POS,
  SIM_STEP,
  VOLUME_WORLD_SIZE_X,
  VOLUME_WORLD_SIZE_Y,
  VOLUME_WORLD_SIZE_Z,
} from './constants'

export function createFireUniforms() {
  return {
    // --- simulation timing (frame-driven) ---
    uDt: uniform(SIM_STEP),
    uTime: uniform(0),

    // --- fluid physics (leva / frame-derived) ---
    uBuoyancy: uniform(3.0), // hot air rises
    uTurbulence: uniform(3.2), // curl-noise force strength (leva turbulence / sqrt(simSpeed))
    uCooling: uniform(1.0), // temperature cooling /s (1 / fire lifespan)
    uDissipation: uniform(0.4), // smoke dissipation /s (1 / smoke lifespan)

    // --- emitter (leva) ---
    uEmitDensity: uniform(7.0),
    uEmitTemperature: uniform(5.5),

    // --- teapot state (frame-driven; wind + emission follow the drag) ---
    uTeapotMatrix: uniform(new Matrix4()),
    uTeapotSpeed: uniform(0.0),
    uTeapotVelocity: uniform(new Vector3()),
    uTeapotPosition: uniform(new Vector3()),

    // --- volume box (constant) ---
    uVolumeWorldSize: uniform(
      new Vector3(VOLUME_WORLD_SIZE_X, VOLUME_WORLD_SIZE_Y, VOLUME_WORLD_SIZE_Z),
    ),

    // --- fire look (leva) ---
    uFireGlowSpread: uniform(5.0),
    uFireStartColor: uniform(new Color(0xffe68c)),
    uFireMidColor: uniform(new Color(0xff7305)),
    uFireEndColor: uniform(new Color(0xff0000)),
    uFireHue: uniform(0.0), // radians
    uSaturation: uniform(1.1),
    uTeapotEmissiveIntensity: uniform(0.2),

    // --- CPU-noise flame animation (frame-driven, ImprovedNoise on the CPU) ---
    uFlameHeight: uniform(3.5),
    uSway: uniform(new Vector3()),
    uFlicker: uniform(1.0),
    uColorNoise: uniform(0.0),

    // --- lighting ---
    uKeyLightPos: uniform(new Vector3(...KEY_LIGHT_POS)),

    // Raymarch step count of the volume's shadow caster — mirrors the leva `steps`
    // knob (the original tracked `material.steps` with an onRenderUpdate uniform).
    uShadowSteps: uniform(16),
  }
}

export type FireUniforms = ReturnType<typeof createFireUniforms>
