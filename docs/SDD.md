# SDD (Spec-Driven Development)

**Status:** ⚠️ Broken / Problematic

---

## Current State

SDD is a native Spec-Driven Development workspace panel that was implemented but is currently in a problematic state:

- **Implemented features:**
  - Entity cards with phase badges
  - Artifact viewer (spec.md, plan.md, tasks.md)
  - Constitution viewer
  - Interactive task checkboxes
  - File-system watchers
  - Lazy rule injection
  - Active feature pinning
  - Phase action buttons

- **The problem:**
  - The feature is broken in ways the author is afraid to touch
  - No clear path forward on how to improve it
  - Design and implementation need fundamental rethinking

---

## For Contributors

**Do not attempt major refactors without a clear design plan.**

The SDD system touches:
- `src/renderer/src/components/sdd/` — UI components
- `src/renderer/src/hooks/useSdd.ts` — State management
- `src/main/agent/system-prompt.ts` — Context injection
- `src/main/sdd/` — File watchers and entity scanning

If you have ideas on how to fix or improve SDD, please:
1. Open an issue to discuss the approach first
2. Consider whether the feature should be removed entirely
3. If rebuilding, start with a clear design document

---

## History

- **Shipped:** v0.2.0 (2026-05-06) — Initial implementation
- **Problems emerged:** Shortly after shipping
- **Current status:** Maintained in broken state, no active development

See ROADMAP.md for basic feature description (what it was supposed to do).
