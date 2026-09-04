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

---

## Tech Debt

- [ ] **Split "god files"** — several modules far exceed the AGENTS.md ~250-line guideline
  (16 `.ts` files >400 lines; 20 `.tsx` components >250). Remaining named offenders:
  - `src/main/pi-server/index.ts` — 2,705 lines (god script, real shared closure `state` object)
  - Note: these are also the highest change-risk files — a natural place to add tests/logging
    discipline as they're split.

- [ ] **No automated tests** — 0 test/spec files across ~68K lines. Start with highest-risk modules
  (IPC surface, agent loop, worktree manager).

---

## Maybe / Low Priority

*(Ideas that might be worth doing someday)*

---

**Note:** Keep this file simple. Add items freely, don't overthink it. When something's resolved,
delete it (don't leave ticked-off items lying around).
