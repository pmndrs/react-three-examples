# Agent-Interface Options for the R3F Examples Gallery — Research (2026-07-26)

Question: how should this repo/site expose itself to coding agents (Claude Code, Cursor, Codex,
Copilot)? The SPEC.md §6 draft assumed llms.txt + an examples MCP endpoint, mirroring
docs.pmnd.rs, without validating against alternatives. This doc does that validation.

Three distinct consumers, kept separate throughout because the right mechanism differs per case:

- **(a) Web visitor** — an agent (or a human pasting a URL into one) browsing the *live site*,
  no repo access.
- **(b) Repo-cloned agent** — Claude Code / Cursor / Codex working locally inside a checkout.
- **(c) Transplant agent** — an agent in the *user's own, unrelated* project that wants to pull
  one example in.

---

## 1. llms.txt

**Status:** a private proposal (Jeremy Howard/Answer.AI, Sept 2024), not a ratified standard,
not adopted by any standards body. "Spec" is one Markdown convention, nothing more.

**Adoption:** an SE Ranking survey of ~300k domains found ~10% adoption, concentrated in
dev-tools/docs companies (Anthropic, Cloudflare, Vercel, Stripe, Mintlify, Perplexity, pmndrs).
Notably: the adopters are disproportionately AI/docs vendors signaling to each other, not a
broad web trend.

**Does anything actually fetch it? — this is the load-bearing question, and the evidence is bad:**

