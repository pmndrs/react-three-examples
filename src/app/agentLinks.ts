// URL builders for the action bar's "open in ..." row (SPEC §9, research/agent-open-buttons.md).
// Every link here is a pure client-side template from {owner, repo, branch, path} — no
// backend, matching the static-hosting shape research/agent-open-buttons.md assumes.
// Picks from that survey's v1 recommendation: GitHub source (table stakes) + the two
// zero-auth "poke at the code" targets (StackBlitz, vscode.dev) + Claude Code (the one
// mechanism with a documented, stable prompt+repo query string) + Cursor (best-effort,
// prompt-only deeplink) + Codespaces (official badge pattern, near-zero cost to add).
// Explicitly NOT built: OpenAI Codex (no URL-launch scheme exists) and CodeSandbox
// (repo imports shut down April 2026) — see the research doc for the reasoning.

export const REPO_OWNER = 'pmndrs';
export const REPO_NAME = 'react-three-examples';
export const REPO_BRANCH = 'main';
const REPO_SLUG = `${REPO_OWNER}/${REPO_NAME}`;

export const repoUrl = `https://github.com/${REPO_SLUG}`;

export function githubBlobUrl(path: string): string {
  return `${repoUrl}/blob/${REPO_BRANCH}/${path}`;
}

// StackBlitz's github importer takes a directory, not a file — the containing folder
// is the closest we can point it at (a flat single-file example's "folder" is just
// src/examples, which still opens the right project; a folder-based example's own
// slug folder is a precise target).
// NOTE: StackBlitz has excellent subfolder support, but that is for MONOREPOS where the
// subfolder is itself a project. This repo is ONE Vite app — `src/examples/<category>/`
// has no package.json, so a /tree/<subfolder> link boots nothing. Open the repo root and
// use `?file=` to focus the example instead.
export function stackblitzUrl(path: string): string {
  return `https://stackblitz.com/github/${REPO_SLUG}/tree/${REPO_BRANCH}?file=${encodeURIComponent(path)}`;
}

export function vscodeDevUrl(path: string): string {
  return `https://vscode.dev/github/${REPO_SLUG}/blob/${REPO_BRANCH}/${path}`;
}

export function codespacesUrl(): string {
  return `https://codespaces.new/${REPO_SLUG}?quickstart=1`;
}

function starterPrompt(title: string, path: string): string {
  return `In ${path}, explain how the "${title}" R3F v10 / WebGPU example works and suggest one enhancement, following this repo's house style (see AGENTS.md).`;
}

// Officially documented prefill params (research/agent-open-buttons.md): `repositories`
// targets the repo, `prompt` carries the starter prompt. No subfolder param exists, so
// the path lives in the prompt text itself.
export function claudeCodeUrl(title: string, path: string): string {
  const params = new URLSearchParams({ repositories: REPO_SLUG, prompt: starterPrompt(title, path) });
  return `https://claude.ai/code?${params.toString()}`;
}

// The `cursor://` deeplink is prompt-text-only — no repo/path params exist, so the
// clone URL and target file have to be spelled out inside the prompt itself.
export function cursorUrl(title: string, path: string): string {
  const prompt = `Clone ${repoUrl}, open ${path}, and explain how the "${title}" R3F v10 / WebGPU example works.`;
  return `cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(prompt)}`;
}
