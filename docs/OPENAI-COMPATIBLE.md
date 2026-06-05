# OpenAI-Compatible Providers

Connect to any provider that speaks the **OpenAI Chat Completions API** — curated presets
for popular hosts, plus a custom-endpoint escape hatch for everything else.

---

## What It Is

A connection type (`openai-compatible`) that talks to any `https://…/v1`-style endpoint.
Picking a preset bakes in everything except the API key — base URL, a starter model list,
and where to get a key — so adding a provider becomes "paste your key."

The **Custom endpoint** option is the escape hatch: supply a base URL and model ids by hand,
and any OpenAI-compatible API works.

---

## Curated Presets

Source: `src/renderer/src/lib/openai-compatible-presets.ts`.

| Preset | Base URL | Notes |
|---|---|---|
| **StepFun** | `https://api.stepfun.ai/v1` | Step series — agent-focused multimodal (阶跃星辰) |
| **DeepSeek** | `https://api.deepseek.com/v1` | V-series + reasoning models, very low cost |
| **Moonshot (Kimi)** | `https://api.moonshot.ai/v1` | Kimi K-series — long context, agentic coding |
| **Together AI** | `https://api.together.xyz/v1` | Hosted open-weight models (Qwen, Llama, DeepSeek…) |
| **Groq** | `https://api.groq.com/openai/v1` | Ultra-low-latency inference for open models |
| **OpenRouter** | `https://openrouter.ai/api/v1` | One key, hundreds of models routed across providers |
| **xAI (Grok)** | `https://api.x.ai/v1` | Grok models via the OpenAI-compatible xAI API |
| **Custom endpoint** | _(you provide)_ | Any OpenAI-compatible API — base URL + model ids |

Each preset ships a starter model list with rich metadata (context window, vision/reasoning
flags, max output tokens). You can always type a custom model id on top.

---

## Setup

1. **Settings → Connections → Add connection → OpenAI-compatible**
2. Pick a **Provider** preset (or **Custom endpoint**).
3. For custom, fill in the **Base URL** (must include the version path, e.g. `/v1`) and one
   or more **Model ids** (one per line — passed verbatim to the API).
4. Paste your **API key**. Optionally click **Get an API key** to open the provider's console.
5. (Optional) **Fetch models from API** — pulls the live list from `/v1/models` and merges
   any new ids onto the preset metadata.
6. Pick a **Default model**, then **Save & verify**.

The key is validated with a real round-trip from the main process (no CORS), and stored
encrypted via the OS keychain.

---

## Model Discovery

The **Fetch models from API** button calls the provider's `GET /v1/models` endpoint from the
main process (`src/main/openai-compatible/models.ts`). That response only carries ids — no
context window or capabilities — so:

- **Preset models keep** their rich metadata.
- **Newly discovered ids** are appended with safe defaults (128K context, tools + streaming
  on, 8K max output).

The base URL is normalized to end in a version path (`/v1` is appended if missing), mirroring
the chat client. Discovery has a 15-second timeout and surfaces auth (401/403) and HTTP
errors inline.

---

## How It Runs

OpenAI-compatible connections run on the **Pi runtime** (the same subprocess backend as
GitHub Copilot and ChatGPT Plus). At turn time:

- `auth/resolve.ts` resolves the connection into `LocalApiAuth` — a Bearer key + base URL.
- Title and commit-message generation reuse the session model (custom endpoints don't have a
  separate cheap model).
- Remote providers skip the local `enable_thinking` hack that Ollama uses.

See [ARCHITECTURE.md](ARCHITECTURE.md#pi-backend-github-copilot--chatgpt-plus--openai-compatible)
for the backend flow.

---

## Architecture Notes

For contributors:

**Renderer**
- `lib/openai-compatible-presets.ts` — preset catalog (`OPENAI_COMPATIBLE_PRESETS`, `CUSTOM_PRESET_ID`)
- `components/settings/connection-flow/OpenAICompatibleFlow.tsx` — add/edit flow
- `components/settings/ai-panel/utils.ts` — display-name resolution

**Main**
- `openai-compatible/models.ts` — `fetchOpenAICompatibleModelIds` (`/v1/models` discovery)
- `auth/resolve.ts` — `openai-compatible` → `LocalApiAuth`
- `storage/connections.ts` — `providerType: 'openai-compatible'`, `presetId`, `baseUrl`
- IPC: `connections:listRemoteModels`, `connections:test`

---

## Shipped

See [ROADMAP.md](ROADMAP.md) and [CHANGELOG.md](../CHANGELOG.md) for release details.
