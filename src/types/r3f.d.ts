import type { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js'
import type { SkyMesh } from 'three/addons/objects/SkyMesh.js'
import type { ThreeElement } from '@react-three/fiber/webgpu'

declare module '@react-three/fiber' {
  interface ThreeElements {
    roundedBoxGeometry: ThreeElement<typeof RoundedBoxGeometry>
    teapotGeometry: ThreeElement<typeof TeapotGeometry>
    skyMesh: ThreeElement<typeof SkyMesh>
  }
}
