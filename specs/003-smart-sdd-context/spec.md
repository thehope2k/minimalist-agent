# Feature Specification: Smart SDD Context

**Feature Branch**: `003-smart-sdd-context`
**Created**: 2026-05-06
**Status**: Draft

## Problem Statement

The current SDD prompt injection is coarse: every agent turn receives ~1,000 tokens
of SDD overhead — the full rules block (~900 tokens) plus all features of the active
entity (~120 tokens) — regardless of whether the user's message has anything to do
with SDD.

Three root causes:

1. **No active feature concept.** The injection lists up to 5 features sorted by
   folder name. In a session focused on `004-payment-flow`, the agent still sees
   `001-*` through `005-*` and must infer which one is relevant. A developer
   naturally works on one feature at a time per session.

2. **Rules injected unconditionally.** The full SDD pipeline ruleset is appended to
   every turn, including `"fix this typo"` and `"what does this function return?"`.
   The `Step 0` classification rule mitigates the behaviour but not the token cost.

3. **Phase progression has no UI affordance.** Moving to the next SDD phase requires
   typing undiscoverable phrases like `/speckit.plan` into the chat. There are no
   buttons, no autocomplete, no confirmation. New users have no idea what to type,
   and experienced users must remember the exact phrase each time.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Pin One Feature to a Session (Priority: P1)

A developer opens a session to work on `003-smart-sdd-context`. They want the agent
to focus only on that feature — not reference `001-*` or `002-*` artifacts — and
not waste tokens describing features they are not touching.

**Independent Test**: In the SDD panel, click "Set active" on a feature row. On the
next agent turn, `<sdd_context>` contains only that feature's data. Other features
are absent from the prompt.

**Acceptance Scenarios**:

1. **Given** an entity with features `001-*`, `002-*`, `003-*`, **When** the
   developer sets `003-*` as the active feature, **Then** the next agent turn's
   injected `<sdd_context>` contains only `003-*` artifact state — not `001-*` or
   `002-*`.

2. **Given** no active feature has been pinned, **When** an agent turn runs,
   **Then** the injection falls back to the current behaviour (all features up to
   the cap) so existing sessions are unaffected.

3. **Given** an active feature is pinned, **When** the SDD panel's watcher detects
   a change to that feature's artifacts (e.g. a task is checked off), **Then** the
   updated artifact state appears in the very next agent turn's `<sdd_context>`.

4. **Given** an active feature is pinned, **When** the developer clicks "Clear" on
   the active feature, **Then** the injection reverts to the all-features fallback
   on the next turn.

5. **Given** a pinned active feature, **When** the session is closed and re-opened,
   **Then** the active feature setting is restored — persisted in session metadata
   alongside `sddMode`.

---

### User Story 2 — Full SDD Rules Only When Needed (Priority: P2)

A developer pins `003-smart-sdd-context` and spends ten turns fixing a bug in
`scan.ts` unrelated to any SDD phase. They expect those turns to not carry the
full SDD pipeline ruleset.

**Independent Test**: With an active feature pinned, send a message that contains
no SDD keywords (`specify`, `spec`, `plan`, `task`, `phase`, `constitution`,
`implement`). Inspect the system prompt — the `## SDD Mode` rules block is absent.
The `<sdd_context>` block is still present.

**Acceptance Scenarios**:

1. **Given** an active feature is pinned and the user's message contains no SDD
   keywords, **When** the system prompt is assembled, **Then** the `## SDD Mode`
   rules block is NOT injected — only the lean `<sdd_context>` block is appended
   (~40 tokens).

2. **Given** an active feature is pinned and the user's message contains an SDD
   keyword (e.g. "let's work on the spec"), **When** the system prompt is assembled,
   **Then** the full `## SDD Mode` rules block IS injected alongside `<sdd_context>`.

3. **Given** no active feature is pinned (fallback mode), **When** any agent turn
   runs, **Then** rules injection behaves identically to today — always on when
   SDD mode is `Auto` and entities exist. The lazy rule logic only activates when
   an active feature is pinned.

4. **Given** the first turn of a session (turn index 0) with an active feature
   pinned, **When** the system prompt is assembled, **Then** the full rules block
   IS injected regardless of message content — ensuring the agent is oriented on
   session start.

5. **Given** an active feature at `implement` phase with all tasks done, **When**
   the user sends any message, **Then** the rules block is injected (phase is not
   yet `complete` — the agent may need gate guidance).

---

### User Story 3 — Context Block is Lean and Focused (Priority: P2)

A developer with an active feature pinned wants the `<sdd_context>` block to be
minimal — just what the agent needs to know about the current feature, not a
feature list table.

