import { useEffect } from 'react';
import type { ExampleMeta } from './manifest';

// Site-wide defaults, also written statically into index.html for the crawler that
// never runs JS (see docs/SITE.md "OG / meta tags" — this hook only covers the
// client-side route change, not a crawler's first paint).
export const DEFAULT_TITLE = 'r3f-examples — React Three Fiber v10 ports of the three.js examples';
export const DEFAULT_DESCRIPTION =
  'WebGPU-first React Three Fiber v10 ports of the official three.js examples — the same demo, ' +
  'proving it reads clearer in idiomatic React than in vanilla three.js.';

/**
 * Keeps `document.title` and the `description`/`og:*` meta tags in sync with the
 * current route. react-router doesn't touch `<head>` itself, and this is a client-side
 * SPA with no per-route HTML — so without this every route shares index.html's static
 * tags. Call with no argument (or `undefined`) to reset to the site defaults (Home).
 */
export function useDocumentMeta(meta?: ExampleMeta): void {
  useEffect(() => {
    const title = meta ? `${meta.title} — r3f-examples` : DEFAULT_TITLE;
    const description = meta
      ? `A React Three Fiber v10 (WebGPU) port of the three.js "${meta.title}" example` +
        (meta.original ? ', ported from the official three.js gallery.' : '.')
      : DEFAULT_DESCRIPTION;

    document.title = title;
    setMetaTag('description', description);
    setMetaTag('og:title', title, 'property');
    setMetaTag('og:description', description, 'property');
    setMetaTag('twitter:title', title);
    setMetaTag('twitter:description', description);
  }, [meta]);
}

function setMetaTag(key: string, content: string, attr: 'name' | 'property' = 'name'): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}
