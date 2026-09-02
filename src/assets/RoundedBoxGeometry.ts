import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { extend } from '@react-three/fiber/webgpu';

// Register the shared addon once so examples can use <roundedBoxGeometry /> directly.
extend({ RoundedBoxGeometry });

export { RoundedBoxGeometry };
