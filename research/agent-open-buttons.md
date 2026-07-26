# "Open in agent/IDE" buttons — mechanisms survey (July 2026)

Research for the gallery site's per-example action row (see `docs/SPEC.md` §2: "per-example
links (source, original example, open-in-agent)"). Our shape: **single public repo on GitHub
Pages, each example is a file or folder inside it** (e.g. `examples/webgpu-instancing/`). We
want a button row that hands an agent/IDE the example's code plus a starter prompt, with as
little setup friction as possible.

All URL patterns below were verified against current docs/changelogs as of 2026-07-26, not
recalled from training data — sources are inline.

## Comparison table

| Tool | Link mechanism | Carries a prompt? | Targets a subfolder? | Auth needed? | Reliability (2026) |
|---|---|---|---|---|---|
| **Cursor** | `cursor://anysphere.cursor-deeplink/prompt?text=...` (native protocol; web mirror `https://cursor.com/link/...`) | Yes — prompt text only, pre-filled into chat, user must hit send | No — prompt can *tell* the agent to clone/open a repo, but the deeplink itself has no repo/URL param | Cursor must be installed; no login needed to open, but agent actions need Cursor's own auth | Medium. Requires Cursor installed + protocol handler registered. Max URL length 8,000 chars. Cursor has shipped security hardening after 2026 "CursorJack"/"DeepJack" deeplink-abuse disclosures — links now require explicit user confirmation before executing, which is good for us (no silent RCE risk from a link on our own site) but means it's never a true one-click |
| **OpenAI Codex** | No documented public URL-launch scheme. `chatgpt.com/codex` is the entry point; tasks are tied server-side to a pre-configured `environment_id` bound to a specific repo (set up manually in the Codex UI first) | Not via URL | Not via URL — environments are per-repo, not per-subfolder | Full ChatGPT login + a pre-existing Codex "environment" for the target repo | Low for our use case. Nothing to link to without the visitor already having a Codex environment provisioned for our repo. Best we can do is a plain link to `https://chatgpt.com/codex` with instructions, not a working deep link |
| **Claude Code (claude.ai/code)** | `https://claude.ai/code?prompt=...&repositories=owner/repo` — **officially documented** pre-fill query params | Yes — `prompt` (alias `q`) or `prompt_url` (fetches long prompt text cross-origin) | Not natively — `repositories` takes `owner/repo` only, no subpath. Workaround: put the subfolder instruction in the prompt text itself ("work only in examples/X") | Yes — visitor needs a claude.ai account connected to GitHub (Pro/Max/Team/Enterprise) with the repo accessible; first-time users get an onboarding/GitHub-connect flow before the prefilled session opens | High — this is a shipped, documented feature (not a proposal). Params: `prompt`/`q`, `prompt_url`, `repositories`/`repo`, `environment`. All URL-encoded, non-executing (user still clicks "start") |
| **VS Code (desktop)** | `vscode://vscode.git/clone?url=https://github.com/owner/repo` opens VS Code and runs a git clone (well-established, widely used clone-URI); a true one-shot "open subfolder + run Copilot with prompt" deep link is **not** a shipped feature — related issues are open feature requests, not implemented | No | No (clone only; subfolder open needs a second manual step) | VS Code installed locally; GitHub auth handled by VS Code's own Git/Copilot login | High for the clone step, but it only gets you a clone — no prompt injection into Copilot Chat via URL |
| **VS Code for the Web / github.dev** | `https://vscode.dev/github/owner/repo` or the classic `https://github.dev/owner/repo` (swap `.com`→`.dev`, or press `.` on any GitHub repo page) | No | Partially — you can deep-link to a path within the repo in the VS Code web UI (`.../blob/branch/path`), but it opens the whole repo workspace with that file focused, not a scoped subfolder session | GitHub login for private repos; none needed for public repos (read-only browsing; edits need auth) | High and zero-install — pure browser, no extension. No prompt/agent hook at all though; it's a code viewer/editor, not an agent launcher |
| **GitHub Codespaces** | Badge: `[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/owner/repo)` — official, documented, supports `?quickstart=1`, `ref=`, `devcontainer_path=` | No | Via `.devcontainer/<name>/devcontainer.json` + `devcontainer_path` param — picks a *devcontainer config*, not a working-directory subfolder per se | GitHub login required (Codespaces is a paid/quota'd GitHub feature) | High, official, stable — but it's a cloud VS Code instance, not an agent-with-a-prompt |
| **StackBlitz** | `https://stackblitz.com/github/owner/repo/tree/branch/path/to/subfolder` (path suffix is officially supported); fork variant `https://stackblitz.com/fork/github/...`; official badge: `[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/...)` | No | **Yes** — best-in-class subfolder support of any tool surveyed, plus `configPath=` for monorepos with nested `package.json` | None for public repos | Medium-high. Reliable for opening/running a Vite app instantly in-browser; known rough edges historically with large dependency trees / non-trivial build configs, worth a spot-check per example type. No agent/prompt integration — it's a live dev environment, not an AI agent |
| **CodeSandbox** | `https://codesandbox.io/p/github/owner/repo` (or legacy `/s/github/...`) | No | Historically yes via path suffix, but moot now | GitHub login for private repos | **Deprecated for our use case.** CodeSandbox stopped accepting new repo imports April 1, 2026, and ended full support July 1, 2026 (confirmed against today's date, 2026-07-26) — they're steering users to GitHub Codespaces instead. **Do not build a CodeSandbox button; the feature is dead.** |

## Concrete example URLs

Hypothetical repo: `github.com/<owner>/r3f-three-examples`, example folder
`examples/webgpu-instancing/`, starter prompt: *"Explain and extend this WebGPU instancing
example."*

```text
# Cursor — prompt only, no repo targeting; prompt must tell the agent what to clone
cursor://anysphere.cursor-deeplink/prompt?text=Clone%20https%3A%2F%2Fgithub.com%2F%3Cowner%3E%2Fr3f-three-examples%2C%20open%20examples%2Fwebgpu-instancing%2C%20and%20explain%20how%20instancing%20works%20here.

# Claude Code — officially supported prefill (repo-level only; subfolder goes in the prompt)
https://claude.ai/code?repositories=%3Cowner%3E%2Fr3f-three-examples&prompt=In%20examples%2Fwebgpu-instancing%2C%20explain%20how%20the%20WebGPU%20instancing%20works%20and%20suggest%20one%20enhancement.

# OpenAI Codex — no working deep link; best effort is a static link + instructions
https://chatgpt.com/codex

# VS Code desktop — clones only, no prompt/subfolder
vscode://vscode.git/clone?url=https://github.com/<owner>/r3f-three-examples

# VS Code for the Web — opens repo, browser-only, no install
https://vscode.dev/github/<owner>/r3f-three-examples/blob/main/examples/webgpu-instancing/index.tsx

# GitHub Codespaces — official badge pattern
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/<owner>/r3f-three-examples?quickstart=1)

# StackBlitz — subfolder-native, official badge pattern
[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/<owner>/r3f-three-examples/tree/main/examples/webgpu-instancing)

# CodeSandbox — DO NOT USE, service deprecated as of July 2026
```

## Precedents / prior art

- **GitHub Codespaces badge** is the cleanest, most copy-pasteable off-the-shelf pattern
  (`codespaces.new/{owner}/{repo}` + `badge.svg`), documented directly by GitHub, and GitHub's
  own repo UI has a "Share a deep link" generator that builds the URL/markdown for you.
- **StackBlitz's `img/open_in_stackblitz.svg`** badge is the equivalent for their product and
  is the only surveyed tool with genuinely first-class subfolder support baked into the URL
  path itself (`/tree/<branch>/<path>`) rather than a query param bolted on.
- **pmndrs/r3f ecosystem**: no evidence found of an existing "open in agent" button row on
  r3f docs, drei docs, or the official three.js examples site. The closest existing pattern
  is CodeSandbox's auto-generated `codesandbox.io/examples/package/react-three-fiber` gallery
  (search-indexed sandboxes, not a per-example button on a docs page) — and that surface is
  now going stale as CodeSandbox winds down repo imports.
- **No off-the-shelf "button row" component/library** was found for this specific
  multi-target pattern (Cursor + Codex + Claude + VS Code + Codespaces + StackBlitz all in one
  row). Every site that does this (Codespaces badge, StackBlitz badge, Vercel's "Deploy"
  button, etc.) ships its own single-target badge; assembling the row is on us. It's simple
  enough to hand-roll: a small array of `{label, icon, href}` entries rendered as a button
  group, one entry per mechanism, each computed from the current example's repo path.
- OpenAI does not publish a badge/button asset for Codex at all — there is nothing analogous
  to `badge.svg` for it as of this research.

## Recommended button set for v1

Rank by (reliability × usefulness) given our shape (public repo, subfolder-per-example,
static GitHub Pages site — no backend to mint tokens or proxy prompts):

1. **"View source" (plain GitHub link)** — not an agent button, but table-stakes; always
   works, zero auth, use as the anchor everyone else sits next to.
2. **Claude Code** — `claude.ai/code?repositories=...&prompt=...`. This is the only mechanism
   surveyed that officially supports *both* a real prompt *and* repo targeting via documented,
   stable query params. Ship this first; it's the highest-value button for "open in a coding
   agent with context."
3. **StackBlitz** — `stackblitz.com/github/.../tree/main/examples/<slug>`. No auth, genuinely
   opens the exact subfolder as a running Vite app in-browser. This is the best "just let me
   poke at the live code" button, complementary to Claude Code's "have an agent explain/extend
   it" button. Use their official badge asset.
4. **GitHub Codespaces** — `codespaces.new/<owner>/repo?quickstart=1`. Good fallback/parallel
   option for people who want a full VS Code cloud environment rather than StackBlitz's
   in-browser bundler; official badge asset, trivial to add alongside StackBlitz at near-zero
   cost.
5. **Cursor** — include as a "for Cursor users" link using the `prompt` deeplink, with the
   prompt text carrying both the repo URL and the subfolder instruction (since the deeplink
   itself can't target a repo/subfolder). Treat as best-effort/lower-priority: requires local
   Cursor install, and given the 2026 deeplink-abuse disclosures, don't be surprised if some
   users' Cursor installs prompt extra confirmation dialogs — that's expected, not broken.
6. **Skip for v1: OpenAI Codex, VS Code desktop clone link, CodeSandbox.** Codex has no
   working deep-link target without a visitor-side pre-provisioned environment (link would
   just dump people on a generic landing page). The VS Code clone URI only clones — no
   subfolder focus, no prompt — so it's strictly worse than the StackBlitz/Codespaces buttons
   for a "try this example" use case. CodeSandbox's repo-import feature is deprecated as of
   July 2026; do not build against it.

Implementation note: all of the v1 buttons (Claude Code, StackBlitz, Codespaces, Cursor) are
pure URL templates computable client-side from `{owner, repo, branch, examplePath}` — no
server/proxy needed, consistent with the static GitHub Pages hosting model.
