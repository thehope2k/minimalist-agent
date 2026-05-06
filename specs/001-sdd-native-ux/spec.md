# Feature Specification: SDD Native UX

**Feature Branch**: `001-sdd-native-ux`  
**Created**: 2026-05-05  
**Status**: Draft  
**Input**: User description: "SpecKit / Spec-Driven Development (SDD) native integration for Minimalist Agent — two layers: (1) App UI: directory panel, phase indicator, spec file viewer, SDD project wizard with workspace scan + auto-mapping; (2) Agent Behavior: bundled @speckit skill, auto-injected SDD coaching when entities found, phase-aware system prompt context — zero manual setup required for either layer. Supports all workspace layouts without writing any project files."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Browse All SDD Features Across the Workspace (Priority: P1)

A developer opens a workspace folder in Minimalist Agent. The workspace may contain
one or many microservices, some with embedded specs, some paired with an external spec
repo. They want to see all SDD work in the workspace at a glance — without configuring
anything first.

**Why this priority**: This is the highest-value change for any SDD user. The auto-scan
means zero setup to get value. It delivers independently of the spec viewer and wizard.

**Independent Test**: Open a workspace with at least one `.specify/` directory anywhere
in the tree. The SDD panel appears automatically listing all discovered SpecKit entities
and their features. No config files, no session settings required.

**Acceptance Scenarios**:

1. **Given** a workspace with `service-a/.specify/` and `speckit-service-b/.specify/`
   (two SpecKit entities), **When** the session opens, **Then** the SDD panel lists
   both entities with their feature counts and artifact status badges — without any
   user action.

2. **Given** a workspace with only one SpecKit entity (e.g. `.specify/` at the root),
   **When** the session opens, **Then** the panel shows that single entity's features
   directly, with no mapping UI shown (single entity is unambiguous).

3. **Given** a workspace with no `.specify/` directory anywhere in the scan tree,
   **When** the session opens, **Then** the SDD panel shows an onboarding/empty state
   (not hidden, not an error).

4. **Given** a workspace with multiple entities, **When** the auto-mapping runs,
   **Then** high-confidence mappings (e.g. `service-a/.specify/` directly inside
   `service-a/`) are applied automatically and shown as "auto-mapped"; medium-confidence
   suggestions (e.g. name-similarity match) are shown as "suggested" with a visual
   indicator distinguishing them from confirmed mappings.

5. **Given** a feature directory within a discovered entity, **When** the developer
   clicks it in the panel, **Then** the available artifact files are displayed in the
   spec viewer (see User Story 3).

---

### User Story 2 — Know the Current SDD Phase at a Glance (Priority: P2)

A developer mid-session wants a phase badge in the session header that shows the
current SDD state for the active or most relevant entity — without leaving the chat.

**Why this priority**: Uses the same entity data from Story 1. Passively visible,
reduces context-switching.

**Independent Test**: Open a session in any workspace layout where at least one entity
is discovered. A phase badge appears in the session header reflecting the artifact state
of the active entity. No config needed.

**Acceptance Scenarios**:

1. **Given** a single discovered entity whose active feature has only `spec.md`,
   **When** the session is open, **Then** the session header shows a phase badge
   indicating the next required phase is "Plan".

2. **Given** multiple discovered entities, **When** the session is open, **Then**
   the phase badge reflects the entity mapped to the service folder closest to the
   session CWD (most-specific wins); if no mapping exists for the CWD, the badge
   reflects the single entity or is hidden if ambiguous.

3. **Given** no entities are discovered in the workspace, **When** viewing the session
   header, **Then** no SDD phase badge is shown (absent, not an error label).

4. **Given** a feature with all four artifacts and all tasks checked complete,
   **When** viewing the session header, **Then** the badge shows "Complete".

5. **Given** the session CWD changes to a different service folder that maps to a
   different entity, **When** the change occurs, **Then** the phase badge updates
   to reflect the newly active entity within 2 seconds.

---

### User Story 3 — View SDD Artifact Files in a Structured Way (Priority: P3)

A developer wants to read `spec.md`, `plan.md`, `tasks.md`, or `constitution.md`
from within Minimalist Agent, with tasks rendered as real interactive checkboxes.

**Why this priority**: Improves artifact review inline. The checkbox interaction is the
key differentiator over just using the read tool.

