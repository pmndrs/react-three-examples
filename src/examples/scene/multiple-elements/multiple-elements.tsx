/**
 * multiple-elements
 * Forty independent scenes drawn into ONE real canvas: a scrollable list of plain
 * `<div>` placeholders, each backed by its own scene/camera pair rendered into that
 * div's exact on-screen rectangle every frame.
 * Original: https://threejs.org/examples/#webgpu_multiple_elements (~160 lines of JS)
 *
 * DEMONSTRATES
 * - A full render-takeover (`{ phase: 'render' }`) that clears the canvas once, then
 *   loops forty scenes, computing each placeholder `<div>`'s `getBoundingClientRect()`
 *   and drawing that scene into exactly that viewport/scissor rect — the technique
 *   `lines-fat/InsetView.tsx` uses for ONE inset, scaled up to forty independent panes
 *   sharing one canvas (`MultiViewport.tsx`)
 * - Per-scene `OrbitControls` bound to that scene's own placeholder `<div>` (not the
 *   shared canvas every scene draws into) — genuinely imperative, since there is no
 *   single "the scene" here for a declarative camera-controls component to attach to
 * - Off-screen culling against the CANVAS's own bounding rect, so scrolled-away list
 *   items are skipped without ever being rendered
 *
 * DIVERGENCE from original
 * - The canvas is pinned (`position: absolute; inset: 0`) inside its own container and
 *   the placeholder list scrolls in an independent `overflow-y: auto` overlay above
 *   it, instead of the original's single-canvas-plus-body-scroll approach (this repo's
 *   shell has no page-level scroll to hook). Because the canvas never moves, the
 *   original's `canvas.style.transform = translateY(scrollY)` re-alignment hack isn't
 *   needed — the per-frame `getBoundingClientRect()` math already stays correct
 * - `setViewport`/`setScissor` Y is TOP-origin on WebGPU (AGENTS.md) — the original's
 *   own math already uses `rect.top` directly with no bottom-origin flip, so it was
 *   already correct here; nothing to fix (contrast `lines-fat/InsetView.tsx`, where the
 *   original DOES need the flip)
 * - Only the first placeholder is inside the automated smoke/screenshot tiers' reach —
 *   `MultiViewport.tsx`'s header notes the same half-verified caveat as
 *   `multiple-canvas.tsx`; checked by hand in the browser (scroll + per-item drag)
 */
import { useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber/webgpu';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { MultiViewport } from './MultiViewport';

const SCENE_COUNT = 40;

export default function MultipleElements() {
  const itemRefs = useRef<(HTMLDivElement | null)[]>(Array(SCENE_COUNT).fill(null));
  const [items] = useState(() => Array.from({ length: SCENE_COUNT }, (_, i) => i));

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {/* No `background` prop — MultiViewport's render takeover owns clearing (the
            Canvas's own default scene is never rendered at all). */}
        <Canvas renderer>
          <MultiViewport itemRefs={itemRefs} count={SCENE_COUNT} />
          <DemoHelpers grid={false} controls={false} />
        </Canvas>
      </div>

      <div style={{ position: 'relative', height: '100%', overflowY: 'auto', padding: '3em 1em 1em', zIndex: 1 }}>
        {items.map((i) => (
          <div
            key={i}
            style={{
              display: 'inline-block',
              margin: '1em',
              padding: '1em',
              boxShadow: '1px 2px 4px 0px rgba(0,0,0,0.25)',
            }}>
            <div
              ref={(element) => {
                itemRefs.current[i] = element;
              }}
              style={{ width: 200, height: 200 }}
            />
            <div style={{ marginTop: '0.5em', width: 200, font: 'large sans-serif', color: '#888' }}>Scene {i + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
