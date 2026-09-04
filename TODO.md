# TODO

Simple running list of things to do. Add items whenever they come to mind.

**Rule:** when something is resolved, **delete it** — don't tick a checkbox and leave it. This file
tracks what's *left to do*, not what's done. Add a one-line note only if it'll save someone time later.

---

## High Priority

- [ ] Check how agents use memory persistence, improve performance and robustness
  - Scope = harden the existing single-session memory tier only. Cross-session / semantic / shared
    memory are intentionally OUT (minimalist, single-user).
  - Worth addressing:
    1. **Retrieval cost** — `loadSession` reads the whole `messages.jsonl` into memory every open
       (`storage/sessions.ts`); grows with session length.
    2. **Resume robustness** — `sdkSessionId`/`piSessionId` share one field; missing resume id
       silently starts fresh (`backends/anthropic.ts` `findClaudeSessionFile` warn).

---

## Features / Improvements

*(Nothing pending)*

---

## Documentation

*(Nothing pending)*

---

## Bugs / Issues

- [ ] **Git worktree isolation disabled for sub-agents** (stubbed out in commit b68c671)
  - Feature implemented in commit 77e7599 (May 27, 2026)
  - Disabled next day due to Electron import issues in subprocess
  - `subagent/worktree-stub.ts` (moved from `agent-tool.ts`) uses stub that always returns original CWD
  - AGENTS.md now documents this as disabled (Sep 4, 2026) — re-enable still pending
  - Risk: parallel sub-agents can conflict on package locks, git ops, build outputs
  - Context isolation works ✅ (only input+output in LLM context)
  - Storage isolation works ✅ (unique session paths per sub-agent)
  - Full transcripts persist ✅ (nested events saved to disk)
  - **Root cause found (Sep 4, 2026):** `worktree-manager.ts` is otherwise plain Node
    (`child_process`/`fs`/`path`/`minimatch`) — the only thing that can't load in the
    pi-server subprocess is `import { createLogger } from '../../../logger'`, which pulls
    in `electron-log` + `electron`. That single import is the entire blocker.
  - **Proposed fix:** inject the logger instead of hard-importing it — main process passes
    the real `electron-log`-backed logger, the pi-server subprocess passes
    `shared/sub-logger.ts` (already electron-free, same pattern used elsewhere). Then wire
    `subagent/lifecycle.ts` to the real `createAgentWorktree`/`removeAgentWorktree`/
    `cleanupOrphanedWorktrees` instead of the stubs. Not yet implemented — worth a full
    check for other transitive electron-only imports before flipping the switch.

---

## Tech Debt

- [ ] **Split "god files"** — several modules far exceed the AGENTS.md ~250-line guideline
  (16 `.ts` files >400 lines; 19 `.tsx` components >250; ~68.7K lines total across `src/`).
  Largest remaining offenders:
  - `src/main/pi-server/index.ts` — 1,361 lines. Orchestrates `handleInit`/`handlePrompt`/
    `handleManualCompact`/`dispatch`/the stdin entrypoint, all sharing `activePromptPromise`
    and the OTel span lifecycle via the module-scoped `state` object. Genuinely
    tightly-coupled (deep mutable-state + async-ordering coupling) — further splitting is
    real risk, not mechanical code motion.
  - `src/renderer/src/lib/electron.d.ts` — 1,312 lines (type surface for the whole `window.api`;
    grows with every IPC method, splitting it needs a per-domain type layout decision first)
  - `src/preload/index.ts` — 1,032 lines
  - `src/renderer/src/hooks/useChat.ts` — 969 lines
  - `src/main/storage/sessions.ts` — 799 lines
  - `src/main/agent-runtime/system-prompt.ts` — 798 lines
  - `src/main/agent-runtime/backends/pi/agent.ts` — 719 lines
  - Largest `.tsx`: `src/renderer/src/components/chat/MessageInput.tsx` (376),
    `src/renderer/src/components/settings/CopilotQuotaBar.tsx` (326),
    `src/renderer/src/components/pet/DesktopPet.tsx` (319)

- [ ] **No automated tests** — 0 test/spec files across ~68K lines. Start with highest-risk modules
  (IPC surface, agent loop, worktree manager).

---

## Maybe / Low Priority

*(Ideas that might be worth doing someday)*

---

**Note:** Keep this file simple. Add items freely, don't overthink it. When something's resolved,
delete it (don't leave ticked-off items lying around).
