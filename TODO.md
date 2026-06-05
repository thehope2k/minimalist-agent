# TODO

Simple running list of things to do. Add items whenever they come to mind.

**Rule:** when something is resolved, **delete it** — don't tick a checkbox and
leave it. This file tracks what's *left to do*, not what's done. Add a one-line
note only if it'll save someone time later.

---

## High Priority

- [ ] Audit all system prompt locations and fine-tune
- [ ] Check how agents use memory persistence, improve performance and robustness

---

## Features / Improvements

- [ ] Implement hooks/lifecycle automation

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
