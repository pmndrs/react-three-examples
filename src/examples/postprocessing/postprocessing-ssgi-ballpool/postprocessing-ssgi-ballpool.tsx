/**
 * postprocessing-ssgi-ballpool
 * A room full of bouncing balls lit by one point light that follows your cursor.
 * The colour washing across the white walls and the dark side of every ball is
 * screen-space global illumination — there is no second light anywhere.
 * Move the pointer to shove balls aside; hold the button to rain in fresh ones.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_ssgi_ballpool
 *
 * DEMONSTRATES
 * - Driving a real rigid-body library (`@perplexdotgg/bounce`) from
 *   `useFrame({ phase: 'update' })` — simulation state lives in mutable objects the
 *   loop owns, never in React state or `useUniforms`
 * - `ssgi()` + `traa()` over a four-attachment MRT G-buffer, composited as
 *   `beauty * AO + albedo * GI`
 * - R3F pointer events replacing a hand-rolled `Raycaster`: `event.ray` drives the
 *   impulses and `event.point` places the light, off one material-invisible plane
 * - One data array building both the collision boxes and the wall meshes, with the
 *   room re-keyed on viewport aspect so a resize remounts the whole pool
 *
 * DIVERGENCE from original
 * - The original needs two simultaneous touches before a touch drag spawns balls;
 *   here one is enough (there are no orbit controls competing for the gesture).
 */
import { ACESFilmicToneMapping } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { BallPool } from './BallPool';
import { BOX_HEIGHT, CAM_DISTANCE, CAM_FOV } from './physics';
import { SSGIPipeline } from './SSGIPipeline';

export default function PostprocessingSSGIBallPool() {
  return (
    <Canvas
      // TRAA resolves the aliasing, so the renderer itself takes none.
      renderer={{ antialias: false, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 0.5 }}
      shadows="percentage"
      // The original's fitCameraToBox looks straight ahead at mid-height. fiber only
      // aims its default camera at the origin when no `rotation` is given, so passing
      // an explicit identity rotation is what keeps the view level.
      camera={{ fov: CAM_FOV, position: [0, BOX_HEIGHT / 2, CAM_DISTANCE], rotation: [0, 0, 0], near: 0.1, far: 100 }}>
      <SSGIPipeline />
      <BallPool />
      {/* No orbit: the original fits one fixed camera to the room and stays there. */}
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  );
}