**Independent Test**: Pin a feature. Count tokens in the injected `<sdd_context>`
block. It must be ≤ 60 tokens.

**Acceptance Scenarios**:

1. **Given** an active feature `003-smart-sdd-context` at `specify` phase with
   only `spec.md` present, **When** the context block is built, **Then** it reads:

   ```
   <sdd_context>
   Active feature: 003-smart-sdd-context (specify phase)
   Artifacts: spec.md
   Tasks: —
   </sdd_context>
   ```

2. **Given** an active feature at `implement` phase with `tasks.md` showing
   4 of 14 done, **When** the context block is built, **Then** it reads:

   ```
   <sdd_context>
   Active feature: 003-smart-sdd-context (implement phase)
   Artifacts: spec.md, plan.md, tasks.md
   Tasks: 4/14 done
   </sdd_context>
   ```

3. **Given** an active feature with extra artifacts beyond core three (e.g.
   `data-model.md`), **When** the context block is built, **Then** extra artifacts
   appear on the `Artifacts:` line after the core three.

---

### User Story 5 — Start the Next Phase from the SDD Panel (Priority: P2)

A developer is looking at the SDD panel. Their feature is at the `specify` phase —
`spec.md` exists, `plan.md` does not. Rather than typing `/speckit.plan` from memory,
they click a **"▶ Start Plan"** button directly in the panel row.

**Independent Test**: Open the SDD panel on a feature at any phase short of `complete`.
A phase action button is visible in the feature row. Clicking it sends the appropriate
SDD directive to the agent and the chat scrolls to the new message. No typing required.

**Acceptance Scenarios**:

1. **Given** the active feature is at `specify` phase (spec.md exists, plan.md does
   not), **When** the developer clicks the phase action button in the panel row,
   **Then** the message `"Let's run /speckit.plan for [feature-name]"` is sent to the
   agent and a new turn begins.

2. **Given** the active feature is at `constitution` phase, **When** the panel action
   button is clicked, **Then** the message targets `/speckit.constitution`.

3. **Given** the active feature is at `implement` phase, **When** the panel action
   button is clicked, **Then** the message targets `/speckit.implement` and includes
   the current task progress as context (e.g. `"4/14 tasks done"`).

4. **Given** the active feature phase is `complete` (all tasks checked), **When**
   the panel renders the feature row, **Then** no phase action button is shown —
   a "Complete ✅" badge appears instead.

5. **Given** no feature is pinned as active, **When** the panel renders a feature row,
   **Then** the phase action button is still present for each feature and sends the
   appropriate message for that specific feature's phase (including the feature name
   so the agent knows which one to act on).

6. **Given** the phase badge in the session header is clicked, **When** the popover
   opens, **Then** it shows the active feature name, current phase, and a
   **"▶ Start [next phase]"** button that behaves identically to the panel button.

---

### User Story 4 — Auto-Pin from Session CWD (Priority: P3)

A developer opens a session from inside a feature's working directory. MA infers
which feature is most relevant and pre-pins it — eliminating the manual step for
the common case.

**Independent Test**: Open a session with CWD pointing to a subdirectory that
contains files named after or referencing a known feature slug. The active feature
is pre-pinned to that feature without user action.

**Acceptance Scenarios**:

1. **Given** an entity with features `001-auth`, `002-payments`, and the user is
   actively editing files whose names or recent git changes associate with `002-*`,
   **When** the session initialises, **Then** `002-payments` is pre-pinned as the
   active feature with a "auto-detected" indicator in the panel.

2. **Given** auto-detection is ambiguous (files from multiple features touched),
   **When** the session initialises, **Then** no feature is auto-pinned — the panel
   shows all features with no active highlight, and the developer can pin manually.

3. **Given** a feature was auto-pinned, **When** the developer explicitly pins a
   different feature, **Then** the explicit choice overrides the auto-detection and
   persists for the session.

---

### Edge Cases

- **Single feature entity**: If the entity has exactly one feature, it is
  automatically treated as the active feature — no UI affordance needed.
- **Phase action button clicked while agent is streaming**: The message is queued
  and delivered after the current turn finishes (same behaviour as typing in the
  input box while streaming). A visual indicator shows the message is queued.
- **Active feature deleted from disk**: If the pinned feature directory is removed
  during the session, the panel shows a "feature not found" warning, clears the pin,
  and falls back to all-features injection on the next turn.
- **Pin restored on session resume but feature no longer exists**: Same as above —
  pin is silently dropped and a non-blocking notice informs the user.