**Independent Test**: Click a `tasks.md` entry in the SDD panel. It renders with
checkboxes matching the file's `[ ]` / `[x]` state. Toggling a checkbox updates the
file on disk (at its actual path, wherever that is in the workspace).

**Acceptance Scenarios**:

1. **Given** a `tasks.md` file with five tasks (three `[x]`, two `[ ]`), **When** the
   developer opens it in the spec viewer, **Then** three checkboxes appear checked and
   two unchecked, accurately reflecting file content.

2. **Given** the developer checks an unchecked task checkbox, **Then** the corresponding
   `[ ]` in the file on disk is updated to `[x]` within 500ms, without a manual save.

3. **Given** a `spec.md` file, **When** displayed in the spec viewer, **Then**
   "Acceptance Scenarios" blocks are visually distinguished from surrounding prose.

4. **Given** `constitution.md` is opened, **When** viewed, **Then** it renders in the
   same structured viewer with checkboxes inactive (constitution has no task checkboxes).

5. **Given** an entity whose `.specify/` lives outside the session CWD (e.g. a paired
   spec repo at a sibling path), **When** the developer toggles a task checkbox,
   **Then** the file at its actual path on disk is updated correctly.

---

### User Story 6 — SDD Agent Behavior Works Without Any Setup (Priority: P2)

A developer opens a project that already has `.specify/`. Without typing `@speckit`,
without installing any skill files, without reading any docs — the agent already
responds in SDD-aware mode: it knows the phase rules, enforces gates, and coaches
them through the workflow. It just works.

**Why this priority**: This is the biggest friction point today. The skill and
extension are manually installed — a new user has no idea they exist. Bundling them
and auto-activating removes the entire setup burden. Ranked P2 because the panel
(P1) provides the data that makes the agent context meaningful.

**Independent Test**: On a clean MA install with no user-installed skills or
extensions, open a project containing `.specify/`. Type "I want to add a feature".
The agent responds with SDD-aware coaching (asks about the spec, mentions phases)
without the user having invoked any skill.

**Acceptance Scenarios**:

1. **Given** a clean MA install with no user-created skills, and a session CWD that
   contains `.specify/`, **When** the user asks the agent to "add a login feature",
   **Then** the agent responds in SDD mode: checks if a spec exists, offers to run
   the Specify phase, and does not jump to writing code.

2. **Given** the workspace scan finds at least one SpecKit entity, **When** the
   agent's next response is generated, **Then** the SDD coaching content has been
   injected into the system prompt — the agent knows all phase rules, gates, and
   workflows without the user typing `@speckit`.

3. **Given** a workspace scan that finds NO SpecKit entities, **When** the agent
   responds, **Then** the SDD coaching content is NOT injected — the agent behaves
   as a regular coding agent with no SDD framing.

4. **Given** a user who explicitly types `@speckit` in a project that already
   auto-injects the skill, **When** the agent processes the message, **Then** the
   skill is not double-injected — the behavior is identical to the auto-injected case.

---

### User Story 7 — Agent Knows the Current Phase Without Being Told (Priority: P3)

A developer is mid-session on a project at the Plan phase. They don't say "we're
in the plan phase" — the agent already knows from the workspace state and responds
appropriately: suggesting `/speckit.plan`, not jumping to tasks or implementation.

**Why this priority**: Makes the agent feel contextually intelligent rather than
stateless. Without this, the user must re-orient the agent every session. With it,
the agent picks up exactly where things left off.

**Independent Test**: Open a session on a project where `spec.md` exists but
`plan.md` does not. Ask the agent "what should we do next?" — it responds
"You're at the Plan phase" and offers to run it, without the user having said
anything about the current state.

**Acceptance Scenarios**:

1. **Given** a project where the active entity has `spec.md` but no `plan.md`,
   **When** the developer asks "what next?", **Then** the agent identifies the
   Plan phase as the next step and offers to run it.

2. **Given** a project where `tasks.md` exists with three unchecked tasks,
   **When** the session opens, **Then** the agent is aware there are pending tasks
   and can reference them directly if asked about progress.

3. **Given** a multi-entity workspace where the CWD maps to `service-a`'s entity,
   **When** the developer discusses a feature, **Then** the agent contextualises
   responses against `service-a`'s spec — not a different service's.

4. **Given** the session CWD changes during a session to a folder mapped to a
   different entity, **When** the next agent response is generated, **Then** the
   injected phase context reflects the newly active entity.

---

