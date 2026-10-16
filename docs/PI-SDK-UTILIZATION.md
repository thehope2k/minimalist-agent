# Pi SDK Utilization

What `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` (1.2.x) offer versus what minimalist-agent
uses. The reference is the SDK's own docs (`node_modules/@earendil-works/pi-coding-agent/docs/`) read against every
`@earendil-works/pi-*` import in `src/`. Update this file when a pi surface is adopted, replaced, or dropped.

## How pi is embedded

Pi runs in a `pi-server` subprocess (`ELECTRON_RUN_AS_NODE`), one `AgentSession` per chat session, bridged to the main
process over JSONL on stdin/stdout. This is the Node-host embedding pi's own `docs/rpc.md` recommends, not pi's
`--mode rpc`. Pi owns the agent loop, model calls, compaction, and MCP execution. MA owns the UI, permission prompts,
credential storage (Electron `safeStorage`), session persistence, and everything the renderer shows.

## What is used

| Area            | Pi surface                                                                                                                                                                                                                                                                                                                | Where                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Agent loop      | `createAgentSession`, `session.prompt` / `abort` / `setModel` / `setThinkingLevel` / `subscribe`; mid-stream steering via `prompt(..., { streamingBehavior: 'steer' })`                                                                                                                                                   | `pi-server/index.ts`, `state.ts`                                      |
| Events          | Full `AgentSessionEvent` stream (`message_update`, `tool_execution_*` including `durationMs`, `turn_*`, `agent_*`, `compaction_*`, `auto_retry_*`) adapted to `AgentChatEvent` and OTel GenAI spans                                                                                                                       | `event-adapter.ts`, `tool-duration.ts`                                |
| Built-in tools  | `create{Bash,Edit,Find,Grep,Ls,Read,Write}ToolDefinition` registered with `noTools: 'builtin'` + `customTools`, each wrapped for tracing; permission gating is the `tool_call` hook in `tool-governance.ts`                                                                                                               | `pi-server/index.ts`, `tool-wrapping.ts`                              |
| Custom tools    | `defineTool` for `Agent` (sub-agents), `web_fetch`, `web_search`, `browser_tool`; collaboration and planning tools                                                                                                                                                                                                        | `agent-tool.ts`, `web-tools.ts`, `browser-tool.ts`, `planning-tools/` |
| MCP             | `createMcpExtension` fed by `loadConfig` (`mcp-native-config.ts`) plus `createToolSearchExtension` for deferred servers (`mcp-exposure.ts`); `tool_call` / `tool_result` hooks for governance and tracing (`tool-governance.ts`); a separate probe for status and tool counts (`mcp-diagnostics.ts`). No `sse` transport. | `pi-server/`                                                          |
| Models and auth | `ModelRuntime` with a custom in-memory `CredentialStore` fed by `token_update`; `ModelRegistry.registerProvider('custom-endpoint')`; `getBuiltinModel`; `githubCopilotProvider` and `openaiCodexProvider` for OAuth and the tier-filtered Copilot catalog                                                                 | `credential-store.ts`, `copilot/models.ts`, `oauth/`                  |
| Compaction      | `SettingsManager.inMemory({ compaction })` driven by the settings UI (`CompactionSection`); `session_before_compact` extension for span attribution; manual `session.compact(instructions)` that preserves plan state                                                                                                     | `pi-server/index.ts`; see `COMPACTION.md`                             |
| Retry           | `SettingsManager.inMemory({ retry })` with `enabled` and `maxRetries` from the settings UI (`RetrySection`, clamped by `shared/retry.ts`); main sends `retrySettings` in `init`. Sub-agents keep pi's defaults.                                                                                                           | `pi-server/index.ts`, `chat-subprocess.ts`                            |
| Session forking | `SessionManager.open` / `getEntries` / `createBranchedSession` / `branchWithSummary` with `collectEntriesForBranchSummary` and `generateBranchSummary`; summaries are generated only for Copilot connections                                                                                                              | `storage/session-fork.ts`, `session-branch.ts`                        |
| Session storage | `SessionManager.continueRecent` per chat; `SessionManager.inMemory` for one-shot completions                                                                                                                                                                                                                              | `pi-server/index.ts`                                                  |

Sub-agents are MA-built: each `Agent` call spawns another `pi-server` process (`agent-tool.ts`, `subagent/spawn.ts`),
not a pi feature.

## Reimplemented instead of using pi's native mechanism

Audited against pi 1.2.0 (`skills.js`, `resource-loader.d.ts`, `model-runtime.d.ts`, `sdk.js`). Only two items are
genuine reimplementation, and neither is a drop-in swap. The rest of what looks like duplication is MA building on pi
(next section).

