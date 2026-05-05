# Roadmap

What's in, what's coming, and what's intentionally out of scope.

---

## What's implemented

| Capability                   | Detail                                                                                                                                                                                                                                                                                                                                        |
|------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Anthropic API key**        | Direct API connection — works with any Anthropic-tier account                                                                                                                                                                                                                                                                                 |
| **Claude OAuth**             | Sign in with Claude Pro/Max via PKCE flow; token auto-refresh                                                                                                                                                                                                                                                                                 |
| **GitHub Copilot**           | Device-flow OAuth; live model discovery; mid-session token refresh                                                                                                                                                                                                                                                                            |
| **Built-in agent tools**     | Read, Write, Edit, Bash, Grep, Glob, WebFetch, WebSearch, Task — via the `claude_code` SDK preset                                                                                                                                                                                                                                             |
| **MCP servers**              | stdio + HTTP/SSE transports, consent gate, encrypted secrets — managed through the Extensions panel                                                                                                                                                                                                                                           |
| **Extensions**               | Install extensions by dropping a directory into `<userData>/extensions/`. Three variants: MCP-backed, CLI-bound, guide-only                                                                                                                                                                                                                   |
| **Skills**                   | `SKILL.md` files invoked with `@slug` in the composer; project-local and global tiers                                                                                                                                                                                                                                                         |
| **Sessions**                 | Full persistence (`messages.jsonl` + `session.json`); resume across restarts                                                                                                                                                                                                                                                                  |
| **Permission modes**         | Plan (no mutations), Ask (per-tool prompt), Auto (bypass) — configurable per session and default                                                                                                                                                                                                                                              |
| **Safe bash auto-allow**     | In Ask mode, ~55 read-only bash commands (git read ops, ls/grep/find, npm ls/outdated, jq, tsc --noEmit, etc.) run without a confirmation prompt. Dangerous constructs (`$()`, redirects, `&`, env assignment, `find -exec`, `awk system()`) are always blocked regardless of command name. Both Anthropic and Pi (Copilot) backends covered. |
| **Project context**          | Auto-discovers `CLAUDE.md` / `AGENTS.md` up the directory tree; injected into the system prompt                                                                                                                                                                                                                                               |
| **Permissions settings**     | Settings panel showing the three permission modes and the full list of auto-allowed tools and safe bash commands                                                                                                                                                                                                                              |
| **User Preferences**         | Name, timezone, location, language, free-text notes — injected into every system prompt                                                                                                                                                                                                                                                       |
| **Encrypted credentials**    | API keys + OAuth tokens stored via Electron `safeStorage` (OS keychain)                                                                                                                                                                                                                                                                       |
| **Thinking / reasoning**     | Extended thinking display with collapsible panels                                                                                                                                                                                                                                                                                             |
| **Tool diff UI**             | Inline unified diff + split-view modal for Edit/Write tool calls                                                                                                                                                                                                                                                                              |
| **Mid-turn steering**        | Inject a message into a live agent turn without cancelling it                                                                                                                                                                                                                                                                                 |
| **Markdown rendering**       | `react-markdown` + `remark-gfm`; Shiki-highlighted code blocks; lazy-loaded Mermaid diagrams                                                                                                                                                                                                                                                  |
| **Extended context (1M)**    | Opt-in 1M token context window for supported models (Anthropic Tier 4+)                                                                                                                                                                                                                                                                       |
| **Continue after max turns** | One-click resume when the agent hits the `max_turns` stop reason                                                                                                                                                                                                                                                                              |
| **Auto-update**              | `electron-updater` pulling from GitHub Releases                                                                                                                                                                                                                                                                                               |

---

## What's coming

These are understood, scoped, and on the roadmap — just not shipped yet.

| What                         | Notes                                                            |
|------------------------------|------------------------------------------------------------------|
| **Additional LLM providers** | OpenAI, Gemini, and other providers via the Pi universal backend |

---

## SpecKit / Spec-Driven Development (SDD)

GitHub Spec Kit (v0.8.5, 92.5K stars) is a mature SDD toolkit that already works
with Minimalist Agent today via the `AGENTS.md` auto-discovery bridge. The items
below are native improvements that would make MA a first-class SDD environment
rather than a generic host for an external CLI.

### Level 1 — Packaging (days)

| What                            | Notes                                                                                                                                                                                                                                                                       |
|---------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **SpecKit CLI-bound Extension** | Ship a `speckit` extension under `<userData>/extensions/` that surfaces the `specify` CLI to agent sessions. Lets users run `specify init .` and `specify extension add` from within MA without manual terminal setup.                                                      |
| **`@speckit` Skill**            | A global `SKILL.md` that teaches both backends (Claude + Pi) the full v0.8.5 command syntax: `/speckit.constitution`, `/speckit.specify`, `/speckit.plan`, `/speckit.tasks`, `/speckit.implement` — phase gates, constitution-first approach, and when to use each command. |

### Level 2 — UX Polish (weeks)

| What                            | Notes                                                                                                                                                                                        |
|---------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **`.specify/` directory panel** | Side panel that lists features (`001-kanban`, `002-auth`…), shows artifact status per feature (spec ✅ plan ✅ tasks ✅ implemented ⏳), and renders `tasks.md` as a real interactive checklist. |
| **Phase indicator**             | Detect current SDD phase from file system state (which artifacts exist under `.specify/specs/`) and show a progress badge in the session header.                                             |
| **Spec file viewer**            | Structured rendering for `spec.md`, `plan.md`, `tasks.md`, and `constitution.md` — not just generic markdown, but with section highlighting and checkbox tracking.                           |
| **SDD project wizard**          | "New SDD Project" dialog: pick directory → runs `specify init . --integration <backend>` internally → sets working directory → opens session in Specify phase.                               |

### Level 3 — Native Power (months)

| What                      | Notes                                                                                                                                                                                                        |
|---------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Task → Session queue**  | Parse `tasks.md` checkboxes and offer "Spawn sessions for all tasks" — each unchecked task becomes a child session pre-loaded with `spec.md` + `plan.md` context. Checks the box when the session completes. |
| **Multi-model per phase** | UI affordance to assign a model per SDD phase. Only meaningful with the Pi backend (cross-provider: GPT-4.1, Gemini 2.5, o3, Claude). E.g. Gemini 2.5 for Specify, o3 for Plan, Claude Sonnet for Implement. |

---

## What's intentionally out of scope

These are explicit non-goals — they belong to a different product surface.

- **Automations / cron / webhooks** — a separate scheduling engine
- **In-process MCP tools** (SubmitPlan, transform_data, render_template…) — agent-harness territory
- **Self-hosted server / web UI** — desktop-only by design
- **Custom rendering blocks** (datatable, html-preview, pdf-preview) — no tool architecture to produce them
- **Theming / multi-language** — system theme only