### User Story 8 — New User Gets to SDD Without Leaving the App (Priority: P4)

A developer hears about SpecKit and opens Minimalist Agent wanting to try it.
They have nothing installed — no CLI, no skills, no extensions. MA guides them
through the entire setup and into their first spec without ever touching a terminal.

**Why this priority**: First-time experience. Without this, the entry point is
"go read the SpecKit docs, install the CLI, drop some files into userData". That
kills adoption. With it, MA is a self-contained SDD environment.

**Independent Test**: On a fresh MA install, open a session, type "I want to use
SDD / SpecKit". MA detects no specify CLI, walks through setup, installs what
it can in-app, and ends with `.specify/` initialized and the agent in SDD mode.

**Acceptance Scenarios**:

1. **Given** a fresh MA install where `specify` CLI is not found on PATH,
   **When** the user expresses intent to use SDD, **Then** MA shows an in-app
   setup guide with the exact install command and detects completion automatically.

2. **Given** the `specify` CLI is installed but `.specify/` does not exist in the
   CWD, **When** SDD intent is detected, **Then** MA offers to run initialization
   and proceeds with the SDD project wizard (User Story 4).

3. **Given** setup completes successfully, **When** the first session opens on
   the new project, **Then** the agent is automatically in SDD mode (via
   auto-injection from User Story 6) and prompts for the constitution phase.

---

### User Story 4 — Initialize a New SDD Project from Within the App (Priority: P5)

A developer wants to start a new SDD-enabled project entirely from within Minimalist
Agent — no terminal, no CLI commands — and immediately see the new entity in the panel.

**Why this priority**: Onboarding improvement. Experienced users use the CLI; this
lowers the barrier for new SDD users. Most useful after Stories 1 and 2 exist.

**Independent Test**: Open "New SDD Project", pick an empty directory, confirm.
`.specify/` is created, a new session opens, and the SDD panel shows the new entity
with zero features and an onboarding hint.

**Acceptance Scenarios**:

1. **Given** the developer selects a directory with no existing SpecKit entity (in the
   directory or any ancestor found by the scan), **When** they confirm, **Then**
   `specify init` runs, `.specify/` is created, and a new session opens with that
   directory as the CWD.

2. **Given** the developer selects a directory that already contains a SpecKit entity
   (or whose scan would find one), **When** they attempt to confirm, **Then** the UI
   warns "SDD already found at [path]" and does not proceed.

3. **Given** `specify init` fails (e.g. CLI not installed), **When** the error occurs,
   **Then** the UI shows a human-readable error with the install command, and the
   target directory is left unchanged.

4. **Given** a successful wizard completion, **When** the new session opens, **Then**
   the SDD panel shows the new entity with zero features and an onboarding hint to
   run `/speckit-constitution`.

---

### User Story 9 — Disable SDD Mode for a Non-SDD Session (Priority: P5)

A developer opens a project that has `.specify/` from a previous sprint, but today
they just want to fix a bug quickly without SDD coaching. The panel, badge, and
auto-injected context would be noise. They toggle SDD mode off for this session
and the app behaves like a regular coding agent.

**Why this priority**: Escape hatch for the opt-out case. Without it, auto-injection
feels invasive in projects where SDD exists but isn't the current focus. The toggle
aligns with the existing per-session settings model (permission mode, model, etc.).

**Independent Test**: In a session on a project with `.specify/`, toggle SDD mode to
Off. The panel disappears, the phase badge disappears, and the next agent response
has no SDD framing — verified by asking a coding question and confirming no phase
gates or spec references appear.

**Acceptance Scenarios**:

1. **Given** a session where SDD mode is `Auto` and entities were found and injected,
   **When** the developer switches SDD mode to `Off`, **Then** the panel and phase
   badge are hidden immediately, and the SDD context is NOT injected on the next turn.

2. **Given** a session where SDD mode is `Off`, **When** the session opens on a
   project with `.specify/`, **Then** no scan runs, no panel appears, no badge appears,
   and no SDD content is injected into any turn.

3. **Given** a session with SDD mode `Off`, **When** the developer switches it back
   to `Auto`, **Then** the scan runs immediately, entities are mapped, the panel and
   badge appear, and SDD context is injected on the next turn.

4. **Given** SDD mode is switched mid-session while an agent turn is active (streaming),
   **Then** the current turn is not interrupted; the mode change takes effect starting
   from the next turn, and a non-blocking notice informs the user.

