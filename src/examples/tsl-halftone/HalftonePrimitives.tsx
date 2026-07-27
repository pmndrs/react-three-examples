// Two primitive shapes, each its own `meshStandardNodeMaterial` — `outputNode` is
// memoized per mesh so it's only (re)built when `halftones`' identity changes
// (effectively once; see halftoneEffect.ts for why that identity stays stable).
import { useMemo } from 'react'
import { output } from 'three/tsl'
import type { HalftonesFn } from './halftoneEffect'

interface HalftonePrimitivesProps {
  materialColor: string
  halftones: HalftonesFn
}

export function HalftonePrimitives({ materialColor, halftones }: HalftonePrimitivesProps) {
  const torusOutput = useMemo(() => halftones(output), [halftones])
  const sphereOutput = useMemo(() => halftones(output), [halftones])

  return (
    <>
      <mesh position={[3, 0, 0]}>
        <torusKnotGeometry args={[0.6, 0.25, 128, 32]} />
        <meshStandardNodeMaterial color={materialColor} outputNode={torusOutput} />
      </mesh>
      <mesh position={[-3, 0, 0]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardNodeMaterial color={materialColor} outputNode={sphereOutput} />
      </mesh>
    </>
  )
}
