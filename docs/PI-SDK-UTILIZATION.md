# Pi SDK Utilization Audit

Date: 2026-07-22 · updated 2026-07-23 (compaction redesign — see
[`COMPACTION.md`](COMPACTION.md))

This document inventories what the `@earendil-works/pi-coding-agent` SDK offers
versus what minimalist-agent actually uses, based on reading the SDK's bundled
docs (`node_modules/@earendil-works/pi-coding-agent/docs/`) against every
`@earendil-works/pi-*` import in this codebase. Re-audit periodically as new
SDK surfaces get adopted — item 6 (compaction) below is the template for how
a 🟡 finding graduates to 🟢 once a full design lands.

**Files that touch the pi SDK** (11 total):

```
src/main/pi-server/index.ts
src/main/pi-server/event-adapter.ts
src/main/pi-server/mcp-tools.ts
src/main/pi-server/web-tools.ts
src/main/agent/backends/pi/agent.ts
src/main/agent/backends/pi/agent-tool.ts
src/main/storage/session-fork.ts
src/main/copilot/models.ts
src/main/oauth/chatgpt-flow.ts
src/main/oauth/copilot-flow.ts
src/main/ipc.ts
```

## 🟢 Well utilized

| Feature | Where | Notes |
|---|---|---|
| `createAgentSession()` core loop | `pi-server/index.ts` | Direct SDK embedding in a custom subprocess (not pi's `--mode rpc`). Pi's own `docs/rpc.md` explicitly recommends this for Node.js hosts — validated architecture, not a gap. |
| Full event stream | `event-adapter.ts` | Consumes `message_update`, `tool_execution_*`, `turn_start/end`, `agent_start/end`, `compaction_start/end`, `auto_retry_*` — mapped to `AgentChatEvent` / OTel GenAI shape. |
| `defineTool()` custom tools | `agent-tool.ts`, `web-tools.ts`, `mcp-tools.ts` | Sub-agent spawning, web fetch/search, MCP bridging. |
| `SessionManager` tree API | `storage/session-fork.ts` | `SessionManager.open()`, `getEntries()`, `createBranchedSession()` for the chat-session-fork feature. |
| `ModelRuntime` + custom `CredentialStore` | `pi-server/index.ts` | In-memory store fed by `token_update` IPC, since credentials live in Electron's `safeStorage`, not pi's `auth.json`. |
| `registerProvider()` | `pi-server/index.ts:1314` | One custom-endpoint provider for user-configured OpenAI-compatible/local models. |
| `steer()`, `setThinkingLevel()` | `pi-server/index.ts` | Mid-stream interjection wired to a `steer` protocol message. |
| `SettingsManager` (compaction) | `pi-server/index.ts` (`SettingsManager.inMemory`), `storage/settings.ts` | `enabled`/`reserveTokens`/`keepRecentTokens` are a real settings-UI-backed config object now, not hardcoded — see `COMPACTION.md` §2. |
| `session_before_compact` | `pi-server/index.ts` (`compactionObservabilityExtension`, `handleManualCompact`) | OTel span attribution for auto-compaction + summarizer-model override and plan-state-preservation instructions for the manual trigger — see `COMPACTION.md` §4. |
| Branch summarization (`collectEntriesForBranchSummary`, `generateBranchSummary`, `SessionManager.branchWithSummary`) | `storage/session-fork.ts`, `storage/sessions.ts` | Powers "Fork with context" — see `COMPACTION.md` §6. |

## 🟡 Partially utilized — reimplemented in parallel instead of using pi's native mechanism

1. **Skills** — `AGENTS.md` describes a full skills tier
   (`~/.minimalist-agent/skills/`, project tier, `@slug` invocation). Pi has a
   complete native implementation of the same idea (Agent Skills standard
   compliance, `SKILL.md` discovery from `~/.pi/agent/skills/`, auto-injection
   into the system prompt, `/skill:name` commands, progressive disclosure).
   Zero use of `DefaultResourceLoader`'s `skillsOverride`, the `Skill` type, or
   native discovery paths — reinvented with a custom directory convention and
   directive-injection code (`skills/directive.ts`, `skills/storage.ts`).
2. **Extensions** — same story. The MCP-backed/CLI-bound/guide-only extension
   system is a parallel invention. Pi's `ExtensionAPI`
   (`registerTool`, `registerCommand`, `registerShortcut`, event hooks) is
   never imported anywhere in the codebase.
3. **Tool truncation** — `web-tools.ts` hand-rolls a `clamp()` function
   instead of importing `truncateHead` / `truncateTail` / `formatSize` from
   the SDK.
4. **Permission gating** — built as a custom cross-process round-trip
   (`pre_tool_use_request` / `pre_tool_use_response`) rather than the
   `tool_call` extension hook's `{ block: true }` return. Defensible — the UI
   lives in a separate Electron process from the pi subprocess, and this is
   the flagship extension use case in pi's docs ("confirm before `rm -rf`") —
   but it means the whole `tool_call` / `tool_result` / `context` /
   `before_agent_start` hook family is unused even though they'd work
   identically in-process.
5. **`DefaultResourceLoader`** — imported, but only for the
   `systemPromptOverride` / mutable-append-array trick to inject per-turn
   context. Never used for its actual purpose (extensions/skills/prompts/
   themes discovery).
6. **Compaction** — `compaction_start/end` events are consumed for UI display,
   but `SettingsManager` (`reserveTokens`, `keepRecentTokens`, `enabled`) and
   `session_before_compact` for custom summarization are untouched.

## 🔴 Not touched at all — powerful, available, unused

- **`tool_call` / `context` / `before_agent_start` hooks** — in-process
  mutation of tool args, message pruning before each LLM call, dynamic
  system-prompt injection per turn. All strictly more powerful than the
  current pre/post round-trip approach for anything that doesn't need
  cross-process UI.
- **`before_provider_headers` / `before_provider_request` /
  `after_provider_response`** — would give free request/response-level
  tracing/debugging hooks without touching provider code.
- **Dynamic tool loading (`search_tools` pattern)** — since MCP tool
  definitions likely accumulate per session, this native "keep a loader tool
  active, lazily activate matches" mechanism could shrink prompt size / cache
  invalidation for MCP-heavy sessions. Currently all MCP tools load flat and
  always-active.
- **Prompt templates (`PromptTemplate`, `/command` `.md` files)** — no
  user-facing reusable slash-command system distinct from skills/agents.
- **`SettingsManager`** — compaction/retry policy knobs are invisible to the
  settings UI.
- **Session tree navigation (`/tree`, `navigateTree`, labels, branch
  summarization)** — the fork feature only does linear timestamp-cutoff
  forking; the richer tree/labels/branch-summary machinery is unused.
- **Packages system (`pi install npm:` / `git:`)** — no plugin ecosystem
  story; every capability is hand-built rather than pulled from the pi
  package gallery.
- **Themes, TUI, RPC/JSON modes** — correctly and intentionally unused (own
  Electron/React UI).

## Biggest opportunity

Adopting **`tool_call` / `context` extension hooks for permission-gating and
message shaping**, since the pi-server subprocess already runs in-process
(same Node runtime hosting the `AgentSession`). The cross-process round-trip
protocol currently built for permission gating isn't required — an in-process
extension could call back into the existing IPC-based approval flow, cutting
the custom `pre_tool_use_request` / `pre_tool_use_response` protocol layer
roughly in half while gaining `context`-event message pruning for free.

## Possible follow-ups

- Prototype migrating permission-gating from the custom protocol to
  `tool_call` hooks.
- Estimate effort to fold the in-house skills system into pi's native skill
  loader (or vice versa — formally document why they diverge, if the
  divergence is intentional, e.g. cross-provider skill sharing with the
  Anthropic backend).
- Evaluate `truncateHead`/`truncateTail`/`formatSize` as a drop-in replacement
  for `web-tools.ts`'s `clamp()`.
- Evaluate exposing `SettingsManager` compaction/retry knobs in the app's
  settings UI.
