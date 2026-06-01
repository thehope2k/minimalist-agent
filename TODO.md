# TODO

Simple running list of things to do. Add items whenever they come to mind, clean them up when done.

---

## High Priority

- [ ] Consolidate planning workflow docs
- [ ] Check what big components need refactoring
- [ ] Audit all system prompt locations and fine-tune
- [ ] Check how agents use memory persistence, improve performance and robustness

---

## Features / Improvements

- [ ] Fix or remove SDD feature (currently broken)
- [ ] Implement hooks/lifecycle automation
- [x] Check that if the Sub-agent context are being isolated or not.

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

## Maybe / Low Priority

*(Ideas that might be worth doing someday)*

---

**Note:** Keep this file simple. Add items freely, don't overthink it. Delete them when done.
