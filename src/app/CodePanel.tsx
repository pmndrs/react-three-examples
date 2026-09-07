import { useEffect, useMemo, useState } from 'react';
import { githubBlobUrl } from './agentLinks';
import { getExampleSourceFiles } from './exampleSources';

// Read-only source viewer for the example page's "Code" toggle (ROADMAP R4). Sources
// are loaded lazily via `import.meta.glob(..., { query: '?raw' })` — see
// `exampleSources.ts` — so opening the panel is the first time any file's text is
// fetched, and switching tabs on a multi-file example fetches only the tab you click.
//
// No syntax highlighter: none of this repo's dependencies provide one, and adding
// shiki/prismjs for a single read-only pane felt like more than this needed — see
// docs/SITE.md for the tradeoff if that changes.
export function CodePanel({ slug, onClose }: { slug: string; onClose: () => void }) {
  const files = useMemo(() => getExampleSourceFiles(slug), [slug]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  // A new slug means a new file set — reset the tab and cache rather than carrying
  // stale source across examples.
  useEffect(() => {
    setActiveIndex(0);
    setSources({});
  }, [slug]);

  const activeFile = files[activeIndex];

  useEffect(() => {
    if (!activeFile || activeFile.path in sources) return;
    let cancelled = false;
    activeFile.load().then((text) => {
      if (!cancelled) setSources((prev) => ({ ...prev, [activeFile.path]: text }));
    });
    return () => {
      cancelled = true;
    };
  }, [activeFile, sources]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!activeFile) return null;
  const source = sources[activeFile.path];
  const lines = source !== undefined ? source.split('\n') : [];

  async function handleCopy() {
    if (source === undefined) return;
    await navigator.clipboard.writeText(source);
    setCopied(true);
  }

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-xl flex-col border-l border-neutral-800 bg-neutral-950/95 text-neutral-100 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-2 py-1.5">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {files.map((file, index) => (
            <button
              key={file.path}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`shrink-0 rounded px-2 py-1 font-mono text-xs transition-colors ${
                index === activeIndex ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'
              }`}>
              {file.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close code view"
          className="shrink-0 rounded px-2 py-1 text-base leading-none text-neutral-500 hover:bg-neutral-900 hover:text-white">
          ×
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-3 py-1.5">
        <a
          href={githubBlobUrl(activeFile.path)}
          target="_blank"
          rel="noreferrer"
          className="truncate font-mono text-[11px] text-neutral-500 hover:text-neutral-300 hover:underline">
          {activeFile.path} ↗
        </a>
        <button
          type="button"
          onClick={handleCopy}
          disabled={source === undefined}
          className="shrink-0 rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white disabled:opacity-40">
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {source === undefined ? (
          <p className="p-4 text-xs text-neutral-600">Loading…</p>
        ) : (
          <pre className="w-max min-w-full font-mono text-[12px] leading-5">
            {lines.map((line, index) => (
              <div key={index} className="flex hover:bg-white/[0.03]">
                <span className="sticky left-0 w-11 shrink-0 select-none bg-neutral-950 px-2 text-right text-neutral-700">
                  {index + 1}
                </span>
                <span className="px-2 whitespace-pre text-neutral-300">{line.length > 0 ? line : ' '}</span>
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}