---

### User Story 5 — Correct or Reassign an Entity Mapping (Priority: P5)

A developer sees that the auto-mapping assigned `service-b` to the wrong spec entity
(or left a service unassigned). They want to correct the mapping directly in the panel
without leaving the app or editing any config files.

**Why this priority**: The auto-mapping is best-effort. The correction UI is the safety
net that makes the whole scan model practical. Without it, a wrong heuristic is a
permanent wrong answer.

**Independent Test**: In the SDD panel, reassign a service from one entity to another.
The phase badge and panel content for that service immediately reflect the new entity.
No files are written to disk. The mapping persists for the rest of the session.

**Acceptance Scenarios**:

1. **Given** `service-b` is shown as mapped to `speckit-service-a/.specify/` (wrong),
   **When** the developer selects a different entity from a dropdown in the panel row
   for `service-b`, **Then** the mapping updates immediately and the panel shows the
   features from the correct entity.

2. **Given** a service folder shown as "unassigned" in the panel, **When** the developer
   picks an entity from the available list, **Then** the mapping is created and the
   panel shows that service's artifact status.

3. **Given** any mapping change (auto or manual), **Then** no files are written to the
   project directory or any other directory — the mapping is stored in the session only
   and is lost when the session ends.

4. **Given** a new session is opened on the same workspace, **When** the session opens,
   **Then** the auto-mapping runs fresh — there is no persistence of previous manual
   corrections across sessions. The scan and mapping start clean every time.

---

### Edge Cases

- **SDD mode Off with `.specify/` present**: No scan runs, no panel, no badge, no
  coaching injection. The project directory is unchanged; `.specify/` still exists on
  disk. Switching back to Auto triggers an immediate scan.
- **Speckit-only repo as CWD**: If the session CWD is a repo that contains only
  `.specify/` (a pure spec repo), the entity maps to itself as the root. Single-entity
  rule applies — no mapping UI shown.
- **Speckit-only repo in workspace scan**: If `speckit-service-b/` is discovered as a
  sibling of `service-b/`, name-similarity heuristic suggests mapping `service-b →
  speckit-service-b/.specify/` at medium confidence.
- **Two entities with equal claim on a service**: Flagged as a conflict in the panel.
  The service row shows a "⚠️ Conflict" state and prompts the user to resolve manually.
- **Entity with no service folder mapped**: Shown in an "Unassigned entities" section
  at the bottom of the panel. Not hidden.
- **Service folder with no entity candidate**: Shown as "Unassigned" in the panel.
  Not hidden.
- **Empty specs dir**: A `.specify/specs/` feature directory with no artifact files
  (e.g. only `checklists/`) shows all badges as ⏳, not hidden.
- **Scan depth**: Scan stops at 3 directory levels by default; directories named
  `node_modules`, `.git`, `dist`, `build`, `out`, `.cache` are never descended into.
  `.gitignore` patterns in the workspace root are respected.
- **Large feature count per entity**: The panel MUST be scrollable; no pagination for v1.
- **Malformed `tasks.md`**: No checkboxes → "implemented" defaults to ⏳, not an error.
- **CWD changes mid-session**: Re-runs the active entity resolution (for the phase badge)
  within 2 seconds. The full scan and mapping is NOT re-run on CWD change — only the
  "which entity is active for this CWD" determination updates.
- **Mapping change during active stream**: The current turn uses the old context.
  A non-blocking notice appears: “SDD context updated — active on your next message.”
  The turn is not interrupted or cancelled.
- **SDD mode toggle during active stream**: Same behaviour — current turn is not
  interrupted; change takes effect on the next turn.
- **Symlinked `.specify/` directories**: Resolved to their real path before operations.

## Requirements *(mandatory)*

### Functional Requirements

**Workspace Scan**

- **FR-001**: When a session opens, the application MUST scan the session CWD
  recursively for `.specify/` directories, to a maximum depth of 3 levels.

- **FR-002**: The scan MUST skip directories named `node_modules`, `.git`, `dist`,
  `build`, `out`, and `.cache`. If a `.gitignore` file exists at the CWD root, its
  patterns MUST also be excluded from the scan.

- **FR-003**: Each discovered `.specify/` directory is a **SpecKit Entity**. The scan
  result is the complete list of entities for the session — it does not change unless
  the user manually triggers a re-scan.

