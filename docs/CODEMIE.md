# CodeMie SSO

Minimalist Agent can connect to **EPAM CodeMie** through its browser SSO flow. CodeMie is a dedicated connection type
rather than a generic OpenAI-compatible endpoint because it authenticates with browser session cookies and requires
CodeMie request headers.

## Setup

1. Go to **Settings → AI → Add connection → CodeMie SSO**.
2. Keep the EPAM production URL, or open **Advanced options** to enter a different CodeMie host. The
   `/code-assistant-api` path is added automatically when omitted.
3. Select **Sign in with CodeMie** and complete EPAM SSO in the browser.
4. Select a discovered **Project** and optional LiteLLM **Integration**, then choose a discovered model and save.

The connection stores browser session cookies encrypted through Electron `safeStorage`. Saved CodeMie cookies are
retained in the main process and are not available through renderer credential IPC.

## Runtime behavior

At the start of a CodeMie turn, Minimalist Agent creates a localhost-only proxy. It forwards OpenAI-compatible runtime
requests to CodeMie while attaching the encrypted session cookies and required `X-CodeMie-Request-ID`,
`X-CodeMie-Client`, project, and integration headers. The agent subprocess only receives the loopback proxy URL, never
the browser cookies.

CodeMie models are discovered from `GET /v1/llm_models?include_all=true`. Use **Refresh models** on a saved connection
to update the catalog. CodeMie does not expose reliable model reasoning-effort capabilities, so the Thinking-level
control is unavailable for these connections.

## Budget display

When CodeMie returns a budget row for the selected project, the connection row shows spend, percentage used, and reset
date. This is project-budget data supplied by CodeMie, not an individual per-model token quota. The display is cached
for five minutes and may be unavailable when the CodeMie tenant does not expose a budget for the selected project or the
SSO session has expired.

## Session expiry

The SSO callback includes CodeMie cookies. When the `codemie_access_token` cookie contains a JWT expiry, Minimalist
Agent uses it to detect expiry before a turn. Reconnect the connection from Settings when the session has expired or
CodeMie rejects it.
