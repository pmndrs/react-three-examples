import { SkyMesh } from 'three/addons/objects/SkyMesh.js'
import { extend } from '@react-three/fiber/webgpu'

// Register the shared addon once so examples can use <skyMesh /> directly.
extend({ SkyMesh })

export { SkyMesh }
