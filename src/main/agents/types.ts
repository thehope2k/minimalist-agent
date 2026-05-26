/** Agent metadata extracted from AGENT.md YAML frontmatter. */
export interface AgentMetadata {
  /** Display name for the agent. */
  name: string;
  /** Description shown in agent list and used by the LLM to decide when to call this agent. */
  description: string;
  /** Optional model for this agent (e.g., "haiku", "opus"). If omitted, uses session model. */
  model?: string;
  /** Optional tool names to restrict this agent to (e.g., ["Read", "Grep", "Find"]). If omitted, uses all available tools. */
  tools?: string[];
  /** Maximum turns this agent can take before returning (default: 10). */
  maxTurns?: number;
  /** Permission mode for this agent: "plan" (no mutations), "ask" (per-tool prompt), or "auto" (bypass). */
  permissionMode?: 'plan' | 'ask' | 'auto';
  /** Optional effort level for Claude SDK (Anthropic only): "low", "medium", "high". */
  effort?: 'low' | 'medium' | 'high';
  /** Optional icon — emoji or URL only. */
  icon?: string;
}

/** A loaded agent — frontmatter + body + on-disk paths. */
export interface LoadedAgent {
  /** Directory name (slug). */
  slug: string;
  /** Parsed metadata. */
  metadata: AgentMetadata;
  /** AGENT.md body (without frontmatter) — system prompt for the agent. */
  content: string;
  /** Absolute path to icon file if one exists locally. */
  iconPath?: string;
  /** Absolute path to the agent directory. */
  path: string;
}

/** For Claude SDK: AgentDefinition as described in the API. */
export interface SDKAgentDefinition {
  /** Human-readable description. */
  description: string;
  /** System prompt. */
  prompt: string;
  /** Optional model override. */
  model?: string;
  /** Optional tool restrictions. */
  tools?: string[];
  /** Optional max turns. */
  maxTurns?: number;
  /** Optional permission mode. */
  permissionMode?: 'plan' | 'ask' | 'auto';
  /** Optional effort level. */
  effort?: 'low' | 'medium' | 'high';
}
