// GitHub Pages serves static files with no server-side rewrite, so a deep link
// (`/examples/lights-phong`) 404s unless a `404.html` exists — Pages serves that file
// (unmodified, same status 404) for any unknown path, and because it's byte-identical to
// `index.html` the SPA boots and react-router's `<BrowserRouter>` takes over from the
// URL the browser already has. Runs as a `postbuild` (package.json) so it's part of every
// `pnpm build`, not just the deploy workflow's. Docs: docs/SITE.md "Deploy".
import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const distDir = fileURLToPath(new URL('../dist', import.meta.url));

await copyFile(`${distDir}/index.html`, `${distDir}/404.html`);
console.log('spa-fallback: dist/index.html -> dist/404.html');