- **Lazy rules + no active feature**: Lazy rule injection is DISABLED when no feature
  is pinned. Rules inject on every turn (today's behaviour). This preserves backward
  compatibility.
- **SDD mode Off**: Neither context block nor rules are injected. Unchanged from today.
- **Turn counting resets on `/new` or session switch**: Turn index resets to 0,
  triggering the always-inject-on-first-turn guarantee (US-2, AC-4).

## Requirements *(mandatory)*

### Functional Requirements

**Active Feature State**

- **FR-001**: The application MUST add an `activeFeatureSlug: string | null` field to
  `SddSessionState`. Default is `null` (no feature pinned).

- **FR-002**: `activeFeatureSlug` MUST be persisted in session metadata (alongside
  `sddMode`) so it survives session close and re-open.

- **FR-003**: The application MUST expose a `sdd:setActiveFeature(sessionId, slug | null)`
  IPC handler that sets or clears the pinned feature and returns the updated state.

- **FR-004**: When `activeFeatureSlug` is non-null but the referenced feature no longer
  exists in the entity's features list, the application MUST silently clear the pin and
  emit a non-blocking notice to the renderer.

**Prompt Injection — Context Block**

- **FR-005**: When `activeFeatureSlug` is non-null, `buildSddPromptBlock` MUST build
  a lean `<sdd_context>` containing only the pinned feature's data:
  active feature name, current phase, artifacts present, and task ratio if applicable.

- **FR-006**: When `activeFeatureSlug` is null, `buildSddPromptBlock` MUST behave
  identically to the current implementation (all features up to the cap).

- **FR-007**: The lean `<sdd_context>` block MUST NOT exceed 60 tokens for any
  feature state combination.

**Prompt Injection — Lazy Rules**

- **FR-008**: The lazy rule injection logic MUST only activate when `activeFeatureSlug`
  is non-null. When no feature is pinned, the full rules block is always injected
  (preserving backward compatibility).

- **FR-009**: When an active feature is pinned, the full `## SDD Mode` rules block
  MUST be injected if ANY of the following conditions is true:
  - It is the first turn of the session (turn index 0)
  - The user message contains any SDD keyword: `specify`, `spec`, `plan`, `task`,
    `phase`, `constitution`, `implement`, `artifact`, `speckit`, `/speckit`

- **FR-010**: When an active feature is pinned and none of FR-009's conditions are
  met, the rules block MUST NOT be injected. Only the lean `<sdd_context>` is appended.

- **FR-011**: The turn index used by FR-009 MUST reset to 0 on session start, `/new`,
  and session resume — ensuring the first message of every session always gets the
  full rules block when a feature is pinned.

**UI — Feature Pin Control**

- **FR-012**: Each feature row in the SDD panel MUST include a pin/activate control.
  Clicking it calls `sdd:setActiveFeature` and immediately updates the panel to
  highlight the active feature.

- **FR-013**: The active feature MUST be visually distinguished in the panel (e.g.
  a filled pin icon, accent border, or badge).

- **FR-014**: When an active feature is set, the panel MUST show a "Clear" control
  to unpin. Clicking it calls `sdd:setActiveFeature(sessionId, null)`.

- **FR-015**: When the entity has exactly one feature, that feature MUST be treated
  as implicitly active — no pin control is shown, and lazy rule injection applies.

- **FR-016**: The SDD phase badge in the session header MUST reflect the pinned
  feature's phase when one is set, rather than the entity-level aggregate phase.

**Phase Action Buttons**

- **FR-020**: Each feature row in the SDD panel MUST display a phase action button
  when the feature's phase is not `complete`. The button label MUST be
  `"▶ Start [Phase]"` where `[Phase]` is the next required phase name.

- **FR-021**: Clicking the phase action button MUST send a pre-composed user message
  to the agent chat. The message MUST include the `/speckit.[phase]` directive and
  the feature name so the agent has unambiguous context.
  Example: `"Let's run /speckit.plan for 003-smart-sdd-context."`

- **FR-022**: For the `implement` phase button, the pre-composed message MUST also
  include the current task progress.
  Example: `"Let's run /speckit.implement for 003-smart-sdd-context (4/14 tasks done)."`

- **FR-023**: When the feature phase is `complete`, the phase action button MUST NOT
  be rendered. A `"Complete ✅"` badge replaces it.

- **FR-024**: The SDD phase badge in the session header MUST be clickable. Clicking
  it MUST open a popover showing the active feature name, current phase, and a
  `"▶ Start [next phase]"` button that triggers the same action as FR-021.

- **FR-025**: If the phase action button is clicked while an agent turn is actively
  streaming, the message MUST be queued and delivered after the current turn ends.
  A visual indicator MUST show the queued state.

- **FR-026**: Phase action buttons MUST appear for all features in the panel, not
  only the pinned active feature. When clicked for a non-active feature, the
  pre-composed message MUST name that specific feature.

**Auto-Detection (US-4)**

- **FR-017**: On session initialisation, if `activeFeatureSlug` is null (no saved
  pin), the application SHOULD attempt to infer the relevant feature by inspecting
  recently modified files in the CWD against feature slugs. If a single feature
  matches with high confidence, it MUST be auto-pinned with an "auto-detected"
  indicator.

- **FR-018**: Auto-detection MUST NOT override a user-set pin. It only applies when
  `activeFeatureSlug` is null at session open.

- **FR-019**: Auto-detection MAY be skipped if it cannot resolve within 500ms. In
  that case, no feature is pinned and the panel shows all features normally.

### Non-Functional Requirements

- **NFR-001**: The lean `<sdd_context>` path (active feature pinned) MUST reduce
  per-turn SDD token overhead from ~1,020 tokens to ≤ 60 tokens for non-SDD messages.

- **NFR-002**: The lazy rule check (keyword scan of user message) MUST complete
  in < 1ms — it is a simple string search, not an LLM call.

- **NFR-003**: Prompt assembly total time MUST remain under 5ms with the new logic.

### Key Entities

- **Active Feature**: The single `SddFeature` pinned for a session. When set, it is
  the sole source of `<sdd_context>` data and the trigger for lazy rule injection.

- **Lean Context Block**: The minimal `<sdd_context>` emitted when an active feature
  is pinned. Contains: feature name, phase, artifacts, task ratio.

- **Lazy Rule Injection**: The mechanism that skips the `## SDD Mode` rules block on
  non-SDD turns when an active feature is pinned. Activated only when a feature is
  pinned; transparent when no feature is set.

- **Turn Index**: A per-session counter incremented on each agent turn. Used to ensure
  the first turn always receives the full rules block.

- **SDD Keyword**: Any of: `specify`, `spec`, `plan`, `task`, `phase`, `constitution`,
  `implement`, `artifact`, `speckit`, `/speckit`. Case-insensitive match against the
  user's raw message text.

## Success Criteria *(mandatory)*

- **SC-001**: With an active feature pinned and a non-SDD message, the per-turn SDD
  token overhead drops from ~1,020 to ≤ 60 tokens — verified by inspecting the
  assembled system prompt string length.

- **SC-002**: With an active feature pinned and an SDD-keyword message, the full rules
  block is present in the system prompt — agent receives complete phase guidance.

- **SC-003**: Pinning a feature in the panel takes effect on the very next agent turn
  with no restart.

- **SC-004**: Active feature pin survives session close and re-open — restored from
  session metadata.

- **SC-005**: Sessions with no active feature pinned behave identically to today —
  zero regression for existing users who never use the pin feature.

- **SC-006**: Single-feature entities automatically apply lazy injection with no user
  action required.

- **SC-007**: A developer can trigger the next SDD phase for any feature without
  typing — only by clicking a button in the panel or phase badge popover.

- **SC-008**: The pre-composed message sent by a phase action button is correctly
  targeted to the clicked feature (not a different feature) in 100% of cases,
  including when no active feature is pinned.

## Assumptions

- Phase action buttons send a user message via the same IPC path as the chat input
  (`send_message` or equivalent) — no new message-injection mechanism is needed.
- The pre-composed message text is sufficient for the agent to correctly identify
  the target feature and phase given the injected `<sdd_context>` block.
- The phase badge popover is a lightweight `<dialog>` or floating `<div>` — it does
  not require a full modal with focus trap; the existing `Button` + `Popover`
  primitives are sufficient.
- The system prompt is rebuilt from scratch on every agent turn (confirmed from
  `buildSystemPromptAppend` architecture) — no caching layer to invalidate.
- Session metadata already supports arbitrary optional fields (confirmed: `sddMode`
  is stored the same way); adding `activeFeatureSlug` requires no schema migration.
- A simple keyword list is sufficient for SDD intent detection. An LLM-based intent
  classifier would be more accurate but is out of scope — the cost of an occasional
  missed injection is a missing ruleset on one turn, which the user can recover from
  by mentioning a keyword.
- Auto-detection (FR-017) is a best-effort enhancement; its absence does not block
  the core feature (manual pin).
- Anthropic prompt caching benefits from the lean context path: the static rules
  block hits cache when injected, and the lean `<sdd_context>` is small enough that
  the cache-miss cost is negligible.
