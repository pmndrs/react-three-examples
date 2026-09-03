import type { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { LightProbeHelper } from 'three/addons/helpers/LightProbeHelperGPU.js';
import type { OctreeHelper } from 'three/addons/helpers/OctreeHelper.js';
import type { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import type { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import type { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js';
import type { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import type { WaterMesh } from 'three/addons/objects/Water2Mesh.js';
import type { ThreeElement } from '@react-three/fiber/webgpu';
import type { Brush } from 'three-bvh-csg';
import type { BVHHelper } from 'three-mesh-bvh';

declare module '@react-three/fiber' {
  interface ThreeElements {
    roundedBoxGeometry: ThreeElement<typeof RoundedBoxGeometry>;
    parametricGeometry: ThreeElement<typeof ParametricGeometry>;
    convexGeometry: ThreeElement<typeof ConvexGeometry>;
    brush: ThreeElement<typeof Brush>;
    teapotGeometry: ThreeElement<typeof TeapotGeometry>;
    skyMesh: ThreeElement<typeof SkyMesh>;
    waterMesh: ThreeElement<typeof WaterMesh>;
    lightProbeHelper: ThreeElement<typeof LightProbeHelper>;
    octreeHelper: ThreeElement<typeof OctreeHelper>;
    marchingCubes: ThreeElement<typeof MarchingCubes>;
    bVHHelper: ThreeElement<typeof BVHHelper>;
  }
}
