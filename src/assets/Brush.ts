import { extend } from '@react-three/fiber/webgpu';
import { Brush } from 'three-bvh-csg';

// Register three-bvh-csg's Brush (a Mesh subclass) once so examples can use <brush /> directly.
extend({ Brush });

export { Brush };
