---
name: Minimalist Agent Release
slug: minimalist-agent-release
description: Cut a new release for minimalist-agent — changelog, version bump, tag, push.
---

# Release Process — minimalist-agent

Follow these steps **in order** every time the user asks to process a release.

## 1 — Confirm working directory

All commands run from `minimalist-agent/minimalist-agent/` (the Electron app package, not the monorepo root).

## 2 — Determine bump type

**If the user explicitly names the bump type** (`patch`, `minor`, `major`, or a version string), use that — no analysis
needed.

**If no type is specified**, do NOT default to `patch`. Instead, collect the commits first (Step 3) and classify the
bump from the actual content:

| Bump    | Signal in the commits                                                                                                                   |
|---------|-----------------------------------------------------------------------------------------------------------------------------------------|
| `patch` | Only bug fixes, typo corrections, dependency updates, or minor internal tweaks — nothing user-visible was added or changed in behaviour |
| `minor` | At least one new user-visible feature, capability, or meaningful UX improvement — no breaking changes                                   |
| `major` | A breaking change, removed public API, significant redesign, or migration required from users                                           |

**Classification rules — apply the highest matching tier:**

1. Any breaking change or removed feature → **major**
2. Any new feature or user-visible capability added → **minor**
3. Only fixes / tweaks / chores → **patch**

After classifying, **state the chosen bump type and your reasoning** in one sentence before proceeding (e.g. *"
Classifying as `minor` — three new user-facing features added, no breaking changes."*).

## 3 — Collect commits since last tag

First, identify the last release tag and the current version so the range is explicit:

```bash
# Confirm the last release tag
git describe --tags --abbrev=0

# Read the current version from package.json
node -e "console.log(require('./package.json').version)"
```

**Compute the new version number now**, before writing the changelog.
Apply the bump type to the current version yourself (semver arithmetic):

| Current | Bump  | New version |
|---------|-------|-------------|
| 0.1.7   | patch | 0.1.8       |
| 0.1.7   | minor | 0.2.0       |
| 0.1.7   | major | 1.0.0       |

This is the version string you will use in the `## [X.Y.Z]` changelog header **and** in the release script invocation.
Do not guess — if in doubt, confirm with `node -e "const s=require('./package.json').version.split('.');..."`.

Then collect all commits since that tag:

```bash
git log $(git describe --tags --abbrev=0)..HEAD --format="%h %s" --no-merges
```

If there is no previous tag (first ever release), omit the range and use `git log --format="%h %s" --no-merges`.

Categorise into **Added**, **Changed**, **Fixed** — ignore pure chore/infra commits in the user-facing notes.

**Non-published bug rule:** If a `fix` commit targets a feature that was **also introduced in this same release** (i.e.
the bug was never present in any previously shipped version), treat it as a **non-published bug** — the user was never
exposed to it. In that case:

- **Do not** add a bullet under `### Fixed` for it.
- Silently fold the correction into the related `### Added` entry if it adds useful context, or omit it entirely.
- This keeps the changelog focused on what users actually experienced changing.

Also derive a **short release summary** (1–2 sentences) that captures the main theme of this batch of commits. You will
use this as the opening paragraph of the changelog entry.

## 4 — Write CHANGELOG entry

Prepend a new entry to `CHANGELOG.md` following the existing Keep a Changelog format exactly:

```markdown
## [X.Y.Z] — YYYY-MM-DD

Short summary — see **Summary paragraph** rule below.

### Added

**Feature group name**

- Bullet describing what the user gains

### Changed

- Bullet describing behaviour differences

### Fixed

- Bullet describing what was broken

---

## [previous version] …
```

Rules:

- **Version** — use the new version computed in step 3, not the current `package.json` version (which is still the old
  one at this point) and not a guess. If you haven't computed it yet, do it now before writing.
- Date is today's date (use the user's current date from the session header)
- **Summary paragraph** — 1–2 short sentences, **target ≤ 160 characters** (hard cap 200). Use broad category labels:
  *Bug fixes*, *Quality of life improvements*, *SDD native support*, *Performance enhancements*, etc. Combine the most
  prominent themes (e.g., "Adds native SDD support; quality of life improvements and bug fixes." or "Performance
  enhancements, UI polish, and several bug fixes."). Do not list individual changes — keep it high-level. If a draft
  exceeds 200 characters, trim the least prominent theme until it fits. Place it directly below the `## [X.Y.Z]` header,
  before the first `###` section.
- **Non-published bugs** — fixes for features newly introduced in this same release are omitted from `### Fixed` (see
  Step 3 rule). Only include fixes for issues that existed in a previously released version.
- Group related fixes under a bold heading (e.g. **Scroll arrows**)
- Keep bullets user-facing — no internal refactor noise
- Commit the CHANGELOG alone: `chore: add CHANGELOG entry for vX.Y.Z`

## 5 — Fix any TypeScript errors first

Before running the release script, verify the tree is clean and typechecks pass:

```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
npm run typecheck
```

Fix any errors and commit them before proceeding. The release script will abort on a dirty tree.

## 6 — Run the release script

```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
bash scripts/release.sh patch   # or minor / major / explicit version
```

The script:

1. Checks the tree is clean
2. Runs `npm run typecheck`
3. Calls `npm version <bump>` → bumps `package.json`, commits, tags
4. Pushes the commit + tag to GitHub
5. GitHub Actions builds macOS/Windows/Linux artifacts automatically

## 7 — After the push

- Watch the build: https://github.com/thehope2k/minimalist-agent/actions
- Once all matrix builds finish, a **`finalize` job auto-fills the title and
  notes** from `CHANGELOG.md` (via `scripts/changelog-notes.mjs`) **and publishes
  the release** (`--draft=false --latest`) — no manual copy/paste or publish
  click needed.
- The build still happens into a **draft** first; it only flips to published in
  the `finalize` step, which runs after every matrix job succeeds. If any
  platform build fails, `finalize` is skipped and the release stays a draft, so
  users never see a partial release.
- Nothing to do by hand on success — just confirm the published release at:
  https://github.com/thehope2k/minimalist-agent/releases

### How the title is derived (Option 2 — CHANGELOG summary)

The release title is generated as `vX.Y.Z — <summary>`, where `<summary>` is the
**summary paragraph** you wrote in Step 4, with the trailing period stripped and
truncated to 60 characters. **This makes the summary paragraph do double duty —
it is both the opening line of the notes and the source of the title.** So keep
it punchy and front-load the dominant theme:

- Lead with the broad category label (*Bug fixes*, *Quality of life
  improvements*, *SDD native support*, *Performance enhancements*, …) so the
  truncated title still reads well.
- Aim for the most important theme in the **first ~50 characters** (after the
  `vX.Y.Z — ` prefix there is only ~50 chars of budget before the ellipsis).

### Release description

The description is the changelog section verbatim (summary paragraph through the
`### Added / Changed / Fixed` blocks, excluding the `---` separator) — pulled
automatically by the `finalize` job. You do **not** need to output it for manual
pasting anymore.

## Notes

- The `nvm` source line is required because `npm` is not on the default `$PATH` in the agent's shell
- `scripts/release.sh` lives in `minimalist-agent/minimalist-agent/scripts/release.sh`
- The CHANGELOG is parsed at build time by `src/renderer/src/lib/changelog.ts` and shown in-app — keep the format strict
