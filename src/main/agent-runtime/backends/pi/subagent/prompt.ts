// Pure helper functions: system-prompt construction, permission-mode
// mapping, and result formatting. No subprocess/state dependencies.
import type { LoadedAgent } from '../../../../agents/types';

export function buildAgentSystemPrompt(agent: LoadedAgent): string {
  const parts: string[] = [];

  // Agent identity
  parts.push(`You are "${agent.metadata.name}" — ${agent.metadata.description}`);
  parts.push('');

  // Tool restrictions
  if (agent.metadata.tools && agent.metadata.tools.length > 0) {
    parts.push(`You may ONLY use these tools: ${agent.metadata.tools.join(', ')}`);
    parts.push('');
  }

  // Turn limits
  const maxTurns = agent.metadata.maxTurns || 10;
  parts.push(`You have a maximum of ${maxTurns} turns to complete the task.`);
  parts.push('Be focused and efficient.');
  parts.push('');

  // Custom instructions from AGENT.md
  parts.push(agent.content);

  return parts.join('\n');
}

export function mapAgentPermissionMode(
  mode: 'plan' | 'auto' | undefined,
): 'plan' | 'auto' {
  return mode || 'auto';
}

export function formatAgentResult(agent: LoadedAgent, output: string[], error?: string, execId?: string): string {
  if (error) {
    return [
      `❌ Agent "${agent.metadata.name}" failed:`,
      '',
      error,
      '',
      'The agent was unable to complete the task.',
      execId ? `[exec: ${execId}]` : '',
    ].filter(Boolean).join('\n');
  }

  if (output.length === 0) {
    return [
      `Agent "${agent.metadata.name}" completed but produced no output.`,
      '',
      'This might indicate the agent finished successfully but had nothing to report.',
    ].join('\n');
  }

  return [
    `✓ Agent "${agent.metadata.name}" results:`,
    '',
    '─'.repeat(60),
    output.join(''),
    '─'.repeat(60),
    '',
    `Task completed by ${agent.metadata.name}.`,
  ].join('\n');
}
