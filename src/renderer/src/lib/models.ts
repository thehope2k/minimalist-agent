
export interface ModelDef {
  id: string;
  name: string;
  shortName: string;
  description: string;
  contextWindow: number;
  // Capabilities
  supportsVision?: boolean;
  supportsToolCalls?: boolean;
  supportsStreaming?: boolean;
  /** Model supports extended thinking / reasoning effort controls. */
  supportsReasoning?: boolean;
  /** Max output tokens (used for custom OpenAI-compatible endpoints). */
  maxOutputTokens?: number;
  category?: 'powerful' | 'versatile' | 'lightweight';
  recommendedFor?: string[];
}

/** Generate recommendations based on model capabilities and size. */
export function getRecommendedUseFor(model: ModelDef): string[] {
  if (model.recommendedFor) return model.recommendedFor;
  
  const recommendations: string[] = [];
  
  if (model.contextWindow >= 200000) {
    recommendations.push('long-context');
  }
  if (model.supportsVision) {
    recommendations.push('vision');
  }
  if (model.supportsToolCalls) {
    recommendations.push('tool-use');
  }
  
  // Category-based recommendations
  if (model.category === 'powerful') {
    recommendations.push('complex-reasoning');
  } else if (model.category === 'lightweight') {
    recommendations.push('quick-tasks');
  } else {
    recommendations.push('general-purpose');
  }
  
  return recommendations;
}

export const ANTHROPIC_MODELS: ModelDef[] = [
  {
    id: 'claude-opus-4-7',
    name: 'Opus 4.7',
    shortName: 'Opus',
    description: 'Most capable for complex work',
    contextWindow: 1_000_000,
    supportsVision: true,
    supportsToolCalls: true,
    supportsStreaming: true,
    category: 'powerful',
    recommendedFor: ['complex-reasoning', 'long-context', 'tool-use', 'vision'],
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Sonnet 4.6',
    shortName: 'Sonnet',
    description: 'Best for everyday tasks',
    contextWindow: 200_000,
    supportsVision: true,
    supportsToolCalls: true,
    supportsStreaming: true,
    category: 'versatile',
    recommendedFor: ['general-purpose', 'long-context', 'tool-use', 'vision'],
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Haiku 4.5',
    shortName: 'Haiku',
    description: 'Fastest for quick answers',
    contextWindow: 200_000,
    supportsVision: true,
    supportsToolCalls: true,
    supportsStreaming: true,
    category: 'lightweight',
    recommendedFor: ['quick-tasks', 'long-context', 'tool-use'],
  },
];
