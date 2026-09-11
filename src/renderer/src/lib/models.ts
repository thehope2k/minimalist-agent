
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