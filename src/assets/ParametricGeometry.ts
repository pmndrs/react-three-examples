import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { extend } from '@react-three/fiber/webgpu';

// Register the shared addon once so examples can use <parametricGeometry /> directly.
extend({ ParametricGeometry });

export { ParametricGeometry };
