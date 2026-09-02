import { LightProbeHelper } from 'three/addons/helpers/LightProbeHelperGPU.js';
import { extend } from '@react-three/fiber/webgpu';

// Register the shared addon once so examples can use <lightProbeHelper /> directly.
// Unlike SpotLightHelper/RectAreaLightHelper (imperative: need a frame-loop `.update()`
// or `light.add(helper)` parenting), this helper is a plain Mesh that self-refreshes
// via `onBeforeRender()` — a genuine `args={[lightProbe, size]}` JSX element, no
// effect wiring needed.
extend({ LightProbeHelper });

export { LightProbeHelper };
