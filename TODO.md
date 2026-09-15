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

_(Nothing pending)_

---

## Tech Debt

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
