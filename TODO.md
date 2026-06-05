# TODO

Simple running list of things to do. Add items whenever they come to mind.

**Rule:** when something is resolved, **delete it** — don't tick a checkbox and
leave it. This file tracks what's *left to do*, not what's done. Add a one-line
note only if it'll save someone time later.

---

## High Priority

- [ ] Audit all system prompt locations and fine-tune
- [ ] Check how agents use memory persistence, improve performance and robustness
  - Scope = harden the existing single-session memory tier only. Cross-session /
    semantic / shared memory are intentionally OUT (minimalist, single-user).
  - Worth addressing:
    1. **Retrieval cost** — `loadSession` reads the whole `messages.jsonl` into
       memory every open (`storage/sessions.ts`); grows with session length.
    2. **Compaction robustness** — lossy + untested, and SDK vs Pi compact
       differently (`agent/events.ts`, `pi-server/event-adapter.ts`).
    3. **Forgetting/housekeeping** — sessions and sub-agent dirs
       (`.agents/<execId>`) grow unbounded, never pruned (`agent-tool.ts`).
    4. **Resume robustness** — `sdkSessionId`/`piSessionId` share one field;
       missing resume id silently starts fresh (`backends/anthropic.ts`
       `findClaudeSession` warn); mid-session SDK↔Pi toggle drops context.

---

## Features / Improvements

- [ ] Implement hooks/lifecycle automation
- [ ] **Configurable agent backend (Claude Agent SDK vs Pi) for Anthropic models** —
      let users route an Anthropic connection through the Pi backend instead of
      the Claude Agent SDK.
  - **Investigated (Jun 2026): FEASIBLE.** pi-ai ships a first-class `anthropic`
    provider that handles BOTH api-key and OAuth/Claude-Max auth, including the
    required `oauth-2025-04-20` / `claude-code-20250219` beta headers +
    `claude-cli` user-agent (`pi-ai/dist/providers/anthropic.js`, OAuth provider
    `id:"anthropic"`). The historical OAuth-header blocker is already solved.
  - **Why it's worth doing:** planning workflow + intelligent collaboration are
    implemented ONLY in the Pi subprocess (`collaboration-handlers.ts`,
    `planning/manager.ts` are imported solely by `pi-server/index.ts`). The
    Claude Agent SDK backend accepts `askCollaboration` but never wires it.
    So today Anthropic/Claude-Max users are entirely excluded from the app's
    signature features. Pi routing is the cheapest path to include them.
  - **Capability gap (NOT symmetric — don't ship as a silent swap):**
    - SDK-only: native Claude Code tool preset, `settingSources`
      (user/project/local CLAUDE.md), SDK session `resume`, native PDF blocks,
      1M-context suffix (`models.ts`).
    - Pi-only: planning + collaboration.
  - **Required changes (~2–4 days, mostly plumbing + UI):**
    1. add `'anthropic'` to `PiAuthProvider` / `PiAuth.provider` unions
       (`pi-types.ts`, `backends/pi/protocol.ts`)
    2. accept Anthropic auth in `PiChatRequest.auth`; map to `piAuth`
       (oauth `sk-ant-oat…` → `{type:'api_key'}`, pi-ai auto-detects)
    3. pass `'anthropic'` to `getModel(...)` in `pi-server/index.ts` (already generic)
    4. per-connection backend override in `runAgentChat` (`claude.ts`) — today it
       branches purely on `auth.type`
    5. `backend?: 'sdk' | 'pi'` on `ConnectionMeta` + connection-flow toggle
    6. add an `anthropic_oauth` branch to the Pi `auth_required` refresh handler
       (currently Copilot/Codex-shaped)
  - **Risks:** doubles the test surface on already high-risk untested files
    (`agent.ts`, `pi-server/index.ts`); SDK↔Pi session transcripts are stored
    differently, so a mid-conversation toggle silently drops context; PDF
    attachments degrade on Pi (no document block).
  - **Recommended shape:** per-connection, FEATURE-LED toggle ("Enable planning &
    guided collaboration"), default = current SDK behavior, warn on mid-session
    change. Spike the dispatcher+protocol path end-to-end before building UI.

---

## Documentation

*(Nothing pending)*

---

## Bugs / Issues

- [ ] **Git worktree isolation disabled for sub-agents** (stubbed out in commit b68c671)
  - Feature implemented in commit 77e7599 (May 27, 2026)
  - Disabled next day due to Electron import issues in subprocess
  - `agent-tool.ts` uses stub that always returns original CWD
  - AGENTS.md still documents feature as active (needs update OR re-enable)
  - Risk: Parallel sub-agents can conflict on package locks, git ops, build outputs
  - Context isolation works ✅ (only input+output in LLM context)
  - Storage isolation works ✅ (unique session paths per sub-agent)
  - Full transcripts persist ✅ (nested events saved to disk)

---

## Tech Debt

- [ ] **Split "god files"** — several modules far exceed the AGENTS.md ~250-line guideline
      (16 files >400 lines; 23 `.tsx` components >250). Biggest offenders:
  - `src/main/pi-server/index.ts` — 1,699
  - `src/main/ipc.ts` — 1,542
  - `src/renderer/src/hooks/useChat.ts` — 1,424
  - `src/main/agent/backends/pi/agent.ts` — 1,000
  - `src/main/agent/backends/pi/agent-tool.ts` — 739
  - Note: these are also the highest change-risk files —
    a natural place to add tests/logging discipline as they're split.

- [ ] **No automated tests** — 0 test/spec files across ~55K lines.
      Start with highest-risk modules (IPC surface, agent loop, worktree manager).

---

## Maybe / Low Priority

*(Ideas that might be worth doing someday)*

---

**Note:** Keep this file simple. Add items freely, don't overthink it. When
something's resolved, delete it (don't leave ticked-off items lying around).
