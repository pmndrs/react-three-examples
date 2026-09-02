import type { ExampleMeta } from './manifest';
import { exampleFilePaths } from './routes';
import { githubBlobUrl, stackblitzUrl, vscodeDevUrl, codespacesUrl, claudeCodeUrl, cursorUrl } from './agentLinks';

// Standard per-example titleblock — shell-level DOM overlay, not in-canvas furniture.
// Driven entirely by examples.json (+ the routes glob, for the source path) so ports
// get it for free. Sits on top of a live WebGPU canvas, so it stays small: a title
// row plus one row of monogram "open in ..." buttons rather than a labeled toolbar.
export function Titleblock({ meta }: { meta: ExampleMeta }) {
  const path = exampleFilePaths.get(meta.slug);

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex max-w-xs flex-col gap-2 rounded-lg border border-white/10 bg-neutral-950/70 px-3.5 py-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        {/* Logo slot — placeholder mark until we have real art. */}
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/10 text-[10px] font-bold tracking-tight text-white/80">
          r3f
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-neutral-100">{meta.title}</h2>
          <p className="truncate text-xs text-neutral-400">
            {meta.original && (
              <a
                href={meta.original}
                target="_blank"
                rel="noreferrer"
                className="pointer-events-auto underline-offset-2 hover:text-white hover:underline">
                three.js original ↗
              </a>
            )}
            {meta.original && meta.credits && <span> · </span>}
            {meta.credits && <span>{meta.credits}</span>}
          </p>
        </div>
      </div>
      {path && (
        <div className="pointer-events-auto flex items-center gap-1">
          <ActionLink href={githubBlobUrl(path)} label="GH" title="View source on GitHub" />
          <ActionLink href={stackblitzUrl(path)} label="SB" title="Open in StackBlitz" />
          <ActionLink href={vscodeDevUrl(path)} label="VS" title="Open in vscode.dev" />
          <ActionLink href={codespacesUrl()} label="CS" title="Open in GitHub Codespaces" />
          <ActionLink href={claudeCodeUrl(meta.title, path)} label="CC" title="Open in Claude Code" />
          {/* cursor:// is a custom protocol, not http(s) — no target/rel, or some
              browsers pair the OS-level protocol prompt with a stray blank tab. */}
          <ActionLink href={cursorUrl(meta.title, path)} label="CX" title="Open in Cursor" external={false} />
        </div>
      )}
    </div>
  );
}

function ActionLink({
  href,
  label,
  title,
  external = true,
}: {
  href: string;
  label: string;
  title: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external && { target: '_blank', rel: 'noreferrer' })}
      title={title}
      aria-label={title}
      className="grid h-6 w-6 shrink-0 place-items-center rounded bg-white/10 text-[9px] font-bold tracking-tight text-white/70 transition-colors hover:bg-white/20 hover:text-white">
      {label}
    </a>
  );
}