- **FR-004**: The application MUST infer an **Entity Role** for each discovered entity
  based on its location:
  - *Embedded*: `.specify/` is directly inside a folder that also contains code
  - *Paired*: `.specify/` is the primary content of a folder whose name suggests a
    partner service (e.g. `speckit-service-a/` alongside `service-a/`)
  - *Standalone*: `.specify/` is the only content of the CWD itself (speckit-only repo)
  - *Shared*: `.specify/` is at the workspace root with no clear single owner

**Auto-Mapping**

- **FR-005**: After scanning, the application MUST auto-map entities to service folders
  using the following confidence rules, applied in order:
  - *High confidence (auto-apply)*: the entity's `.specify/` is directly inside a
    service folder (e.g. `service-a/.specify/`)
  - *Medium confidence (shown as suggested)*: the entity folder's name contains or
    matches the service folder's name (e.g. `speckit-service-b/` ↔ `service-b/`)
  - *Low / no match*: entity is left unassigned

- **FR-006**: When only one entity is found in the entire workspace, the application
  MUST treat it as the root entity for all service folders — no mapping UI is shown.

- **FR-007**: When two or more entities claim the same service folder at the same
  confidence level, that service MUST be flagged as a conflict rather than
  silently assigning one.

**Mapping Storage**

- **FR-008**: All mapping data (auto-mapped and user-corrected) MUST be stored in the
  session data only. No files of any kind are written to the project directory or any
  other directory on disk as a result of mapping activity.

- **FR-009**: Mappings do NOT persist across sessions. Each new session starts with a
  fresh scan and fresh auto-mapping. There is no mechanism to save or restore mappings.

**Directory Panel**

- **FR-010**: The application MUST display a side panel listing all discovered SpecKit
  entities, grouped or labelled by their inferred role.

- **FR-011**: For each entity, the panel MUST show its mapped service folder(s) and
  the confidence level of each mapping (auto-mapped / suggested / unassigned / conflict).

- **FR-012**: For each entity, the panel MUST show all feature directories under its
  `.specify/specs/`, with artifact status badges for `spec.md`, `plan.md`, `tasks.md`,
  and implemented state (derived from `tasks.md` checkbox ratio).

- **FR-013**: The panel MUST include an "Unassigned" section showing entities and service
  folders that could not be automatically mapped.

- **FR-014**: The panel MUST provide a re-scan control that re-runs FR-001 through
  FR-007 on demand (e.g. when a new service or spec repo is added mid-session).

- **FR-015**: The panel MUST reflect live file-system state for artifact files; it MUST
  refresh when files under any discovered entity's `.specify/specs/` are created,
  modified, or deleted.

**Phase Indicator**

- **FR-016**: The application MUST display a phase badge in the session header when
  at least one entity is discovered. The badge MUST NOT appear when the scan finds
  no entities.

- **FR-017**: When multiple entities exist, the phase badge MUST reflect the entity
  mapped to the service folder that most specifically contains the current session CWD.
  If no mapping covers the CWD, and only one entity exists, that entity is used.
  If ambiguous, the badge is hidden.

- **FR-018**: The phase badge MUST indicate the next required SDD phase using the
  canonical order: Constitution → Specify → Plan → Tasks → Implement → Complete.

- **FR-019**: When the session CWD changes, the phase badge MUST re-evaluate the active
  entity within 2 seconds (without re-running the full scan).

**Mapping Correction UI**

- **FR-020**: For each service folder row in the panel, the application MUST provide
  a control to reassign the mapped entity, choosing from the list of all discovered
  entities in the session.

- **FR-021**: For each unassigned service folder or entity, the application MUST
  provide a control to create a mapping manually.

- **FR-022**: Mapping changes MUST take effect immediately in the panel and phase badge
  without requiring any restart or reload.

**Spec File Viewer**

- **FR-023**: Clicking a feature entry in the panel MUST open its artifact files in a
  structured viewer within the application.

- **FR-024**: The spec viewer MUST render `tasks.md` checkboxes as interactive controls;
  toggling a checkbox MUST persist the change to the file at its actual path on disk.

- **FR-025**: The spec viewer MUST visually distinguish Acceptance Scenario blocks within
  `spec.md` from surrounding prose.

- **FR-026**: File writes from the spec viewer (FR-024) MUST target the actual path of
  the artifact file, which may be outside the session CWD.

**SDD Project Wizard**

