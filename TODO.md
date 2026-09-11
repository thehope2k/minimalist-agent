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
    2. **Transcript robustness** — a missing `runtimeSessionId` silently skips transcript
       forking when a session is branched.

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
  (16 `.ts` files >400 lines; 18 `.tsx` components >250; ~69.3K lines total across `src/`).
  Sizes refreshed Sep 11, 2026 — growing since the list was first written:
  - `src/main/pi-server/index.ts` — 1,345 lines (was 1,361). Orchestrates `handleInit`/
    `handlePrompt`/`handleManualCompact`/`dispatch`/the stdin entrypoint, all sharing
    `activePromptPromise` and the OTel span lifecycle via the module-scoped `state` object.
    Genuinely tightly-coupled (deep mutable-state + async-ordering coupling) — further
    splitting is real risk, not mechanical code motion.
  - `src/renderer/src/lib/electron.d.ts` — 1,335 lines (type surface for the whole `window.api`;
    grows with every IPC method, splitting it needs a per-domain type layout decision first)
  - `src/preload/index.ts` — 1,043 lines
  - `src/renderer/src/hooks/useChat.ts` — **1,029 lines (was 969, fastest-growing)**. Best
    splitting candidate: `hooks/chat/` already holds successfully extracted pieces
    (`apply-event.ts`, `session-store.ts`, `use-plan-state.ts`, `use-checkpoints.ts`,
    `use-auto-title.ts`) — the pattern is proven in this exact file, unlike the
    tightly-coupled files above. Next candidate concerns to extract: streaming-state
    setters, session-switch effects, compaction handling.
  - `src/main/storage/sessions.ts` — 799 lines
  - `src/main/agent-runtime/system-prompt.ts` — 804 lines
  - `src/main/agent-runtime/pi/agent.ts` — 724 lines
  - Largest `.tsx`: `src/renderer/src/components/chat/MessageInput.tsx` (**419, was 376,
    also fast-growing**), `src/renderer/src/components/git/GitDiffModal.tsx` (368),
    `src/renderer/src/components/git/GitFileList.tsx` (355),
    `src/renderer/src/components/pet/DesktopPet.tsx` (319),
    `src/renderer/src/components/settings/panels/AIPanel.tsx` (291)

- [ ] **Provider quota fetchers have no shared type** — `src/main/chatgpt/quota.ts` and
  `src/main/copilot/quota.ts` are independently hand-rolled (justified — genuinely different
  response shapes/billing models) but share no `QuotaResult` interface despite both feeding
  the same UI budget pill. Not worth abstracting over just two providers; revisit if a third
  provider's quota fetcher gets added.

---

## Maybe / Low Priority

*(Ideas that might be worth doing someday)*

---

**Note:** Keep this file simple. Add items freely, don't overthink it. When something's resolved,
delete it (don't leave ticked-off items lying around).
