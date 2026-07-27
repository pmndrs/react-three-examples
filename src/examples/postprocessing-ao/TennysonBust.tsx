// Draco-compressed Tennyson bust (Three D Scans), auto-fitted onto its pedestal via
// Box3 measurement — scale to a target height, then seat the bounding-box bottom on
// the pedestal top, exactly as the original does.
import { useLayoutEffect } from 'react'
import { useGLTF } from '@react-three/drei/webgpu'
import { Box3, Vector3 } from 'three/webgpu'

const BUST_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/tennyson-bust.glb'

const BUST_X = -3
const BUST_Z = -3.2
const TARGET_HEIGHT = 2.64
const PEDESTAL_TOP_Y = -0.7

export function TennysonBust() {
  // Second arg `true` = Draco decode with drei's default hosted decoder.
  const { scene: bust } = useGLTF(BUST_URL, true)

  // Imperative fit must precede the first render (bounding volumes / shader build read
  // mesh state on the first RAF) — useLayoutEffect, not useEffect. Reset the transform
  // first: useGLTF caches this scene instance, so the measurement must be idempotent
  // across StrictMode remounts.
  useLayoutEffect(() => {
    bust.rotation.y = Math.PI
    bust.scale.setScalar(1)
    bust.position.set(0, 0, 0)

    const size = new Vector3()
    new Box3().setFromObject(bust).getSize(size)
    bust.scale.setScalar(TARGET_HEIGHT / size.y)

    const fitBox = new Box3().setFromObject(bust)
    const center = new Vector3()
    fitBox.getCenter(center)
    bust.position.set(BUST_X - center.x, PEDESTAL_TOP_Y - fitBox.min.y, BUST_Z - center.z + 0.1)
  }, [bust])

  return <primitive object={bust} />
}
