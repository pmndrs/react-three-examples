import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { extend } from '@react-three/fiber/webgpu';

// Register the shared addon once so examples can use <convexGeometry /> directly.
extend({ ConvexGeometry });

export { ConvexGeometry };