1. **Skills.** MA has its own tier (`~/.minimalist-agent/skills`, project tier, `@slug` invocation, `skills/*`). Pi has a
   native Agent Skills implementation (discovery, system-prompt injection, `/skill:name`, progressive disclosure). MA
   uses none of it; pi's own discovery is disabled (see [Resource isolation](#resource-isolation)).
   - **Real overlap is small.** Only the `SKILL.md` frontmatter parser (`skills/parse.ts`) and the directory scan
     (`skills/storage.ts`), about 200 of the 777 lines in `src/main/skills/`.
   - **Replacing it would lose capability.** MA uses `name` as a display title (`name: "Code Review"`); pi treats it as
     a lowercase-hyphen identifier (≤64 chars) and validates it. Pi's `Skill` has no `icon`, `globs`, `alwaysAllow`, or
     body, so MA would still read the file for the UI. `@slug` mentions, pinning, the two-tier merge cache, the editor
     and validate UI, and the reference doc have no pi counterpart.
   - **What pi adds that MA lacks.** Pi lists every skill's name, description, and path in the system prompt
     (`<available_skills>`) so the model can pick one unprompted. MA exposes a skill only when mentioned or pinned. This
     is new capability rather than a maintenance saving, and it costs prompt tokens on every request. If wanted, wire
     MA's loaded skills in through `skillsOverride` / `additionalSkillPaths` instead of replacing MA's code.
2. **One-shot completions.** Title and other mini completions (`runEphemeralPrompt`) build a full in-memory
   `AgentSession` plus a resource loader for each call. This is deliberate: a bare `completeSimple` call was unreliable
   under HTTP/2 421 misdirected requests, and the session path fixed it (commit `e7d18ea`, which states only the 421
   reason). Tools are disabled (`noTools: 'all'`), so nothing needs gating. The unauthenticated `llm_query`
   `completeSimple` path was dead code and has been removed.
   - **Possible simplification, unverified.** `ModelRuntime.completeSimple(model, context, options)` is a different call
     from the one `e7d18ea` removed: the session itself requests through `modelRuntime.streamSimple` (`sdk.js`), so
     it should share credential handling. It would drop roughly 40-60 lines.
   - **Why it is not done.** Pi's `core` and `pi-ai` contain no 421 handling, and `retry.js` has no 421 entry that we
     found, so it is unknown why the session path avoids the error. Reproduce the 421 first and test
     `modelRuntime.completeSimple` against it; swap only if it passes.

## Built on pi, not reimplemented

These were once listed as reimplementations. They are not duplication.

- **Extensions.** MCP-backed extensions run on pi's native MCP extension. CLI-bound and guide-only extensions are
  an MA concept; pi's "extension" is an in-process code plugin, so there is nothing to swap in. `registerTool`,
  `registerCommand`, and `registerShortcut` are unused because nothing needs them.
- **Permission gating.** One `pi.on('tool_call')` hook (`tool-governance.ts`) gates built-in, web, browser, Agent, and
  native MCP tools through a cross-process round trip (`pre_tool_use_request` / `pre_tool_use_response`); the UI lives in
  a different Electron process, so the round trip stays. Because the hook runs before `execute()`, pi's `durationMs`
  excludes the approval wait. The catastrophic-delete breaker lives in the same hook. Collaboration and planning tools
  are deliberately ungated.
- **Tool output truncation.** `web-tools.ts` uses pi's `truncateHead` / `formatSize` (`clampResult`). The only custom
  code is a byte-slice fallback: `truncateHead` returns empty content when the first line alone exceeds the budget
  (minified JSON).

## Resource isolation

Pi's `DefaultResourceLoader` would auto-discover `AGENTS.md`, skills, extensions, prompt templates, themes,
`SYSTEM.md` / `APPEND_SYSTEM.md`, and `settings.json` package lists from `~/.pi/agent` and `<cwd>/.pi`. MA turns all of
that off, because it owns context, skills, and extensions itself (its own tiers, consent flow, and prompt injection).
Left on, discovery would duplicate `<project_context>` in every request, leak the pi CLI's content into MA sessions,
and execute extensions outside MA's consent flow.

Every loader comes from `createIsolatedResourceLoader` (`pi-server/resource-loader.ts`), for both the chat session and
`runEphemeralPrompt`:

- All `no*` switches are set.
- An in-memory `SettingsManager` is passed in and shared with the session, so `settings.json` is never read.
- `appendSystemPrompt` is the caller's array, mutated in place and applied with `reload()`.
- The system prompt is overridden, so `SYSTEM.md` is never picked up.
- Inline extension factories (MCP, governance, compaction) still load.

`resource-loader.test.ts` places marker files in both locations and asserts none surface.

## Not used

