// Curated presets for OpenAI-compatible providers.
//
// A preset bakes in everything except the API key: base URL, a starter model
// list, and where to get a key. Picking a preset turns "add a provider" into
// "paste your key" — the URL and models are already known.
//
// `custom` is the escape hatch: the user supplies base URL + model ids by hand.
// Any provider that speaks the OpenAI Chat Completions API works there.

import type { ModelDef } from './models';

export interface OpenAICompatiblePreset {
  /** Stable id persisted on the connection (ConnectionMeta.presetId). */
  id: string;
  /** Display name shown in the picker and used as the default connection name. */
  name: string;
  /** Short one-liner describing the provider. */
  blurb: string;
  /** OpenAI-compatible base URL (must include the version path, e.g. /v1). */
  baseUrl: string;
  /** Where the user creates a key + any prefix hint for validation. */
  keyUrl: string;
  keyHint: string;
  /** Optional key prefix used for a soft format check (not enforced). */
  keyPrefix?: string;
  /** Starter models. Users can still type a custom model id. */
  models: ModelDef[];
}

function m(
  id: string,
  name: string,
  opts: Partial<ModelDef> & { contextWindow: number },
): ModelDef {
  return {
    id,
    name,
    shortName: name,
    description: opts.description ?? '',
    contextWindow: opts.contextWindow,
    supportsVision: opts.supportsVision,
    supportsToolCalls: opts.supportsToolCalls ?? true,
    supportsStreaming: opts.supportsStreaming ?? true,
    supportsReasoning: opts.supportsReasoning,
    maxOutputTokens: opts.maxOutputTokens,
    category: opts.category,
  };
}

export const OPENAI_COMPATIBLE_PRESETS: OpenAICompatiblePreset[] = [
  {
    id: 'stepfun',
    name: 'StepFun',
    blurb: 'Step series — agent-focused multimodal models (阶跃星辰).',
    baseUrl: 'https://api.stepfun.ai/v1',
    keyUrl: 'https://platform.stepfun.ai/',
    keyHint: 'Create an Interface Key under Account → API Keys.',
    models: [
      m('step-3.7-flash', 'Step 3.7 Flash', {
        contextWindow: 256_000,
        description: 'Latest high-efficiency agent / coding model',
        supportsVision: true,
        supportsReasoning: true,
        maxOutputTokens: 16_384,
        category: 'powerful',
      }),
      m('step-3.5-flash', 'Step 3.5 Flash', {
        contextWindow: 256_000,
        description: '196B MoE · 11B active · reasoning + tools',
        supportsReasoning: true,
        maxOutputTokens: 16_384,
        category: 'powerful',
      }),
      m('step-3', 'Step 3', {
        contextWindow: 64_000,
        description: 'Multimodal flagship',
        supportsVision: true,
        maxOutputTokens: 8_192,
        category: 'versatile',
      }),
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    blurb: 'DeepSeek V-series + reasoning models, very low cost.',
    baseUrl: 'https://api.deepseek.com/v1',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keyHint: 'Keys start with "sk-".',
    keyPrefix: 'sk-',
    models: [
      m('deepseek-chat', 'DeepSeek Chat', {
        contextWindow: 128_000,
        description: 'General-purpose V-series',
        maxOutputTokens: 8_192,
        category: 'versatile',
      }),
      m('deepseek-reasoner', 'DeepSeek Reasoner', {
        contextWindow: 128_000,
        description: 'Reasoning (R-series)',
        supportsReasoning: true,
        maxOutputTokens: 8_192,
        category: 'powerful',
      }),
    ],
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    blurb: 'Kimi K-series — long context, strong agentic coding.',
    baseUrl: 'https://api.moonshot.ai/v1',
    keyUrl: 'https://platform.moonshot.ai/console/api-keys',
    keyHint: 'Keys start with "sk-".',
    keyPrefix: 'sk-',
    models: [
      m('kimi-k2.6', 'Kimi K2.6', {
        contextWindow: 256_000,
        description: '1T-param MoE · agentic',
        supportsReasoning: true,
        maxOutputTokens: 16_384,
        category: 'powerful',
      }),
    ],
  },
  {
    id: 'together',
    name: 'Together AI',
    blurb: 'Hosted open-weight models (Qwen, Llama, DeepSeek, …).',
    baseUrl: 'https://api.together.xyz/v1',
    keyUrl: 'https://api.together.ai/settings/api-keys',
    keyHint: 'Paste your Together API key.',
    models: [
      m('Qwen/Qwen3-235B-A22B', 'Qwen3 235B', {
        contextWindow: 256_000,
        description: 'Qwen3 flagship MoE',
        supportsReasoning: true,
        maxOutputTokens: 16_384,
        category: 'powerful',
      }),
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    blurb: 'Ultra-low-latency inference for open models.',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    keyHint: 'Keys start with "gsk_".',
    keyPrefix: 'gsk_',
    models: [
      m('llama-3.3-70b-versatile', 'Llama 3.3 70B', {
        contextWindow: 131_072,
        description: 'Fast general-purpose',
        maxOutputTokens: 8_192,
        category: 'versatile',
      }),
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    blurb: 'One key, hundreds of models routed across providers.',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    keyHint: 'Keys start with "sk-or-".',
    keyPrefix: 'sk-or-',
    models: [
      m('stepfun/step-3.5-flash', 'Step 3.5 Flash (via OR)', {
        contextWindow: 256_000,
        description: 'StepFun routed through OpenRouter',
        supportsReasoning: true,
        maxOutputTokens: 16_384,
        category: 'powerful',
      }),
    ],
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    blurb: 'Grok models via the OpenAI-compatible xAI API.',
    baseUrl: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai/',
    keyHint: 'Keys start with "xai-".',
    keyPrefix: 'xai-',
    models: [
      m('grok-4', 'Grok 4', {
        contextWindow: 256_000,
        description: 'xAI flagship',
        supportsReasoning: true,
        maxOutputTokens: 16_384,
        category: 'powerful',
      }),
    ],
  },
  {
    id: 'custom',
    name: 'Custom endpoint',
    blurb: 'Any OpenAI-compatible API. Enter the base URL and model ids.',
    baseUrl: '',
    keyUrl: '',
    keyHint: 'Paste the API key for your endpoint (leave blank if none).',
    models: [],
  },
];

export function getPreset(id: string | undefined): OpenAICompatiblePreset | undefined {
  return OPENAI_COMPATIBLE_PRESETS.find((p) => p.id === id);
}

export const CUSTOM_PRESET_ID = 'custom';
