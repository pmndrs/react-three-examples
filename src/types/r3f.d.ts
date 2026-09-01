import type { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js'
import type { ThreeElement } from '@react-three/fiber/webgpu'

declare module '@react-three/fiber' {
  interface ThreeElements {
    roundedBoxGeometry: ThreeElement<typeof RoundedBoxGeometry>
    teapotGeometry: ThreeElement<typeof TeapotGeometry>
  }
}
