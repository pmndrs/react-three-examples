import { Line } from 'three/webgpu';
import { extend } from '@react-three/fiber/webgpu';

// Workaround for fiber 10.0.0-alpha.4: `<threeLine>` resolves to THREE.Line on MOUNT
// (`createInstance` strips the `three` prefix) but `commitUpdate` validates the RAW name,
// so the first re-render of any parent throws "ThreeLine is not part of the THREE
// namespace" and unmounts the Canvas. Registering the prefixed name makes both paths
// agree. Import it wherever `<threeLine>` is used; delete when fiber fixes commitUpdate.
extend({ ThreeLine: Line });
