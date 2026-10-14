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

| Area            | Pi surface                                                                                                                                                                                                                                                                  | Where                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Agent loop      | `createAgentSession`, `session.prompt` / `abort` / `setModel` / `setThinkingLevel` / `subscribe`; mid-stream steering via `prompt(..., { streamingBehavior: 'steer' })`                                                                                                     | `pi-server/index.ts`, `state.ts`                                      |
| Events          | Full `AgentSessionEvent` stream (`message_update`, `tool_execution_*` including `durationMs`, `turn_*`, `agent_*`, `compaction_*`, `auto_retry_*`) adapted to `AgentChatEvent` and OTel GenAI spans                                                                         | `event-adapter.ts`, `tool-duration.ts`                                |
| Built-in tools  | `create{Bash,Edit,Find,Grep,Ls,Read,Write}ToolDefinition` registered with `noTools: 'builtin'` + `customTools`, each wrapped for permission gating and tracing                                                                                                              | `pi-server/index.ts`, `tool-wrapping.ts`                              |
| Custom tools    | `defineTool` for `Agent` (sub-agents), `web_fetch`, `web_search`, `browser_tool`; collaboration and planning tools                                                                                                                                                          | `agent-tool.ts`, `web-tools.ts`, `browser-tool.ts`, `planning-tools/` |
| MCP             | `createMcpExtension` fed by `loadConfig` (`mcp-native-config.ts`); `tool_call` / `tool_result` hooks for governance and tracing (`mcp-governance.ts`); a separate probe for status (`mcp-diagnostics.ts`). No `sse` transport.                                              | `pi-server/`                                                          |
| Models and auth | `ModelRuntime` with a custom in-memory `CredentialStore` fed by `token_update`; `ModelRegistry.registerProvider('custom-endpoint')`; `getBuiltinModel` / `builtinModels`; `githubCopilotProvider` and `openaiCodexProvider` for OAuth and the tier-filtered Copilot catalog | `credential-store.ts`, `copilot/models.ts`, `oauth/`                  |
| Compaction      | `SettingsManager.inMemory({ compaction })` driven by the settings UI (`CompactionSection`); `session_before_compact` extension for span attribution; manual `session.compact(instructions)` that preserves plan state                                                       | `pi-server/index.ts`; see `COMPACTION.md`                             |
| Session forking | `SessionManager.open` / `getEntries` / `createBranchedSession` / `branchWithSummary` with `collectEntriesForBranchSummary` and `generateBranchSummary`; summaries are generated only for Copilot connections                                                                | `storage/session-fork.ts`, `session-branch.ts`                        |
| Session storage | `SessionManager.continueRecent` per chat; `SessionManager.inMemory` for one-shot completions                                                                                                                                                                                | `pi-server/index.ts`                                                  |

Sub-agents are MA-built: each `Agent` call spawns another `pi-server` process (`agent-tool.ts`, `subagent/spawn.ts`),
not a pi feature.

## Reimplemented instead of using pi's native mechanism

