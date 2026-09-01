// The portal plane. Its `colorNode` is a TSL `pass()` node that renders `portalScene`
// (a second, fully independent THREE.Scene — see portal.tsx) from the same camera used
// for the main scene, remapped onto the plane's own screen-space UV via `.context()`.
// No `useRenderPipeline`/render-target plumbing needed: the node graph owns the
// sub-render, resolved automatically wherever this material gets drawn.
import { useMemo } from 'react'
import { pass, screenUV, uv } from 'three/tsl'
import { DoubleSide } from 'three/webgpu'
import type { Scene } from 'three/webgpu'

import { useThree } from '@react-three/fiber/webgpu'

export function PortalWindow({ portalScene }: { portalScene: Scene }) {
  const camera = useThree((s) => s.camera)

  // useMemo, not useNodes: this graph depends on runtime instances (the camera can
  // change identity) that a create-once hook can't express — same carve-out as
  // lights-phong's `lights([instance])`.
  const colorNode = useMemo(() => pass(portalScene, camera).context({ getUV: () => screenUV }), [portalScene, camera])

  return (
    <mesh position={[0, 1, 0.8]}>
      <planeGeometry args={[1.7, 2]} />
      <meshBasicNodeMaterial
        colorNode={colorNode}
        // Feathers the rectangular plane into an ellipse: distance-from-center remapped
        // to an opacity falloff, matching the original's
        // `uv().distance(.5).remapClamp(.3, .5).oneMinus()`.
        opacityNode={uv().distance(0.5).remapClamp(0.3, 0.5).oneMinus()}
        side={DoubleSide}
        transparent
      />
    </mesh>
  )
}
