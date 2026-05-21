
export interface ModelDef {
  id: string;
  name: string;
  shortName: string;
  description: string;
  contextWindow: number;
}

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
