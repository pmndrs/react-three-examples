import { Suspense, useEffect, useState, type ComponentType } from 'react';
import type { ExampleMeta } from './manifest';
import { Titleblock } from './Titleblock';
import { CodePanel } from './CodePanel';
import { useDocumentMeta } from './useDocumentMeta';

// Per-example route element: the live demo, its titleblock overlay, and the "Code"
// toggle (ROADMAP R4) that opens a read-only source panel over the canvas. Broken out
// of App.tsx once it needed local state (`codeOpen`) — the route map itself stays a
// plain list of <Route>s.
export function ExamplePage({ meta, Component }: { meta: ExampleMeta; Component: ComponentType }) {
  const [codeOpen, setCodeOpen] = useState(false);
  useDocumentMeta(meta);

  // leva mounts into its own portal at a very high z-index (see contact-sheet.mjs,
  // which hides it the same way for screenshots), so the code panel — a normal
  // in-tree element — can never out-stack it with z-index alone. Hide it for the
  // duration the panel is open instead; it reappears the moment the panel closes.
  useEffect(() => {
    if (!codeOpen) return;
    const style = document.createElement('style');
    style.textContent = '[class^="leva"], [class*=" leva"] { display: none !important; }';
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [codeOpen]);

  return (
    <div className="relative h-full w-full">
      <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading…</div>}>
        <Component />
      </Suspense>
      <Titleblock meta={meta} />
      {/* `data-chrome-overlay` (here and on Titleblock) is a stable hook scripts/thumbs.mjs
          hides before capturing a gallery thumbnail — the shell UI, not the demo. */}
      <button
        type="button"
        onClick={() => setCodeOpen((open) => !open)}
        aria-pressed={codeOpen}
        data-chrome-overlay
        className="absolute top-4 left-4 z-10 rounded-md border border-white/10 bg-neutral-950/70 px-3 py-1.5 font-mono text-xs font-medium text-neutral-200 backdrop-blur-sm transition-colors hover:border-neutral-500 hover:text-white">
        {codeOpen ? 'Close' : '</> Code'}
      </button>
      {codeOpen && <CodePanel slug={meta.slug} onClose={() => setCodeOpen(false)} />}
    </div>
  );
}
