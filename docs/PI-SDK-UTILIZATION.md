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

| Area            | Pi surface                                                                                                                                                                                                                                                                                                               | Where                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Agent loop      | `createAgentSession`, `session.prompt` / `abort` / `setModel` / `setThinkingLevel` / `subscribe`; mid-stream steering via `prompt(..., { streamingBehavior: 'steer' })`                                                                                                                                                  | `pi-server/index.ts`, `state.ts`                                      |
| Events          | Full `AgentSessionEvent` stream (`message_update`, `tool_execution_*` including `durationMs`, `turn_*`, `agent_*`, `compaction_*`, `auto_retry_*`) adapted to `AgentChatEvent` and OTel GenAI spans                                                                                                                      | `event-adapter.ts`, `tool-duration.ts`                                |
| Built-in tools  | `create{Bash,Edit,Find,Grep,Ls,Read,Write}ToolDefinition` registered with `noTools: 'builtin'` + `customTools`, each wrapped for permission gating and tracing                                                                                                                                                           | `pi-server/index.ts`, `tool-wrapping.ts`                              |
| Custom tools    | `defineTool` for `Agent` (sub-agents), `web_fetch`, `web_search`, `browser_tool`; collaboration and planning tools                                                                                                                                                                                                       | `agent-tool.ts`, `web-tools.ts`, `browser-tool.ts`, `planning-tools/` |
| MCP             | `createMcpExtension` fed by `loadConfig` (`mcp-native-config.ts`) plus `createToolSearchExtension` for deferred servers (`mcp-exposure.ts`); `tool_call` / `tool_result` hooks for governance and tracing (`mcp-governance.ts`); a separate probe for status and tool counts (`mcp-diagnostics.ts`). No `sse` transport. | `pi-server/`                                                          |
| Models and auth | `ModelRuntime` with a custom in-memory `CredentialStore` fed by `token_update`; `ModelRegistry.registerProvider('custom-endpoint')`; `getBuiltinModel` / `builtinModels`; `githubCopilotProvider` and `openaiCodexProvider` for OAuth and the tier-filtered Copilot catalog                                              | `credential-store.ts`, `copilot/models.ts`, `oauth/`                  |
| Compaction      | `SettingsManager.inMemory({ compaction })` driven by the settings UI (`CompactionSection`); `session_before_compact` extension for span attribution; manual `session.compact(instructions)` that preserves plan state                                                                                                    | `pi-server/index.ts`; see `COMPACTION.md`                             |
| Session forking | `SessionManager.open` / `getEntries` / `createBranchedSession` / `branchWithSummary` with `collectEntriesForBranchSummary` and `generateBranchSummary`; summaries are generated only for Copilot connections                                                                                                             | `storage/session-fork.ts`, `session-branch.ts`                        |
| Session storage | `SessionManager.continueRecent` per chat; `SessionManager.inMemory` for one-shot completions                                                                                                                                                                                                                             | `pi-server/index.ts`                                                  |

Sub-agents are MA-built: each `Agent` call spawns another `pi-server` process (`agent-tool.ts`, `subagent/spawn.ts`),
not a pi feature.

## Reimplemented instead of using pi's native mechanism

1. **Skills.** MA has its own tier (`~/.minimalist-agent/skills`, project tier, `@slug` invocation, `skills/*`). Pi has a
   native Agent Skills implementation (discovery, system-prompt injection, `/skill:name`, progressive disclosure). MA
   uses none of it; pi's own discovery is disabled (see [Resource isolation](#resource-isolation)).
2. **Extensions.** MCP-backed extensions run on pi's native MCP extension. CLI-bound and guide-only extensions have no
   pi counterpart in use (`registerTool`, `registerCommand`, `registerShortcut` are all unused).
3. **Permission gating.** For built-in, web, and agent tools the gate is a cross-process round trip
   (`pre_tool_use_request` / `pre_tool_use_response`) awaited inside a wrapper around `execute()` (`tool-wrapping.ts`).
   Native MCP calls use the `tool_call` hook instead and replay the same round trip from inside it. The UI lives in a
   different Electron process, so the round trip is defensible, but the wrapper has a cost: pi's `durationMs` includes
   the approval wait, which `tool-duration.ts` has to subtract. A `tool_call` hook runs before `execute()`, so pi
   would exclude that wait on its own.
4. **Tool output truncation.** `web-tools.ts` has its own `clamp()` instead of pi's `truncateHead` / `truncateTail` /
   `formatSize`.
5. **One-shot completions.** Title and other mini completions (`runEphemeralPrompt`) build a full in-memory
   `AgentSession` plus a resource loader for each call. Tools are disabled (`noTools: 'all'`), since the permission gate
   only wraps the main session's tools.

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
- **Retry settings.** `SettingsManager` receives only `compaction`; auto-retry runs on pi's defaults and its events are
  displayed but not configurable.
- **Prompt templates** (`/command` files), **session tree navigation** (`navigateTree`, labels; forking is linear
  cutoff plus a summary), and the **packages system** (`pi install`).
- **Themes, TUI, and RPC/JSON modes.** Intentionally unused (own Electron UI).

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
`mcp__<server>__<tool>` names. The `tool_call` hook in `mcp-governance.ts` therefore sees the same event it does for a
`direct` tool, and the main-process `blockedTools` check keys on that name too. `mcp-deferred.integration.test.ts`
runs a real pi session against a stdio MCP fixture and a scripted faux model, and asserts that deferred tools are
absent from the first request, are declared after a search, reach the permission round trip, and do not execute when
the gate blocks them. Codemode would need a separate answer, since its nested calls do not go through `tool_call`.

**UI.** `tool_search` renders as an ordinary tool chip; `tool-summary.ts` already shows its `query`.

**Open**

1. **Model behavior.** Deferral costs an extra round trip on first use and depends on the model searching well, which
   weaker or local models may do poorly. The threshold is per server, so many mid-sized servers still add up to a
   large direct set.
2. **Codemode.** Untested under `ELECTRON_RUN_AS_NODE` and in the packaged app (QuickJS WASM), with the governance gap
   above. Not needed for the saving.
3. **Re-measure** on a real Postman or Canva session.

## Priorities

1. **Move built-in permission gating into a `tool_call` hook.** Halves the custom `pre_tool_use_*` layer, lets pi report
   `durationMs` without the approval wait (deleting the wait accounting in `tool-duration.ts`), and opens up the
   `context` hook for message pruning.
2. **Decide the skills story.** Fold MA's skills into pi's native loader, or document why they stay separate.
3. **Smaller items.** Replace `clamp()` with pi's truncation helpers, expose retry settings, and use a lighter path
   than a full `AgentSession` for one-shot completions.
