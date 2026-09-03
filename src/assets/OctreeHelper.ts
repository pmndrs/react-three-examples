import { OctreeHelper } from 'three/addons/helpers/OctreeHelper.js';
import { extend } from '@react-three/fiber/webgpu';

// Register the shared addon once so examples can use <octreeHelper /> directly.
extend({ OctreeHelper });

export { OctreeHelper };
