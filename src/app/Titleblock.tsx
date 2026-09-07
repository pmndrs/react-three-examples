import type { ExampleMeta } from './manifest';
import { exampleFilePaths } from './routes';
import { githubBlobUrl, stackblitzUrl, vscodeDevUrl, codespacesUrl, claudeCodeUrl, cursorUrl } from './agentLinks';
import { GitHubIcon, StackBlitzIcon, VSCodeIcon, CodespacesIcon, ClaudeIcon, CursorIcon } from './icons';

// Standard per-example titleblock — shell-level DOM overlay, not in-canvas furniture.
// Driven entirely by examples.json (+ the routes glob, for the source path) so ports
// get it for free. Sits on top of a live WebGPU canvas, so it stays small: a title
// row plus one row of icon "open in ..." buttons rather than a labeled toolbar.
export function Titleblock({ meta }: { meta: ExampleMeta }) {
  const path = exampleFilePaths.get(meta.slug);

  return (
    <div
      data-chrome-overlay
      className="pointer-events-none absolute bottom-4 left-4 z-10 flex max-w-xs flex-col gap-2 rounded-lg border border-white/10 bg-neutral-950/70 px-3.5 py-2.5 backdrop-blur-sm">
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
          <ActionLink href={githubBlobUrl(path)} title="View source on GitHub">
            <GitHubIcon />
          </ActionLink>
          <ActionLink href={stackblitzUrl(path)} title="Open in StackBlitz">
            <StackBlitzIcon />
          </ActionLink>
          <ActionLink href={vscodeDevUrl(path)} title="Open in vscode.dev">
            <VSCodeIcon />
          </ActionLink>
          <ActionLink href={codespacesUrl()} title="Open in GitHub Codespaces">
            <CodespacesIcon />
          </ActionLink>
          <ActionLink href={claudeCodeUrl(meta.title, path)} title="Open in Claude Code">
            <ClaudeIcon />
          </ActionLink>
          {/* cursor:// is a custom protocol, not http(s) — no target/rel, or some
              browsers pair the OS-level protocol prompt with a stray blank tab. */}
          <ActionLink href={cursorUrl(meta.title, path)} title="Open in Cursor" external={false}>
            <CursorIcon />
          </ActionLink>
        </div>
      )}
    </div>
  );
}

function ActionLink({
  href,
  title,
  external = true,
  children,
}: {
  href: string;
  title: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      {...(external && { target: '_blank', rel: 'noreferrer' })}
      title={title}
      aria-label={title}
      className="grid h-7 w-7 shrink-0 place-items-center rounded text-white/60 transition-colors hover:bg-white/15 hover:text-white">
      {children}
    </a>
  );
}
