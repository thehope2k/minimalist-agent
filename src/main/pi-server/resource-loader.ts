import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  DefaultResourceLoader,
  type InlineExtension,
  type SettingsManager,
} from '@earendil-works/pi-coding-agent';

const PI_CLI_AGENT_DIR = join(homedir(), '.pi', 'agent');

export interface IsolatedResourceLoaderOptions {
  cwd: string;
  settingsManager: SettingsManager;
  extensionFactories?: InlineExtension[];
  /** Passed by reference — callers mutate it and call `reload()` to apply per-turn changes. */
  appendSystemPrompt?: string[];
  systemPrompt?: string;
  agentDir?: string;
}

// Context files, skills and extensions are owned by MA (its own tiers, consent flow and
// prompt injection). Pi's discovery would otherwise duplicate AGENTS.md in the prompt,
// surface the pi CLI's `~/.pi/agent` content, and execute unreviewed extensions. The
// explicit in-memory settings manager also stops pi reading `settings.json` package lists.
export function createIsolatedResourceLoader(
  options: IsolatedResourceLoaderOptions,
): DefaultResourceLoader {
  return new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: options.agentDir ?? PI_CLI_AGENT_DIR,
    settingsManager: options.settingsManager,
    extensionFactories: options.extensionFactories,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    // An empty list stops discovery of APPEND_SYSTEM.md.
    appendSystemPrompt: options.appendSystemPrompt ?? [],
    // Replaces pi's SYSTEM.md discovery; `undefined` keeps pi's built-in prompt.
    systemPromptOverride: () => options.systemPrompt,
  });
}
