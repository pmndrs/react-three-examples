// The hierarchical depth pyramid: one compute kernel per level folds the scene depth
// down by 2x2, keeping the FARTHEST sample, and the cull test asks it whether a
// bounding sphere is hidden. Both halves live here because they have to agree on the
// packing — every level of the pyramid shares one storage buffer.
import {
  ceil,
  clamp,
  float,
  Fn,
  If,
  instanceIndex,
  int,
  length,
  log2,
  max,
  screenSize,
  uint,
  uvec2,
  vec4,
} from 'three/tsl';
import type { Node, StorageBufferNode, TextureNode, UniformArrayNode } from 'three/webgpu';

/** Enough levels for any drawing buffer: level 0 is half resolution, then 2x2 folds. */
export const MAX_HZB_LEVELS = 16;

/** Pyramid geometry for a drawing buffer: [texelOffset, width, height] per level. */
export function hzbLevels(bufferWidth: number, bufferHeight: number) {
  const levels: [number, number, number][] = [];
  let width = Math.ceil(bufferWidth / 2);
  let height = Math.ceil(bufferHeight / 2);
  let texels = 0;

  while (levels.length < MAX_HZB_LEVELS) {
    levels.push([texels, width, height]);
    texels += width * height;
    if (width === 1 && height === 1) break;
    width = Math.max(1, Math.ceil(width / 2));
    height = Math.max(1, Math.ceil(height / 2));
  }
  return { levels, texels };
}

/**
 * Typed TSL has no integer `min` (AGENTS.md) — the float round-trip is exact for texel
 * coordinates, which are nowhere near 2^24.
 */
export const uintMin = (a: Node<'uint'>, b: Node<'uint'>) => uint(float(a).min(float(b)));

export interface DepthPyramidProps {
  /** [texelOffset, width, height] per level, rewritten on resize. */
  uHzbLevels: UniformArrayNode<'vec4'>;
  uHzbLevelCount: Node<'float'>;
  /** The scene target's depth — the source for level 0. */
  uSceneDepth: TextureNode<'vec4'>;
  hzbBuffer: StorageBufferNode<'float'>;
  hzbRead: StorageBufferNode<'float'>;
}

export interface SphereOcclusionProps extends Pick<DepthPyramidProps, 'uHzbLevels' | 'uHzbLevelCount' | 'hzbRead'> {
  /** LAST frame's camera — the pyramid the test reads was built from last frame. */
  uPrevCameraPos: Node<'vec3'>;
  uPrevProjScreen: Node<'mat4'>;
  uCotHalfFov: Node<'float'>;
  uOcclusionBias: Node<'float'>;
}

/** One kernel per level, each folding the 2x2 below it. */
export function buildHzbKernels(
  { uHzbLevels, uSceneDepth, hzbBuffer }: DepthPyramidProps,
  levels: [number, number, number][],
) {
  return Array.from({ length: MAX_HZB_LEVELS }, (_, k) => {
    const [, initialWidth, initialHeight] = levels[Math.min(k, levels.length - 1)];

    return Fn(() => {
      const info = uHzbLevels.element(k);
      const levelOffset = uint(info.x);
      const levelWidth = uint(info.y);
      const levelHeight = uint(info.z);

      If(instanceIndex.lessThan(levelWidth.mul(levelHeight)), () => {
        const x = instanceIndex.mod(levelWidth);
        const y = instanceIndex.div(levelWidth);
        const sourceX = x.mul(2);
        const sourceY = y.mul(2);
        const farthest = float(0).toVar();

        // Which level to fold FROM is compile-time data, so this branch is a JS if.
        if (k === 0) {
          const maxX = uint(screenSize.x).sub(1);
          const maxY = uint(screenSize.y).sub(1);
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const sample = uSceneDepth.load(uvec2(uintMin(sourceX.add(dx), maxX), uintMin(sourceY.add(dy), maxY))).r;
              farthest.assign(max(farthest, sample));
            }
          }
        } else {
          const source = uHzbLevels.element(k - 1);
          const sourceOffset = uint(source.x);
          const sourceWidth = uint(source.y);
          const maxX = sourceWidth.sub(1);
          const maxY = uint(source.z).sub(1);
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const tx = uintMin(sourceX.add(dx), maxX);
              const ty = uintMin(sourceY.add(dy), maxY);
              farthest.assign(max(farthest, hzbBuffer.element(sourceOffset.add(ty.mul(sourceWidth)).add(tx))));
            }
          }
        }

        hzbBuffer.element(levelOffset.add(y.mul(levelWidth)).add(x)).assign(farthest);
      });
    })().compute(initialWidth * initialHeight, [64]);
  });
}

/**
 * Conservative sphere-vs-pyramid test: pick the level where the sphere's diameter fits
 * one texel, so a 2x2 window always covers it.
 */
export function createSphereOcclusionTest({
  uHzbLevels,
  uHzbLevelCount,
  hzbRead,
  uPrevCameraPos,
  uPrevProjScreen,
  uCotHalfFov,
  uOcclusionBias,
}: SphereOcclusionProps) {
  return (center: Node<'vec3'>, radius: Node<'float'>) => {
    const toCamera = uPrevCameraPos.sub(center);
    const cameraDistance = length(toCamera);

    // The point on the sphere nearest the camera is its shallowest depth.
    const nearPoint = center.add(toCamera.div(cameraDistance).mul(radius));
    const nearClip = uPrevProjScreen.mul(vec4(nearPoint, 1));
    const centerClip = uPrevProjScreen.mul(vec4(center, 1));
    const nearestZ = nearClip.z.div(nearClip.w);
    const ndc = centerClip.xy.div(centerClip.w);

    // The 4 combines the NDC half-screen factor with the half-resolution pyramid.
    const radiusTexels = radius.mul(uCotHalfFov).mul(float(screenSize.y)).div(4).div(cameraDistance);
    const level = int(clamp(ceil(log2(max(radiusTexels.mul(2), 1))), 0, uHzbLevelCount.sub(1)));

    const info = uHzbLevels.element(level);
    const levelOffset = uint(info.x);
    const levelWidth = uint(info.y);
    const levelHeight = uint(info.z);

    const px = ndc.x.mul(0.5).add(0.5).mul(float(levelWidth));
    const py = float(0.5).sub(ndc.y.mul(0.5)).mul(float(levelHeight));

    const x0 = uint(clamp(px.sub(0.5), 0, float(levelWidth.sub(1))));
    const y0 = uint(clamp(py.sub(0.5), 0, float(levelHeight.sub(1))));
    const x1 = uintMin(x0.add(1), levelWidth.sub(1));
    const y1 = uintMin(y0.add(1), levelHeight.sub(1));
    const at = (x: Node<'uint'>, y: Node<'uint'>) => hzbRead.element(levelOffset.add(y.mul(levelWidth)).add(x));

    const farthestZ = max(max(at(x0, y0), at(x1, y0)), max(at(x0, y1), at(x1, y1)));

    return cameraDistance
      .greaterThan(radius.mul(2)) // spheres around the camera are never occluded
      .and(nearClip.w.greaterThan(0))
      .and(centerClip.w.greaterThan(0))
      .and(nearestZ.greaterThan(farthestZ.add(uOcclusionBias)));
  };
}
