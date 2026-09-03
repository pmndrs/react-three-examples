import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { extend } from '@react-three/fiber/webgpu';

// Register the shared addon once so examples can use <marchingCubes /> directly.
extend({ MarchingCubes });

export { MarchingCubes };
