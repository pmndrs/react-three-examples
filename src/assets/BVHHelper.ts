import { extend } from '@react-three/fiber/webgpu';
import { BVHHelper } from 'three-mesh-bvh';

// Register three-mesh-bvh's BVHHelper once so examples can write <bVHHelper /> — the
// element name lowercases only the first character of the class (AGENTS.md § R3F v10
// idioms). It is a Group that draws the bounds tree of the mesh/BVH it is given; call
// `.update()` after construction or a depth change to (re)build the boxes.
extend({ BVHHelper });

export { BVHHelper };
