// Six three.js exporter addons behind one function. Each has a genuinely different
// API shape — GLTFExporter/USDZExporter are promise-based (`parseAsync`), STLExporter/
// OBJExporter are synchronous, PLYExporter is callback-based — this just normalises
// them all to "await exportMesh(...), then a file downloads."
import type { Object3D } from 'three/webgpu';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { PLYExporter } from 'three/addons/exporters/PLYExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';
import * as WebGPUTextureUtils from 'three/addons/utils/WebGPUTextureUtils.js';

export const FORMATS = {
  'glTF (JSON)': 'gltf',
  'glTF (binary)': 'glb',
  USDZ: 'usdz',
  'PLY (ASCII)': 'ply-ascii',
  'PLY (binary)': 'ply-binary',
  'STL (ASCII)': 'stl-ascii',
  'STL (binary)': 'stl-binary',
  OBJ: 'obj',
} as const;
export type ExportFormat = (typeof FORMATS)[keyof typeof FORMATS];

// Original's `save()`/`saveString()`/`saveArrayBuffer()`, common to every one of the
// six originals — an offscreen `<a>` + `URL.createObjectURL` is the only way to
// trigger a browser file save, so this stays exactly as imperative as they are.
function download(data: BlobPart, type: string, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([data], { type }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// `scene` is what GLTF/OBJ/USDZ export (whole-scene formats); `mesh` is what PLY/STL
// export (the originals hand them a single object, not a scene graph).
export async function exportMesh(format: ExportFormat, scene: Object3D, mesh: Object3D) {
  switch (format) {
    case 'gltf': {
      const result = await new GLTFExporter().setTextureUtils(WebGPUTextureUtils).parseAsync(scene, { binary: false });
      download(JSON.stringify(result, null, 2), 'application/json', 'scene.gltf');
      break;
    }
    case 'glb': {
      const result = await new GLTFExporter().setTextureUtils(WebGPUTextureUtils).parseAsync(scene, { binary: true });
      download(result as ArrayBuffer, 'application/octet-stream', 'scene.glb');
      break;
    }
    case 'usdz': {
      const exporter = new USDZExporter();
      exporter.setTextureUtils(WebGPUTextureUtils);
      const result = await exporter.parseAsync(scene);
      download(result, 'model/vnd.usdz+zip', 'scene.usdz');
      break;
    }
    case 'ply-ascii':
      new PLYExporter().parse(mesh, (result) => download(result, 'text/plain', 'mesh.ply'));
      break;
    case 'ply-binary':
      new PLYExporter().parse(mesh, (result) => download(result, 'application/octet-stream', 'mesh.ply'), {
        binary: true,
      });
      break;
    case 'stl-ascii':
      download(new STLExporter().parse(mesh), 'text/plain', 'mesh.stl');
      break;
    case 'stl-binary':
      download(new STLExporter().parse(mesh, { binary: true }), 'application/octet-stream', 'mesh.stl');
      break;
    case 'obj':
      download(new OBJExporter().parse(scene), 'text/plain', 'scene.obj');
      break;
  }
}
