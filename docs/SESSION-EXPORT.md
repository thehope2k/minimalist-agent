# Session Export & Sharing

Turn any conversation into a **self-contained HTML document** — save it to disk, or
publish it as an **ephemeral share link** that expires on its own and can be revoked at
any time.

---

## What It Is

A one-click exporter in the chat header (the **Export** icon) that renders the current
session as a standalone HTML file with the full chat styling — code blocks, diffs, Mermaid
diagrams, KaTeX math, and tool output all intact. From there you can either keep it locally
or hand someone a link.

Two destinations:

- **Save to file** — native Save dialog writes the HTML to disk
- **Share link** — uploads the HTML to an ephemeral host and returns an unlisted URL

Two content modes:

| Mode | Label | Contents |
|---|---|---|
| `summary` | **Conversation** | The conversation + outcomes (user/assistant turns, diffs, results) |
| `full` | **Full Log** | The complete log, including thinking blocks and raw tool input/output |

---

## How It Works

### Export pipeline

```
StoredMessage[]
   │  select   → decide what's included per mode; convert Edit/Write to structured diffs
   ▼
ExportModel
   │  redact   → strip machine paths + known secret shapes (always, both modes)
   │  truncate → cap oversized payloads
   ▼
buildHtmlDocument → self-contained HTML (inline styles, no external assets)
```

Source: `src/renderer/src/lib/session-export/`.

### Redaction (always on)

Redaction runs for **both** save and share — sharing makes any leak permanent, so it is
non-optional. Two scrubbers run over every text-bearing field:

- **Paths** — `/Users/<name>/…`, `/home/<name>/…`, `C:\Users\<name>\…` collapse to `~`
  (drops the username and absolute layout, keeps the basename context)
- **Secrets** — known token shapes are replaced with `«redacted:kind»`:
  OpenAI/Anthropic keys, GitHub tokens/PATs, Slack tokens, AWS keys, Google keys, JWTs,
  `Authorization: Bearer …`, and `key/secret/token/password = "…"` assignments

> Redaction is conservative by design — it targets well-known prefixes and formats so it
> won't mangle ordinary code. Treat it as a safety net, not a guarantee; review the export
> before sharing anything sensitive.

---

## Share Links

Share links are hosted on one of two ephemeral backends — **BrewPage** or **meethtml.com**. Both are free, no-signup, and produce unlisted URLs. The user picks the backend explicitly via the action bar.

| Backend | File | Default TTL | Max size |
|---|---|---|---|
| [BrewPage](https://brewpage.app) | `export-transport/brewpage.ts` | 15 days (1–30) | 5 MB |
| [meethtml.com](https://meethtml.com) | `export-transport/meethtml.ts` | 24 hours | 5 MB |

**Privacy posture (both backends):**

- Published as **unlisted** — excluded from any public gallery or search sitemap
- Reachable only via the exact random short URL (the **link is the secret**)
- Anyone with the link can read it (no password) — so redaction still happens upstream

**Expiry & limits:**

- BrewPage: **auto-deletes** at chosen TTL — default **15 days**, clamped to **1–30 days**
- meethtml.com: **auto-deletes** after **24 hours** (anonymous tier)
- Max upload size is **5 MB** of HTML on both. Oversized exports throw a clear error suggesting
  **Save…** or **summary** mode instead.

**Revoke:** every share returns an `ownerToken` (BrewPage) or `edit_token` (meethtml, stored as `ownerToken`). The *Share link created* dialog keeps it so you can take the page down early. The `namespace` field on the stored link record determines which backend handles revoke — `minimalist-agent` → BrewPage, `meethtml` → meethtml.com.

### Local link record

Published links are tracked per session in `localStorage` under `session-shared-links`
(`src/renderer/src/lib/shared-links.ts`) so you can copy or revoke them later. Expired
entries are pruned on read (the host deletes them server-side at TTL anyway).

---

## Per-Response Actions

Every completed assistant message has a lightweight action bar in the footer
(hover to reveal): **Copy**, **Save .html**, and **Share**. These operate on
the *response conclusion* — the text after the last tool call in the turn —
rather than the full session.

### Copy

Writes both `text/html` (full styled HTML via `buildResponseHtml`) and `text/plain` (raw
markdown) to the clipboard in one `ClipboardItem`. Apps that understand HTML (Teams, Slack,
Notion, Apple Notes) receive the rendered version with full formatting, code highlighting,
and math rendering — identical to what BrewPage and meethtml.com display. Plain-text
editors receive the markdown fallback. Falls back to `writeText` if the `ClipboardItem`
API is unavailable.

### Save .html

Renders the response conclusion to a styled standalone HTML file via `buildResponseHtml`
and opens the native Save dialog. Scoped to the single response with no redaction
(no user messages or file paths included).

### Share

Two explicit buttons — **BrewPage** and **meethtml** — appear side by side. Each
publishes the response to its respective backend and returns a short link. Both
inherit the same size constraint (5 MB) and revoke flow. TTL differs: BrewPage
defaults to 15 days; meethtml expires after 24 hours. Recorded in `localStorage`
under `session-shared-links` so you can revoke either later.

### Architecture

- `components/chat/message-list/ShareResponseButton.tsx` — footer action bar (Copy / Save .html / BrewPage / meethtml)
- `lib/session-export/render-markdown.ts` — shared markdown → HTML renderer
- `lib/session-export/response-export.ts` — `extractConclusion`, `buildResponseHtml`

---

## Using It

1. Open a session and click the **Export** icon in the chat header rail.
2. Pick a destination + mode:
   - **Save to file** → *Conversation (.html)* or *Full Log (.html)*
   - **Share link** → *Conversation (BrewPage)*, *Conversation (meethtml)*, *Full Log (BrewPage)*, or *Full Log (meethtml)*
3. For shares, the **Share link created** dialog gives you **Copy**, **Open**, and
   **Revoke**, plus the auto-delete date.

---

## Architecture Notes

For contributors:

**Renderer**
- `lib/session-export/` — export pipeline (`select` → `redact` → `truncate` → `template`)
- `lib/sessions.ts` — `saveSessionExport`, `shareSessionExport`, `revokeSessionExport`
- `lib/shared-links.ts` — local record of published links
- `components/chat/session-export/ExportMenu.tsx` — header menu (save/share × mode × backend)
- `components/chat/session-export/ShareResultDialog.tsx` — link surface (copy/open/revoke)

**Main**
- `export-transport/brewpage.ts` — `publishExport` / `revokeExport` (TTL clamp, size limit)
- `export-transport/meethtml.ts` — `publishExportFallback` / `revokeExportFallback` (24h anonymous pages)
- IPC: `sessions:saveExport`, `sessions:shareExport` (`backend?: 'brewpage' | 'meethtml'`), `sessions:revokeExport`

---

## Shipped

- **v1.3.0 (2026-06-05)** — Session export to HTML with local save and ephemeral share
  links (configurable TTL, revoke, automatic redaction)

See [ROADMAP.md](ROADMAP.md) and [CHANGELOG.md](../CHANGELOG.md) for details.
