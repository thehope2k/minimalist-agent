# Claude subscription (Pro/Max) connection

Settings → AI → Add connection → **Claude · Pro/Max** signs in with your
claude.ai account and runs chats against your plan's usage limits instead of
pay-per-token API billing.

## ⚠️ Unofficial — read before using

- **How it works:** the Pi SDK (`@earendil-works/pi-ai`, `anthropicOAuth`) runs
  the same PKCE OAuth flow as the Claude Code CLI, using Claude Code's public
  client ID. With the resulting `sk-ant-oat…` token, its Anthropic provider
  impersonates Claude Code: it sends `user-agent: claude-cli/…`, `x-app: cli`,
  the `claude-code-20250219` and `oauth-2025-04-20` betas, a "You are Claude
  Code…" system preamble, and Claude Code's tool names.
- **Terms:** Anthropic's terms say Free/Pro/Max OAuth tokens are only for
  Claude Code and claude.ai. Using them from a third-party app goes against
  those terms. Anthropic has blocked third-party clients that do this before,
  and may restrict accounts.
- **Expect breakage:** any server-side change can cause 4xx refusals with no
  notice. If that happens, switch to another connection. Fixes will usually
  come from a Pi SDK bump, not from this app.
- Intended for personal use only. Don't advertise or ship it as a supported
  path.

## Details

| Item           | Value                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `providerType` | `anthropic` (also the Pi provider id)                                                             |
| Login          | browser → `claude.ai/oauth/authorize`, callback on `localhost:53692` (or any free port)           |
| Token refresh  | `platform.claude.com/v1/oauth/token`, via `auth/resolve.ts` (same mutex path as ChatGPT)          |
| Models         | Pi SDK static catalog (`getBuiltinModels('anthropic')`), dated snapshots hidden                   |
| Code           | `main/oauth/claude-flow.ts`, `main/oauth/pkce-browser-login.ts`, `connection-flow/ClaudeFlow.tsx` |

**Usage tracking:** the Settings row bar and the chat-toolbar pill read
`GET api.anthropic.com/api/oauth/usage`. It's the same undocumented endpoint
Claude Code's `/usage` uses, and it returns the 5h session, 7d weekly, and
model-scoped weekly windows (`main/claude/quota.ts`). The UI is shared with
ChatGPT in `settings/rolling-quota/`.

Supported alternatives: an Anthropic Console API key through an
OpenAI-compatible gateway, or Claude models through GitHub Copilot.