- Ahrefs analyzed 137,000 sites with llms.txt: **97% received zero requests** for the file
  (May 2026 measurement). [ahrefs.com/blog/llmstxt-study](https://ahrefs.com/blog/llmstxt-study)
- A separate 90-day study of 500M+ AI-bot visits found only **408** requests that targeted
  `/llms.txt` directly — statistical noise against total AI crawler traffic.
- GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, and Google-Extended overwhelmingly **skip
  the file and crawl HTML directly**.
- Google's Gary Illyes and John Mueller stated on record that Google does not support llms.txt
  and has no plans to; Mueller compared it to the discredited `keywords` meta tag and noted
  server logs show none of the major AI services even check for it.
- A machine-learning study on AI-citation frequency found that **removing llms.txt as a
  feature improved the model's prediction accuracy** — i.e., the file's presence correlates
  with *less* signal, not more.
- OpenAI/Anthropic/Perplexity all publish crawler guidance (robots.txt, user-agent behavior)
  but none say llms.txt is used to decide citations or answers.

**Verdict: mostly hype for the "passive crawler picks it up" use case.** It is not disproven as
a *fetchable artifact for an agent that is told to fetch it* — that's a different mechanism
(explicit tool call, not passive crawl) and there's no data either way on that narrower case.
docs.pmnd.rs (the precedent SPEC.md cites) does publish `llms.txt`/`llms-full.txt` per library
— confirmed live at `https://docs.pmnd.rs`, e.g. `https://pmndrs.github.io/react-three-fiber/llms.txt`
— but pmndrs *also* ships an MCP server as the primary agent interface (see §3); llms.txt there
reads as a low-cost fallback/export format, not the main bet.

**Recommendation:** generate it (cheap, mechanical, several Vite/static-site plugins do it for
free) but do not budget scarce effort here and do not expect it to move any needle on AI
discovery/citation. Its only real audience is (a)/(c): a human or agent explicitly pointed at
the URL who fetches it as a manifest/index — not a crawler that finds it unprompted.

Sources: [Ahrefs — 97% of llms.txt files get zero requests](https://ahrefs.com/blog/llmstxt-study) · [Mintlify — Breaking down the skepticism](https://www.mintlify.com/blog/what-is-llms-txt) · [Google says llms.txt does nothing for Search](https://baselinelabs.ai/blog/llms-txt-google-search) · [agenticmarketingnews.com — the llms.txt bet is dead](https://www.agenticmarketingnews.com/news/llms-txt-bet-is-dead) · [docs.pmnd.rs](https://docs.pmnd.rs)

---

## 2. AGENTS.md

**Status: the real de facto standard**, and much better evidenced than llms.txt.

- Proposed August 2025 by OpenAI's Codex team, with Sourcegraph/Amp, Google Jules, Cursor, and
  Factory as co-signers. Now stewarded by the **Linux Foundation's Agentic AI Foundation** —
  actual neutral governance, not one vendor's convention.
- **60,000+ public repositories** have adopted it. Natively read by Codex, Cursor, GitHub
  Copilot, Gemini CLI, Aider, Windsurf, Zed, Factory, Jules, Devin, VS Code, and 20+ other
  tools.
- **Claude Code does not read AGENTS.md natively.** It reads `CLAUDE.md` by its own convention.
  The documented workaround/pattern is to make the first line of `CLAUDE.md` be `@AGENTS.md`,
  using Claude Code's `@`-import syntax to pull AGENTS.md's contents in. This is a one-line fix,
  not a real gap, but it must be done deliberately — Claude Code is the one major agent that
  needs the extra line.
- **Cursor**: `.cursorrules` (single file) is fully legacy/deprecated (since ~v0.43, late 2024)
  in favor of `.cursor/rules/*.mdc` (directory, frontmatter-driven, glob-scoped, four activation
  modes). Cursor also now reads AGENTS.md natively as the portable baseline for simple cases,
  layering `.cursor/rules` on top for anything needing finer scoping.

**Verdict: proven, cheap, and the correct backbone for consumer (b).** Ship `AGENTS.md` at repo
root as the source of truth; make `CLAUDE.md` a thin file whose first line imports it, adding
only genuinely Claude-Code-specific content (skills pointers, permission notes) below the
import. Don't invest in `.cursorrules`/`.cursor/rules` beyond what AGENTS.md already covers
unless a Cursor-specific scoping need shows up later.

Sources: [AGENTS.md Complete Guide 2026](https://codersera.com/blog/agents-md-complete-guide-2026/) · [AGENTS.md vs CLAUDE.md vs Cursor Rules vs Copilot](https://codersera.com/blog/agents-md-vs-claude-md-vs-cursor-rules-comparison-2026/) · [.cursorrules is deprecated](https://www.flowql.com/en/blog/guides/cursor-rules-deprecated-libraries/)

---

## 3. MCP servers for docs/examples

**The docs.pmnd.rs precedent, confirmed directly** (fetched `https://docs.pmnd.rs`):

> "Browse these docs from your MCP-compatible client, e.g. claude-code:
> `claude mcp add --transport http pmndrs https://docs.pmnd.rs/api/mcp`"

Plus, independently, "Each lib also exposes its `llms.txt` / `llms-full.txt`" (e.g.
`https://pmndrs.github.io/react-three-fiber/llms.txt`). So pmndrs runs **both** — MCP as the
primary agent-native interface, llms.txt as a static fallback/export. This is a *hub* server:
one MCP endpoint fronting docs for the whole Poimandres ecosystem (r3f, zustand, jotai, drei,
etc.), not one server per library repo.

**Context7 (Upstash)** is the other major precedent: a centrally-hosted MCP that pulls
version-specific docs/code examples from many sources into the model's context on demand
(triggered by "use context7" or auto-invoke rules, or by passing a library ID directly). Its
model is: **one popular indexing service, not per-project self-hosting.** A repo doesn't need
to run anything to benefit from Context7 — it needs to be indexable (good docs/README/llms-full
structure), and ideally registered.

**Hosting reality for a GitHub Pages project — confirmed constraint:** GitHub Pages is
static-file-only; it cannot run an MCP server, full stop (no runtime for server-side code,
Streamable HTTP requires a live process). Real free options if a bespoke server is wanted:
Cloudflare Workers (free tier; Cloudflare ships first-party remote-MCP tooling — the `agents`
SDK / `workers-mcp`, plus a documented "Build a Remote MCP server" guide), or Netlify Functions
(also has a documented MCP-on-Netlify guide, e.g. `static-mcpify` wires a Netlify Function at
`/mcp` in front of structured content). There is no such thing as "MCP over static files" — an
MCP server, even a trivial read-only one, is a compute endpoint by definition (JSON-RPC over
HTTP/SSE); the *content* it serves can be static JSON, but the endpoint itself is not.

**Do end users actually install per-project docs MCP servers? Evidence says: rarely, by
choice.** MCP's raw numbers are large (22k+ listed servers, 67M local-server downloads/month,
97M+ cumulative SDK downloads) but over 50% of listed servers are inactive/low-value, and
guidance to users is consistently "install 3–5 servers max," favoring proven, general-purpose
ones (Slack, GitHub, filesystem, Postgres, web-fetch) over long-tail single-project docs
servers. The winning pattern for a docs corpus is **being indexed by a shared hub** (pmndrs'
one MCP for the whole ecosystem, or Context7 for anything) rather than every repo standing up
its own server that a user has to individually discover, trust, and add.

**Verdict: promising in general, but disproportionate for this repo specifically.** A bespoke
MCP server only earns its cost if it does something a static file can't — e.g., structured
query/filter across ~200 examples by tag/API/difficulty (genuinely useful once the corpus is
too big to dump as one `llms-full.txt` a model has to read in full). For launch, piggyback on
the free option: make sure the repo/site is well-structured enough for Context7 to index
cleanly, and skip standing up dedicated compute until there's a concrete query need the static
manifest (§4) can't satisfy. If/when it's worth building, Cloudflare Workers is the correct free
target, not GitHub Pages itself.

Sources: [docs.pmnd.rs](https://docs.pmnd.rs) · [Context7 GitHub](https://github.com/upstash/context7) · [Cloudflare — Build a Remote MCP server](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/) · [Can You Run MCP Servers on GitHub Pages?](https://0x7c2f.github.io/mcp-servers-github-pages/) · [MCP Server Ecosystem Statistics 2026](https://presenc.ai/research/mcp-server-ecosystem-statistics-2026)

---

## 4. In-repo conventions for legibility (structure, manifests, headers)

No single "spec" exists for this beyond AGENTS.md itself; what's converged on is a small set of
low-cost, high-confidence practices repeated across Claude Code / agent best-practice guides:

- Predictable, uniform structure (one folder or file per unit, consistent naming) so an agent
  can pattern-match across the corpus instead of re-deriving conventions per example — exactly
  what SPEC.md §5 already plans (folder = slug, entry file = slug, sibling `meta.json`).
- A root-level machine-readable manifest/index. This repo already has the shape of this in
  `research/data/{files.json,tags.json}` — the natural next step is a public `examples.json` (or
  similar) the site itself is built from, which doubles as the agent-facing index.
- Keep `CLAUDE.md`/`AGENTS.md` short (~200 lines is the commonly cited ceiling) and push deep
  reference material into `docs/` that the root file *points to* rather than inlines — mirrors
  the "progressive disclosure" principle Skills use (§5) and keeps context cost low for agents
  that don't need the deep material every session.
- Scoped instructions via `.claude/rules/*.md` (or Cursor's `.cursor/rules/*.mdc`) with path
  globs, when different parts of the repo need different guidance (e.g., "in `examples/*`, do
  X; in `site/*`, do Y") rather than one giant root file trying to cover everything.

There's a separate, unrelated concept worth naming so it isn't confused with the above:
`agent.json`/`ai-plugin.json`-style **service manifests** (declaring API capabilities,
auth, payment terms for agents that call a *live service*) — not applicable here since this
repo isn't exposing a callable service, just static content and code.

**Verdict: proven, not hype, and the cheapest lever available.** This is unglamorous but it's
where the actual leverage is for consumer (b) and, via the manifest, consumer (c).

Sources: [Claude Code — Extend with skills](https://code.claude.com/docs/en/skills) · [Agent-Agnostic Repository Guide (gist)](https://gist.github.com/davidgibsonp/337be9b80b3f03eccd188235c287bb05) · [Claude Code best practices (CLAUDE.md ≤200 lines, .claude/rules)](https://www.groff.dev/blog/implementing-claude-md-agent-skills)

---

## 5. Claude Code Skills as a distribution mechanism

Real and Anthropic-blessed, but **scoped to the Claude Code audience specifically** — it does
not reach Cursor/Codex/Copilot users.

- A Skill is a folder with `SKILL.md` (YAML frontmatter + instructions), using "progressive
  disclosure": the top-level file stays short (Anthropic guidance: keep it well under 500
  lines, ideally under ~150) and only pulls in deeper reference material on demand.
- **In-repo distribution is a documented, real pattern**: commit to `.claude/skills/<name>/SKILL.md`
  in the repository itself so the skill "travels with the codebase" — anyone who clones the
  repo and runs Claude Code inside it gets the skill automatically, no separate install step.
  This is distinct from the plugin/marketplace distribution mode (cross-repo, installed
  independently of any one checkout) — for a single example-gallery repo, in-repo `.claude/skills/`
  is the fitting mode, not a marketplace plugin.
- Claude Code's own deep-link docs explicitly suggest this combination: store a runbook/how-to
  as a Skill in the repo so a deep link's prompt only needs to *name* the skill rather than
  spell out the whole task inline (see §6).

**Verdict: promising, cheap, additive — but not a substitute for AGENTS.md.** A single
`.claude/skills/lift-example/SKILL.md` that teaches "how to pull one example from this gallery
into your own project" is a good, low-cost bet for consumer (c) specifically, *for the subset of
that audience using Claude Code*. It should sit alongside AGENTS.md, not instead of it.

Sources: [Claude Code — Extend with skills](https://code.claude.com/docs/en/skills) · [Claude Code Skills on GitHub](https://allthings.how/claude-code-skills-on-github-how-to-find-install-and-build-them/)

---

## 6. "Open in agent" deep links (bonus finding, relevant to consumer (a)→(b) handoff)

Confirmed directly from Claude Code's docs (`code.claude.com/docs/en/deep-links`):

- Scheme is `claude-cli://open?repo=<owner>/<name>&q=<url-encoded prompt>` (or `cwd=<abs path>`
  instead of `repo`). Clicking it opens a local terminal, starts Claude Code, and pre-fills — but
  does **not** auto-send — the prompt.
- **Important limitation for a gallery site's "open in Claude Code" button**: `repo=` only
  resolves to a local path if Claude Code has *already been run at least once* inside a clone of
  that repo on that machine — i.e., it only works for users who've already cloned the project.
  A first-time visitor with no local clone falls back to their home directory, which defeats the
  point. `cwd=` requires a fixed absolute path, which isn't portable across users either. So this
  mechanism serves *returning* contributors well (a→b handoff after they've already cloned once)
  but is not a cold-start onboarding tool for a random web visitor.
- GitHub-rendered Markdown strips the `claude-cli://` scheme (only `http(s)` allowed), so this
  only works as a real clickable link on the *site itself* (or Slack, wikis, etc.), not in the
  repo's README on GitHub — reinforce this on the gallery site's per-example page, not in-repo.
- Cursor has an equivalent (`cursor://anysphere.cursor-deeplink/...`) but with a documented
  active exploit class in 2026 (nicknamed "CursorJack"/"DeepJack" — a crafted deep link can
  trigger MCP-server install/RCE with minimal user interaction). Worth being cautious about
  linking to Cursor deep links from the site without following Cursor's current mitigation
  guidance; not a reason to avoid `claude-cli://` links, which are inert until Enter is pressed
  and don't touch MCP install flows.

Sources: [Claude Code — Launch sessions from links](https://code.claude.com/docs/en/deep-links) · [CursorJack: weaponizing Deeplinks to exploit Cursor IDE](https://www.proofpoint.com/us/blog/threat-insight/cursorjack-weaponizing-deeplinks-exploit-cursor-ide)

---

## 7. Recommended layered strategy, by consumer

**(a) Web visitor (agent or human browsing the live site, no repo):**
- `llms.txt` + `llms-full.txt` — keep it, generate it mechanically, but treat it as a
  fetch-on-request index for an agent explicitly pointed at the URL, *not* an SEO/discovery play
  (proven not to work passively).
- `claude-cli://open?repo=...` buttons on example pages, framed honestly as "already cloned?
  jump in" rather than universal onboarding, given the local-clone-required limitation.
- No bespoke MCP server at launch (see §3) — rely on getting indexed by Context7 organically if
  the content is well-structured; revisit a Cloudflare Worker MCP only if a real filterable-query
  need emerges once the corpus is large.

**(b) Repo-cloned agent (Claude Code / Cursor / Codex working locally):**
- `AGENTS.md` at root as the source of truth (this is the proven, cross-tool-adopted mechanism).
- `CLAUDE.md` as a thin shim: `@AGENTS.md` import on line one, Claude-Code-specific additions
  below (Skills pointers, any permission notes).
- Predictable per-example structure + a public `examples.json`/`meta.json` manifest (extends the
  existing `research/data/{files,tags}.json` pattern already in the repo) — the single highest-
  leverage, lowest-cost item on this whole list.
- `.claude/skills/lift-example/SKILL.md` in-repo as a bonus for the Claude Code subset of this
  audience.

**(c) Transplant agent (user's own separate project pulling in one example):**
- Self-contained per-example files (already a stated project goal) + stable raw-GitHub URLs are
  the real mechanism here — an agent with a web-fetch tool can pull one file directly; this
  doesn't require llms.txt, MCP, or AGENTS.md at all.
- `llms-full.txt` is genuinely useful for *this* case specifically (not for passive crawling): a
  user says "here's the corpus index, find me the boids example," and the agent fetches the
  known URL — an explicit-fetch, not a passive-crawl, use of the same file from §1.
- The in-repo Skill (§5) also helps here if the user's own project happens to be run with Claude
  Code and they clone this repo temporarily or reference it.

## Compact verdict

| Mechanism | Verdict | Why |
|---|---|---|
| llms.txt / llms-full.txt | **Hype** (as passive AI-crawler discovery) / mildly useful (as explicit-fetch index) | 97% of files get zero requests (Ahrefs, 137k sites); Google on record as not supporting it; major crawlers skip it |
| AGENTS.md (+ CLAUDE.md import) | **Proven** | 60k+ repos, Linux Foundation-stewarded, native in 20+ tools; one-line Claude Code compatibility gap |
| MCP server (bespoke, per-repo) | **Promising, not launch-priority** | Real precedent (docs.pmnd.rs, Context7) but those are shared hubs, not per-repo servers; GitHub Pages can't host one anyway; users install few, proven servers |
| In-repo structure + manifest (examples.json) | **Proven** | Cheapest, highest-leverage, no new standard needed, already half-built in this repo |
| Claude Code Skills (in-repo) | **Promising** | Real, documented pattern, but Claude-Code-only — additive, not sufficient alone |
| "Open in Claude Code" deep links | **Proven mechanism, narrower use than assumed** | Real and documented, but `repo=` needs a prior local clone — serves returning contributors, not cold-start visitors |

**Recommended combo:** AGENTS.md (root, source of truth) + CLAUDE.md importing it + a public
`examples.json` manifest, as the backbone for (b) and (c). Keep llms.txt/llms-full.txt as a cheap
export layer for (a)/(c), explicitly not budgeted as a discovery strategy. Add an in-repo Claude
Code Skill for "lift an example into your project." Defer any bespoke MCP server until the
corpus is large enough that structured filter/search beats a static manifest — and if built,
target Cloudflare Workers, never GitHub Pages. This directly revises SPEC.md §6, which currently
treats llms.txt + an MCP endpoint as the default plan without this evidence.