- **FR-027**: The application MUST provide a "New SDD Project" entry point that runs
  `specify init` in a user-selected directory and opens a new session for that directory.

- **FR-028**: The wizard MUST check whether the selected directory (or any ancestor
  within the scan depth) already contains a SpecKit entity; if so, it MUST warn and
  not overwrite.

- **FR-029**: A failed `specify init` invocation MUST leave the target directory
  unchanged (no partial state).

**Agent Behavior — Bundled Skill**

- **FR-030**: The SDD coaching content (equivalent to the current `@speckit` SKILL.md)
  MUST be bundled with Minimalist Agent as a built-in capability. No user installation
  of any skill file is required to get SDD-aware agent behavior.

- **FR-031**: When the workspace scan (FR-001) finds at least one SpecKit entity,
  the application MUST automatically inject the SDD coaching content into the system
  prompt for that session — without any `@mention` or explicit user action.

- **FR-032**: When the workspace scan finds no SpecKit entities, the SDD coaching
  content MUST NOT be injected. The agent behaves as a regular coding agent.

- **FR-033**: If the user explicitly invokes `@speckit` in a session that has already
  auto-injected the skill, the behavior MUST be identical to the auto-injected case —
  no duplication, no conflict.

**Agent Behavior — Phase-Aware Context**

- **FR-034**: When SDD coaching is active (FR-031), the system prompt MUST also include
  the current SDD state derived from the workspace scan: the active entity for the
  session CWD, the current phase, and the list of existing artifacts.

- **FR-035**: The injected phase context MUST update when the session CWD changes
  (within the same 2-second window as the phase badge update, FR-019).

- **FR-036**: In a multi-entity workspace, the injected context MUST reflect only the
  entity mapped to the current session CWD — not all entities simultaneously.

**Agent Behavior — Bundled Extension and Setup**

- **FR-037**: The speckit extension (providing `specify` CLI access) MUST be bundled
  with Minimalist Agent and pre-activated by default — no manual drop-in to userData
  required.

- **FR-038**: When the workspace scan finds SpecKit entities but the `specify` CLI is
  not found on the system, the application MUST surface a non-blocking notice in the
  SDD panel with the CLI install command. Agent behavior (FR-031) still activates —
  the CLI is only needed for running `specify init` and related commands.

- **FR-039**: When a user with no SpecKit setup expresses intent to use SDD (e.g.
  mentions "spec", "SpecKit", or "SDD" in a session with no entities found), the
  application MUST offer an in-app setup flow that installs the CLI and initializes
  the project without leaving MA.

**Session-Level SDD Mode**

- **FR-040**: The application MUST provide a per-session “SDD mode” toggle with two
  states: `Auto` (default) and `Off`. The toggle MUST appear alongside existing
  session settings (permission mode, model selection).

- **FR-041**: In `Auto` mode: the workspace scan runs at session open; the panel and
  badge appear if entities are found; SDD coaching is injected into the system prompt.
  This is the default for all new sessions.

- **FR-042**: In `Off` mode: no scan runs; the panel and badge are hidden; no SDD
  content is injected into any turn, regardless of whether `.specify/` exists on disk.

- **FR-043**: Switching SDD mode from `Off` to `Auto` mid-session MUST immediately
  trigger a scan, populate the panel and badge, and inject SDD context starting from
  the next agent turn.

- **FR-044**: Switching SDD mode from `Auto` to `Off` mid-session MUST immediately
  hide the panel and badge, and stop injecting SDD context starting from the next
  agent turn.

- **FR-045**: Any SDD mode change during an actively streaming agent turn MUST NOT
  interrupt or cancel the current turn. The change takes effect on the next turn,
  and a non-blocking notice informs the user.

**System Prompt Lifecycle**

- **FR-046**: The SDD phase context (FR-034) MUST be rebuilt from the current session
  mapping state on every agent turn — not cached from session open. This ensures
  mid-session mapping changes are automatically reflected without any special handling.

- **FR-047**: When a mapping change occurs (user correction via the panel), a
  non-blocking notice MUST inform the user: “SDD context updated — active on your
  next message.” No restart or reload is required.

- **FR-048**: If a mapping change occurs while an agent turn is actively streaming,
  the notice MUST still appear but the current turn MUST NOT be interrupted.

### Key Entities

- **SpecKit Entity**: A discovered `.specify/` directory in the workspace. Has a path,
  an inferred role, a set of features, and zero or more mapped service folders.

