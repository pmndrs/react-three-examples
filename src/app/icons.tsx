// Brand marks for the action bar, inline as SVG paths.
//
// No icon dependency: six glyphs do not justify a package, and inlining keeps them
// styleable with `currentColor` so the whole row inherits its hover state from the
// anchor. Each is drawn on a 24x24 viewBox and rendered at 14px in the titleblock.
//
// Marks are simplified single-path renderings of each product's logo, traced to read
// clearly at 14px rather than to be pixel-exact reproductions of the brand asset.

type IconProps = { className?: string };

const base = 'h-3.5 w-3.5';

export function GitHubIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .5C5.73.5.98 5.24.98 11.52c0 4.86 3.15 8.98 7.52 10.43.55.1.75-.24.75-.53l-.01-1.87c-3.06.67-3.71-1.47-3.71-1.47-.5-1.28-1.22-1.62-1.22-1.62-1-.68.08-.67.08-.67 1.1.08 1.69 1.14 1.69 1.14.98 1.69 2.58 1.2 3.21.92.1-.71.39-1.2.7-1.48-2.44-.28-5.01-1.22-5.01-5.45 0-1.2.43-2.19 1.13-2.96-.11-.28-.49-1.4.11-2.92 0 0 .93-.3 3.05 1.13a10.5 10.5 0 0 1 5.55 0c2.12-1.43 3.04-1.13 3.04-1.13.61 1.52.23 2.64.12 2.92.71.77 1.13 1.76 1.13 2.96 0 4.24-2.58 5.17-5.03 5.44.4.34.75 1.01.75 2.05l-.01 3.04c0 .29.2.64.76.53a11.03 11.03 0 0 0 7.51-10.43C23.02 5.24 18.27.5 12 .5Z" />
    </svg>
  );
}

export function StackBlitzIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M10.02 14.5H3.4L14.87 1.2l-1.2 8.3h6.62L8.82 22.8l1.2-8.3Z" />
    </svg>
  );
}

// VS Code's mark, used for the vscode.dev link.
export function VSCodeIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.86 1.4 10.9 8.02 6.7 4.84l-1.6.74 3.5 3.86-3.5 3.86 1.6.74 4.2-3.18 6.96 6.62 4.2-1.9V3.3l-4.2-1.9ZM17.9 6.1v7.6l-4.6-3.8 4.6-3.8Z" />
    </svg>
  );
}

// GitHub Codespaces — the mark reads as a code window, distinct from the GitHub cat.
export function CodespacesIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path
        d="M8.5 9.5 6 11.5l2.5 2M15.5 9.5 18 11.5l-2.5 2M2.5 20.5h19"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Claude's asterisk mark.
export function ClaudeIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 1.8c.63 0 1.14.5 1.14 1.13v5.3l3.75-3.75a1.13 1.13 0 1 1 1.6 1.6l-3.74 3.74h5.29a1.13 1.13 0 1 1 0 2.27h-5.3l3.75 3.75a1.13 1.13 0 0 1-1.6 1.6l-3.75-3.74v5.29a1.13 1.13 0 1 1-2.27 0v-5.3l-3.75 3.75a1.13 1.13 0 1 1-1.6-1.6l3.74-3.75H2.97a1.13 1.13 0 0 1 0-2.27h5.29L4.52 6.1a1.13 1.13 0 0 1 1.6-1.6l3.75 3.74V2.93c0-.62.5-1.13 1.13-1.13Z" />
    </svg>
  );
}

// Cursor's cursor/prism mark.
export function CursorIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 1.6 22 7.3v9.4L12 22.4 2 16.7V7.3L12 1.6Zm0 2.6L4.3 8.6v6.8L12 19.8l7.7-4.4V8.6L12 4.2Z" />
      <path d="m12 6.4 5.6 3.2v4.8L12 17.6l-5.6-3.2V9.6L12 6.4Z" opacity=".55" />
    </svg>
  );
}