1. **Skills.** MA has its own tier (`~/.minimalist-agent/skills`, project tier, `@slug` invocation, `skills/*`). Pi has a
   native Agent Skills implementation (discovery, system-prompt injection, `/skill:name`, progressive disclosure). MA
   uses none of it deliberately, but see [Unintended native discovery](#unintended-native-resource-discovery) below.
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
   `AgentSession` plus a `DefaultResourceLoader` for each call.

## Unintended native resource discovery

`DefaultResourceLoader` is created with `agentDir = ~/.pi/agent` and no `no*` switches, so pi's own discovery is
active in every session, including the one-shot completions. Verified by placing marker files and reading the
system prompt pi-server sends:

| Placed in                            | Result                       |
| ------------------------------------ | ---------------------------- |
| `~/.pi/agent/AGENTS.md`              | injected into the prompt     |
| `~/.pi/agent/skills/<name>/SKILL.md` | listed as an available skill |
| `<cwd>/AGENTS.md`                    | injected into the prompt     |
| `<cwd>/.pi/skills/<name>/SKILL.md`   | listed as an available skill |

Pi uses the same mechanism for extensions, prompt templates, and themes in those directories. That was not tested, but
extensions would execute inside the subprocess.

Consequences:

- **Duplicate project context.** MA injects its own `<project_context>` from `AGENTS.md` / `CLAUDE.md`, and pi injects
  the same file again. The block appears twice in the prompt, costing tokens on every request.
- **Leakage from the pi CLI.** Anything a user keeps in `~/.pi/agent` shows up in MA sessions.
- **Unreviewed code.** A pi extension in `~/.pi/agent/extensions` or `<cwd>/.pi/extensions` would load without MA's
  extension consent flow.

`DefaultResourceLoader` has the switches to settle this: `noContextFiles`, `noSkills`, `noExtensions`,
`noPromptTemplates`, `noThemes`, plus `skillsOverride`, `agentsFilesOverride`, and `additional*Paths` for feeding it MA's
own content. The decision is either to disable discovery and keep MA's injection, or to hand context and skills to pi
and delete MA's injection.

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

Every MCP tool declaration is sent on every request. Pi can keep them out and load them on demand. MA carries the
setting end to end (`McpExposure` in `extensions/types.ts` → `protocol/shared.ts` → `mcp-native-config.ts`) but pins
the default to `'direct'`.

**What pi provides**

- Per-server and per-tool `exposure`: `direct` | `deferred` | `codemode` | `hidden`.
- `createToolSearchExtension()` and `createCodemodeExtension()`, the loader tools the model uses to reach deferred
  tools. They declare `reachesTools`, and `createMcpExtension` waits for the servers a call needs.
- Tools added mid-conversation are defined inline for Anthropic, so activating one does not resend the tool list or
  break the prompt cache.

**Measured** with pi-server driven over its real JSONL protocol against a mock OpenAI endpoint, one stdio MCP server
with 100 realistically described tools, first request of a turn:

| Exposure              | Tool declarations | Request body | ≈ Tokens (bytes / 4) |
| --------------------- | ----------------- | ------------ | -------------------- |
| `direct` (MA today)   | 80 KB             | 84 KB        | 21k                  |
| `deferred`/`codemode` | 15 KB             | 19 KB        | 4.8k                 |

About 77% smaller. Installed extensions such as Postman (~140 tools), Canva, and Strava put real sessions in this range.

**Not turn-key.** In the same measurement the `deferred` and `codemode` requests contained no `tool_search` or
`codemode` tool: MA creates the session with `createMcpExtension()` only, so changing the default would silently remove
those tools from the model. The loader extension has to be registered too.

**Open questions before adopting**

1. **Governance.** `mcp-governance.ts` gates and traces calls through the `tool_call` / `tool_result` hooks. Confirm
   `blockedTools` and the permission round trip still fire for calls reached through `tool_search` and for nested calls
   inside a codemode script (`nested-tool-calls`). A bypass is a security regression.
2. **UI.** The renderer has no rendering for `tool_search` / `codemode` calls or their nested tool calls.
3. **Runtime.** Codemode runs in a QuickJS WASM sandbox (`quickjs-wasi`), untested under `ELECTRON_RUN_AS_NODE` and in
   the packaged app. `tool_search` alone avoids this.
4. **Model behavior.** Deferral costs an extra round trip on first use and depends on the model searching well, which
   weaker or local models may do poorly. Small servers are cheaper left `direct`, so a per-server tool-count threshold
   fits better than a global default.

**Suggested spike:** register `createToolSearchExtension()` only, default servers above about 20 tools to `deferred`,
extend `mcp-governance.test.ts` to cover calls reached through `tool_search`, and re-measure on a real Postman or Canva
session.

## Priorities

1. **Resolve native resource discovery.** Cheap, removes duplicate prompt tokens, and closes the unreviewed-extension
   path.
2. **Deferred MCP exposure spike.** The largest token saving available, gated on the governance question.
3. **Move built-in permission gating into a `tool_call` hook.** Halves the custom `pre_tool_use_*` layer, lets pi report
   `durationMs` without the approval wait (deleting the wait accounting in `tool-duration.ts`), and opens up the
   `context` hook for message pruning.
4. **Decide the skills story.** Fold MA's skills into pi's native loader, or document why they stay separate.
5. **Smaller items.** Replace `clamp()` with pi's truncation helpers, expose retry settings, and use a lighter path
   than a full `AgentSession` for one-shot completions.