- **Entity Role**: Inferred classification of a SpecKit entity based on its location
  relative to the workspace structure: *Embedded*, *Paired*, *Standalone*, or *Shared*.

- **Workspace Mapping**: The session-scoped table that links service folders to SpecKit
  entities. Built by auto-mapping heuristics, correctable by the user. Never persisted
  to disk.

- **Mapping Confidence**: The reliability level of an auto-generated mapping —
  *High* (direct containment, auto-applied), *Medium* (name similarity, shown as
  suggested), or *Unassigned* (no match found).

- **SDD Feature**: A named directory under `<entity>/.specify/specs/`. Has a name,
  a sequence number, and an artifact set.

- **Artifact**: One of `spec.md`, `plan.md`, `tasks.md`, `constitution.md`.

- **Artifact Status**: Presence/absence of an artifact file; for `tasks.md`, the ratio
  of checked `[x]` to total checkboxes.

- **SDD Phase**: The next required phase derived deterministically from which artifacts
  exist across the canonical phase order.

- **Bundled SDD Skill**: The SDD coaching content shipped as part of the MA application.
  Functionally identical to the `@speckit` SKILL.md but requires no user installation
  and auto-activates when SpecKit entities are found in the workspace.

- **Phase-Aware Context**: The snapshot of current SDD state (active entity, current
  phase, existing artifacts) injected into the system prompt alongside the bundled skill
  content. Gives the agent situational awareness of where the project stands without
  the user having to explain it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can see all SDD features across the workspace — regardless of
  layout — within 5 seconds of opening a session, with zero configuration steps.

- **SC-002**: A developer can identify the artifact status of any feature in any
  discovered entity without running CLI commands or navigating the file system manually.

- **SC-003**: Checking or unchecking a task in the spec viewer is reflected on disk and
  in the panel's status badges within 1 second.

- **SC-004**: 100% of sessions where at least one SpecKit entity is discovered show a
  phase badge; 0% of sessions with no discovered entities show a badge.

- **SC-005**: A developer with no prior SpecKit CLI setup can initialize a new SDD
  project entirely from within the app in under 3 minutes, ending with a functional
  `.specify/` structure and an open session.

- **SC-006**: All workspace layouts — per-repo, monorepo, dedicated spec repos,
  multi-service per-service spec repos — are handled with zero project-level
  configuration files required.

- **SC-007**: A developer on a clean MA install opens an existing SDD project and
  receives SDD-aware agent responses (phase coaching, gate enforcement) without
  installing any skill files, typing any @mentions, or reading any setup docs.

- **SC-008**: A brand-new MA user who has never used SpecKit can go from zero to a
  running SDD session — CLI installed, project initialized, agent in SDD mode —
  entirely within the app, in under 5 minutes.

- **SC-009**: In a session where SDD entities are found, the agent correctly identifies
  the current phase unprompted in 100% of cases where artifact state is unambiguous.

## Assumptions

- The `specify` CLI (v0.8.5) is needed only for wizard/init operations; all other
  features (panel, indicator, viewer, mapping, agent behavior) require only file-system
  read access and the bundled skill content.
- The canonical `.specify/` directory structure created by `specify init` v0.8.5 is
  stable between minor CLI versions.
- The scan depth of 3 levels covers all realistic workspace layouts; deeply nested
  `.specify/` directories (depth 4+) are considered unusual and out of scope for v1.
- Multi-entity workspaces are the primary motivation for this feature; single-entity
  workspaces work as a natural subset via the single-entity shortcut (FR-006).
- Mapping corrections by the user are session-scoped and intentionally ephemeral —
  there is no persistence mechanism and no user expectation of persistence.
- Real-time file-watching extends to all discovered entity paths, including those
  outside the session CWD.
- The phase indicator reflects the "most specific" entity for the current CWD; in
  ambiguous cases it hides rather than guessing.
- The bundled SDD skill content is kept in sync with `@speckit` SKILL.md upstream;
  version drift between the bundled content and the installed CLI version is acceptable
  across minor CLI versions but requires an update for major CLI changes.
- The system prompt append in MA is already rebuilt on every agent turn (per the
  existing `buildSystemPromptAppend` architecture); the SDD phase context injection
  uses this existing per-turn rebuild, requiring no architectural changes to the
  prompt assembly pipeline.
- Mobile and non-desktop targets are out of scope; this is a desktop Electron app only.
