# TODO

Simple running list of things to do. Add items whenever they come to mind, clean them up when done.

---

## High Priority

- [ ] Audit all system prompt locations and fine-tune
- [ ] Check how agents use memory persistence, improve performance and robustness

---

## Features / Improvements

- [ ] Implement hooks/lifecycle automation
- [x] Check that if the Sub-agent context are being isolated or not.

- [ ] **Introduce a real logging layer** (126 raw `console.*` calls today: 50 log / 44 warn / 30 error / 2 debug)
  - Add `src/main/logger.ts` (+ thin shared wrapper): leveled (debug/info/warn/error),
    namespace-prefixed — keep the existing `[scope]` convention already in use
    (`[worktree]`, `[PlanManager]`, `[pi-agent-tool]`, `[useChat]`, …)
  - Silence `debug`/`info` in production builds; only `warn`/`error` by default
  - Pipe to an on-disk rotating file (e.g. `electron-log`) so user bug reports have logs
    — today logs vanish with the devtools session (support blind spot)
  - **Clean:** ~50 `console.log` progress lines are dev noise shipping to prod —
    worst offenders `worktree-manager.ts` (23) and `agent-tool.ts` (14); gate behind debug
  - Normalize severity (some `warn` should be `error`, some `log` should be `debug`)
  - Give renderer logs a prefix convention too (currently mixed)
  - ✅ Good news: no secrets currently logged (token/key/secret/password grep is clean) — keep it that way

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
  - Note: these are also the highest change-risk files and the noisiest loggers —
    pairs naturally with the logging cleanup above.

- [ ] **No automated tests** — 0 test/spec files across ~55K lines.
      Start with highest-risk modules (IPC surface, agent loop, worktree manager).

---

## Maybe / Low Priority

*(Ideas that might be worth doing someday)*

---

**Note:** Keep this file simple. Add items freely, don't overthink it. Delete them when done.
