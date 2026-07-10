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

Share links are hosted on [BrewPage](https://brewpage.app) — a free, no-signup instant
host. Implementation: `src/main/export-transport/brewpage.ts`.

**Privacy posture:**

- Published to an **unlisted** namespace (`minimalist-agent`) — excluded from the public
  gallery and search sitemap
- Reachable only via the exact random short URL (the **link is the secret**; ids are 10
  random characters)
- Anyone with the link can read it (no password) — so redaction still happens upstream

**Expiry & limits:**

- Content **auto-deletes** at the chosen TTL — default **15 days**, clamped to **1–30 days**
- Max upload size is **5 MB** of HTML. Oversized exports throw a clear error suggesting
  **Save…** or **summary** mode instead.

**Revoke:** every share returns an `ownerToken`. The *Share link created* dialog (and the
local link record) keep it so you can take the page down early — revoke is idempotent
(a 404 from an already-expired page counts as success).

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

Writes both `text/html` (rendered) and `text/plain` (raw markdown) to the
clipboard in one `ClipboardItem`. Apps that understand HTML (Teams, Slack,
Notion, Apple Notes) receive the rendered version and display it with full
formatting; plain-text editors receive the markdown fallback. Falls back to
`writeText` if the `ClipboardItem` API is unavailable.

### Save .html

Renders the response conclusion to a styled standalone HTML file and opens
the native Save dialog. Same pipeline as the full session export — `renderMarkdown`
→ `buildResponseHtml` — but scoped to the single response, with no redaction
(no user messages or file paths are included).

### Share

Same as Save but uploads to BrewPage and returns a short link. Inherits the
same TTL, revoke, and size constraints as the full session share. Recorded in
`localStorage` under `session-shared-links` so you can revoke it later.

### Architecture

- `components/chat/message-list/ShareResponseButton.tsx` — the footer action bar
- `lib/session-export/render-markdown.ts` — shared markdown → HTML renderer
- `lib/session-export/response-export.ts` — `extractConclusion`, `buildResponseHtml`

---

## Using It

1. Open a session and click the **Export** icon in the chat header rail.
2. Pick a destination + mode:
   - **Save to file** → *Conversation (.html)* or *Full Log (.html)*
   - **Share link** → *Conversation (BrewPage)* or *Full Log (BrewPage)*
3. For shares, the **Share link created** dialog gives you **Copy**, **Open**, and
   **Revoke**, plus the auto-delete date.

---

## Architecture Notes

For contributors:

**Renderer**
- `lib/session-export/` — export pipeline (`select` → `redact` → `truncate` → `template`)
- `lib/sessions.ts` — `saveSessionExport`, `shareSessionExport`, `revokeSessionExport`
- `lib/shared-links.ts` — local record of published links
- `components/chat/session-export/ExportMenu.tsx` — header menu (save/share × mode)
- `components/chat/session-export/ShareResultDialog.tsx` — link surface (copy/open/revoke)

**Main**
- `export-transport/brewpage.ts` — `publishExport` / `revokeExport` (TTL clamp, size limit)
- IPC: `sessions:saveExport`, `sessions:shareExport`, `sessions:revokeExport`

---

## Shipped

- **v1.3.0 (2026-06-05)** — Session export to HTML with local save and ephemeral share
  links (configurable TTL, revoke, automatic redaction)

See [ROADMAP.md](ROADMAP.md) and [CHANGELOG.md](../CHANGELOG.md) for details.
