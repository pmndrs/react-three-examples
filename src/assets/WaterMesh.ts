import { WaterMesh } from 'three/addons/objects/Water2Mesh.js';
import { extend } from '@react-three/fiber/webgpu';

// Register the shared addon once so examples can use <waterMesh /> directly.
extend({ WaterMesh });

export { WaterMesh };
