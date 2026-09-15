# TODO

Simple running list of things to do. Add items whenever they come to mind.

**Rule:** when something is resolved, **delete it** — don't tick a checkbox and leave it. This file
tracks what's _left to do_, not what's done. Add a one-line note only if it'll save someone time later.

---

## High Priority

- [ ] Check how agents use memory persistence, improve performance and robustness
  - Scope = harden the existing single-session memory tier only. Cross-session / semantic / shared
    memory are intentionally OUT (minimalist, single-user).
  - Worth addressing:
    1. **Retrieval cost** — `loadSession` still materializes the full `messages.jsonl` history for
       the renderer (`storage/sessions.ts`); grows with session length. Chunked parsing now avoids
       retaining an additional full raw-file string and split-line array, but pagination/lazy UI
       loading is needed to eliminate the remaining growth.

---

## Features / Improvements

_(Nothing pending)_

---

## Documentation

_(Nothing pending)_

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

- [ ] **Split "god files"** — several modules exceed the AGENTS.md ~250-line guideline.
      Full inventory refreshed Sep 15, 2026 (12 `.ts` files >400 lines; 4 `.tsx` components >250;
      ~70.4K lines total across `src/`):
  - `src/main/pi-server/index.ts` — 1,444 lines. Orchestrates `handleInit`/
    `handlePrompt`/`handleManualCompact`/`dispatch`/the stdin entrypoint, all sharing
    `activePromptPromise` and the OTel span lifecycle via the module-scoped `state` object.
    Genuinely tightly-coupled (deep mutable-state + async-ordering coupling) — further
    splitting is real risk, not mechanical code motion.
  - `src/shared/electron-api.ts` — 1,311 lines. Authoritative `window.api` contract shared by the
    renderer declaration and six preload-domain factories; this prevents contract drift. Split its
    type definitions by domain only when the shared contract becomes difficult to navigate.
  - `src/main/agent-runtime/pi/agent.ts` — 728 lines
  - `src/main/agent-runtime/planning/manager.ts` — 552 lines
  - `src/main/agent-runtime/pi/worktree-manager.ts` — 542 lines
  - `src/main/pi-server/event-adapter.ts` — 526 lines
  - `src/shared/otel.ts` — 505 lines
  - `src/main/agent-runtime/errors.ts` — 490 lines
  - `src/main/agent-runtime/pi/protocol.ts` — 472 lines
  - `src/main/browser/browser-cdp.ts` — 450 lines
  - `src/main/pi-server/ssrf-guard.ts` — 422 lines
  - `src/main/pi-server/planning-tools.ts` — 411 lines
  - `.tsx`: `src/renderer/src/components/chat/MessageInput.tsx` — 400 lines
  - `.tsx`: `src/renderer/src/components/layout/ChatArea.tsx` — 270 lines
  - `.tsx`: `src/renderer/src/components/git/GitDiffModal.tsx` — 266 lines
  - `.tsx`: `src/renderer/src/components/git/GitDiffView.tsx` — 262 lines

- [ ] **Provider quota fetchers have no shared type** — `src/main/chatgpt/quota.ts` and
      `src/main/copilot/quota.ts` are independently hand-rolled (justified — genuinely different
      response shapes/billing models) but share no `QuotaResult` interface despite both feeding
      the same UI budget pill. Not worth abstracting over just two providers; revisit if a third
      provider's quota fetcher gets added.

---

## Maybe / Low Priority

_(Ideas that might be worth doing someday)_

---

**Note:** Keep this file simple. Add items freely, don't overthink it. When something's resolved,
delete it (don't leave ticked-off items lying around).
