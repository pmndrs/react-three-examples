import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js'
import { extend } from '@react-three/fiber/webgpu'

// Register the shared addon once so examples can use <teapotGeometry /> directly.
extend({ TeapotGeometry })

export { TeapotGeometry }