- **`context` and `before_agent_start` hooks.** In-process message pruning before each LLM call and per-turn system
  prompt injection (MA does the latter by mutating `appendArr` and reloading the loader).
- **`before_provider_request` / `before_provider_headers` / `after_provider_response`.** Request-level tracing and
  debugging without touching provider code.
- **Retry timing and provider-level retry.** Only `retry.enabled` and `retry.maxRetries` are exposed (Settings → AI →
  Error Recovery). `baseDelayMs`, `maxAgentDelayMs`, and `retry.provider.*` stay on pi's defaults; pi advises leaving
  provider retries at 0 so it can handle quota errors itself.
- **Prompt templates** (`/command` files), **session tree navigation** (`navigateTree`, labels; forking is linear
  cutoff plus a summary), and the **packages system** (`pi install`).
- **Themes, TUI, and RPC/JSON modes.** Intentionally unused (own Electron UI).

## MCP activation by tier

Project-tier MCP extensions connect at `init`. User-tier ones stay unloaded until the user mentions `@slug`; the slug is
stored in `SessionMeta.activatedExtensions` so it survives a respawn. On a live subprocess, main sends `activate_mcp`
(`chat-subprocess.ts`), and pi-server calls `pi.registerMcpServer()` (`mcp-activation.ts`), which connects right away.
The first-loaded `pi` instance is the bound one, since the per-turn `resourceLoader.reload()` re-runs factories.
Hot-added servers skip the probe, so they default to `deferred`. Covered by `mcp-activation.integration.test.ts`.

## Deferred MCP tool exposure

Every `direct` MCP tool declaration is sent on every request. Pi can keep them out and load them on demand through
`tool_search`; MA does this automatically for large servers.

**Behavior**

- `createToolSearchExtension()` is registered next to `createMcpExtension()`. Pi activates `tool_search` itself when a
  server has `deferred` exposure.
- `applyAutoExposure` (`pi-server/mcp-exposure.ts`) resolves an unset `exposure` from the tool count that
  `probeMcpServers` already measures at session start: more than `DEFERRED_TOOL_THRESHOLD` (20) tools means
  `deferred`, otherwise `direct`. An `exposure` set in `extension.json` always wins. A server whose count is unknown
  (probe skipped, failed, or out of budget) stays `direct`.
- `codemode` is not registered. A `codemode` server therefore has no active loader tool and is unreachable.

**Measured** with pi-server driven over its JSONL protocol against a mock OpenAI endpoint, one stdio MCP server with 100
realistically described tools, first request of a turn:

| Exposure   | Tool declarations | Request body | ≈ Tokens (bytes / 4) |
| ---------- | ----------------- | ------------ | -------------------- |
| `direct`   | 80 KB             | 84 KB        | 21k                  |
| `deferred` | 15 KB             | 19 KB        | 4.8k                 |

About 77% smaller. Installed extensions such as Postman (~140 tools), Canva, and Strava are in this range. That run
had no loader tool registered, so the figure omits the `tool_search` declaration. It has not been re-measured with it.

**Governance holds.** `tool_search` activates the matching tools, and the model then calls them by their real
`mcp__<server>__<tool>` names. The `tool_call` hook in `tool-governance.ts` therefore sees the same event it does for a
`direct` tool, and the main-process `blockedTools` check keys on that name too. `mcp-deferred.integration.test.ts`
runs a real pi session against a stdio MCP fixture and a scripted faux model, and asserts that deferred tools are
absent from the first request, are declared after a search, reach the permission round trip, and do not execute when
the gate blocks them. Codemode is a separate question: pi's docs say nested `ctx.executeTool()` calls pass through `tool_call`, which would cover them, but MA has not verified it.

**UI.** `tool_search` renders as an ordinary tool chip; `tool-summary.ts` already shows its `query`.

**Open**

1. **Model behavior.** Deferral costs an extra round trip on first use and depends on the model searching well, which
   weaker or local models may do poorly. The threshold is per server, so many mid-sized servers still add up to a
   large direct set.
2. **Codemode.** Untested under `ELECTRON_RUN_AS_NODE` and in the packaged app (QuickJS WASM), and nested-call
   governance is unverified (see above). Not needed for the saving.
3. **Re-measure** on a real Postman or Canva session.

## Priorities

1. **Skills: keep MA's tier.** Decision from the audit: the overlap is parser and scan only, and swapping them loses
   `icon`, `globs`, `alwaysAllow`, display names, and the mention/pin flow. Optional follow-up: expose MA's skills to
   pi's `<available_skills>` listing via `skillsOverride`, if model-initiated skill use is wanted.
2. **One-shot completions.** Reproduce the 421, then try `modelRuntime.completeSimple` in place of `runEphemeralPrompt`.
