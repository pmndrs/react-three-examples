import type { ThreeElement } from '@react-three/fiber/webgpu'
import type { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js'

declare module '@react-three/fiber' {
  interface ThreeElements {
    teapotGeometry: ThreeElement<typeof TeapotGeometry>
  }
}
