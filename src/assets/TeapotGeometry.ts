import { extend } from '@react-three/fiber/webgpu'
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js'

// Register the shared addon once so examples can use <teapotGeometry /> directly.
extend({ TeapotGeometry })

export { TeapotGeometry }
