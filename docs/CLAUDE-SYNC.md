# Sync to Claude

**Sync to Claude** copies the user's MA skills, agents, and extensions into Claude Code, so they work in the `claude`
CLI and in the Claude Desktop app's Code tab. It's one-way (MA → Claude) and runs only when the user clicks it.
Claude then uses the copies natively; MA doesn't need to be running.

It's a single, global action: the first destination under **Settings → App → Sync to Other Apps**. Every sync starts
with a preview where the user picks what to include.

---

## What syncs where

The dialog has one group per destination:

| Group       | MA source                           | Claude destination                                                                     |
| ----------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| **You**     | `~/.minimalist-agent/…` (user tier) | `~/.claude/` and user-scope MCP servers                                                |
| **Project** | `<project>/.minimalist-agent/…`     | `<project>/.claude/`, `<project>/.claude/settings.local.json`, local-scope MCP servers |

Within each group, assets convert as follows (paths shown for the user group; a project uses its own `.claude/`):

| MA asset                       | Claude Code                                                                 | Conversion                                                                                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skill `skills/<slug>/`         | `~/.claude/skills/<name>/`                                                  | `SKILL.md` frontmatter becomes `name` (kebab-case), `description`, and `allowed-tools` (from `alwaysAllow`). `icon` and `globs` are dropped. Other files in the folder are copied, except `icon.*`. |
| Agent `agents/<slug>/AGENT.md` | `~/.claude/agents/<name>.md`                                                | Frontmatter becomes `name`, `description`, `tools`, and `model`; `icon` and `effort` are dropped.                                                                                                   |
| MCP-backed extension           | A user-scope MCP server, registered with `claude mcp add-json --scope user` | stdio: `command`, `args`, and `env` (when the extension binds env). http/sse: `url` and `headers`.                                                                                                  |
| CLI-bound extension's `env`    | The `env` block of `~/.claude/settings.json`                                | One entry per variable.                                                                                                                                                                             |
| Every extension's `guide.md`   | `~/.claude/skills/<name>/`                                                  | The guide becomes a skill, so Claude learns how to use the integration. A CLI-bound guide also lists the env variables it relies on.                                                                |

The user's Claude config dir is `$CLAUDE_CONFIG_DIR` when set, else `~/.claude`, matching Claude Code itself. Claude
Code picks up new skills and agents in new sessions.

### Projects

**Which projects.** MA lists a project when it has assets in `.minimalist-agent/{skills,agents,extensions}`, or when
MA synced to it before (so removals still reach it). Candidates come from:

- MA's **Projects** and **recent folders**, automatically;
- **Add folder…** in the dialog: the user picks a folder and MA scans **three levels** down, skipping `node_modules`,
  `.git`, build output and other vendor folders (the same list MA uses to find `AGENTS.md`). Found folders are
  remembered (`syncFolders` in MA's settings).

The home folder is never a project: `~/.minimalist-agent` is the user tier. There's no whole-disk search; it would be
slow, walk folders the user never meant to share, and trigger macOS privacy prompts.

**Where project assets go.** Into the project's own Claude setup, so they stay scoped to that project as in MA:

- skills and agents into `<project>/.claude/skills/` and `<project>/.claude/agents/`;
- CLI-bound env into `<project>/.claude/settings.local.json`, Claude's uncommitted per-project settings;
- MCP servers at **local scope** (`claude mcp add-json --scope local`, run from the project folder): Claude loads them
  only in that project, and they're stored in Claude's own config, not in a committed `.mcp.json`.

Project extensions use `${VAR}` references rather than MA's keychain, and those pass through unchanged.

**Git.** Everything MA writes under `<project>/.claude/` is listed in the repo's `.git/info/exclude`, which is local to
the clone and never committed, so it stays out of `git status`. MA rewrites only its own marked block in that file,
follows a `.git` file to the real git dir (worktrees), and does nothing outside a git repo. A project's `.claude/` is
only created when there's something to write.

**Tool names** map as follows: `Read`, `Write`, `Edit`, `Bash`, `Grep` unchanged; `Find` and `Ls` → `Glob`;
`web_fetch` → `WebFetch`; `web_search` → `WebSearch`; `Agent` → `Task`. Tools with no Claude equivalent (for example
`browser_tool`, or another server's MCP tool names) are dropped, with a warning in the preview.

## The preview

Each item shows one action:

| Action        | Meaning                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **add**       | New in Claude                                                                                                                  |
| **update**    | Changed in MA since the last sync. If the copy was also edited on the Claude side, a warning says those edits will be replaced |
| **remove**    | Synced before, and now either gone from MA or excluded by the user                                                             |
| **excluded**  | Unticked by the user and not in Claude                                                                                         |
| **skip**      | Not synced, with the reason (secret not included, setup value not filled in, name taken, extension disabled, CLI missing)      |
| **unchanged** | Already up to date (listed under a collapsed "Up to date" section)                                                             |

### Choosing what to sync

Every item the user can act on has a checkbox: changes, excluded items, and up-to-date items. All are ticked by default.
Each group's header has a checkbox that ticks or unticks all of its items at once.

- **Unticking** an item excludes it. If MA already synced it, the next sync removes it from Claude ("excluded by you");
  otherwise it's listed as excluded.
- **Ticking** an excluded item brings it back.
- **Exclusions are remembered** (in the manifest, below), so later syncs keep respecting them. Exclusions for items
  that no longer exist in MA are dropped.
- Skips and removals of items gone from MA have no checkbox: there's nothing to choose.

Each change re-runs the preview in main with the new selection, so the list always shows exactly what **Sync** will do.

Warnings flag content that relies on MA-only features, so the user can adjust it: `browser_tool`, `web_fetch`/
`web_search` by their MA names, collaboration and planning tools, and `@`-mentions.

## Ownership

Each destination has its own manifest, `.minimalist-agent-sync.json` in its Claude dir (`~/.claude/` or
`<project>/.claude/`). It records everything MA created there (name, content hash, MA source) and the user's
exclusions. MA only ever updates or removes entries listed there:

- A Claude skill, agent, MCP server, or env variable with the same name that MA didn't create is **skipped**, never
  overwritten.
- An item that's gone from MA is removed from Claude on the next sync.
- An item that's skipped this time (for example because secrets are off) stays as it is in Claude rather than being
  removed.
- An item deleted by hand in Claude simply drops out of the manifest.

## Secrets

Extension secrets live encrypted in MA's keychain store; Claude's config files are plain JSON. So by default, anything
that needs a secret (a `SecretRef` env value) is **skipped**: MCP servers whose env binds one, and secret env variables
of CLI-bound extensions. The preview counts them.

**Include secrets** syncs them. The values are then stored in plain text in `~/.claude.json` (MCP servers) and
`~/.claude/settings.json` (env variables), and an MCP server's JSON, secrets included, is briefly passed on the
`claude` command line. Turning the option off again later doesn't remove what was already synced.

Non-secret setup values (`InputRef`) and literal values always sync. `${VAR}` references pass through for Claude
Code to expand from its own environment.

## Implementation

| File                               | Role                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `main/claude-sync/transform.ts`    | Pure conversions: names, tool mapping, skill/agent/guide markdown, MCP JSON, env resolution.        |
| `main/claude-sync/plan.ts`         | Pure: decides each item's action from desired entries, the manifest, and Claude's state.            |
| `main/claude-sync/claude-state.ts` | Claude-side I/O per destination: paths, hashing, settings env, manifest, git exclude, `claude` CLI. |
| `main/claude-sync/targets.ts`      | Which projects to sync, and the three-level folder scan.                                            |
| `main/claude-sync/index.ts`        | Collects MA's assets per destination, builds each group's plan, applies it.                         |
| `main/ipc/claude-sync-ipc.ts`      | `claudeSync:preview`, `claudeSync:run` (exclusions per group), and `claudeSync:addFolder`.          |
| `renderer/…/claude-sync/`          | The preview dialog, opened from Settings → App.                                                     |

Writes are scoped: skill folders and agent files MA owns, the `env` key of `settings.json` (written atomically, every
other key preserved; left untouched if the file isn't valid JSON), and MCP servers only through the `claude` CLI, so
MA never edits `~/.claude.json` directly. The CLI is looked up in its installer locations (`~/.local/bin`,
`~/.claude/local`, Homebrew, `/usr/local/bin`) before `PATH`, since an app launched from the Dock doesn't inherit the
shell's `PATH`. Without it, MCP servers are skipped and everything else still syncs.

## Not covered

- **Claude Desktop chat** (outside the Code tab): its skills are uploaded through the app and its MCP servers live in a
  separate config.
- **Extensions that sign in through an MA connection** (`mcp.auth`): Claude can't reuse MA's sign-in.
- **Live sync**: changes reach Claude when the user syncs again.
