
export interface ModelDef {
  id: string;
  name: string;
  shortName: string;
  description: string;
  contextWindow: number;
}

export const CODEX_MODELS: ModelDef[] = [
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    shortName: 'GPT-5.1',
    description: 'Efficient everyday model',
    contextWindow: 272_000,
  },
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    shortName: 'GPT-5.2',
    description: 'Balanced performance',
    contextWindow: 272_000,
  },
  {
    id: 'gpt-5.3-codex',
    name: 'GPT-5.3 Codex',
    shortName: 'GPT-5.3',
    description: 'Codex-tuned for coding tasks',
    contextWindow: 272_000,
  },
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    shortName: 'GPT-5.4',
    description: 'High-capability model',
    contextWindow: 272_000,
  },
  {
    id: 'gpt-5.5',
    name: 'GPT-5.5',
    shortName: 'GPT-5.5',
    description: 'Latest flagship via ChatGPT Plus',
    contextWindow: 272_000,
  },
];

export const ANTHROPIC_MODELS: ModelDef[] = [
  {
    id: 'claude-opus-4-7',
    name: 'Opus 4.7',
    shortName: 'Opus',
    description: 'Most capable for complex work',
    contextWindow: 1_000_000,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Sonnet 4.6',
    shortName: 'Sonnet',
    description: 'Best for everyday tasks',
    contextWindow: 200_000,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Haiku 4.5',
    shortName: 'Haiku',
    description: 'Fastest for quick answers',
    contextWindow: 200_000,
  },
];
