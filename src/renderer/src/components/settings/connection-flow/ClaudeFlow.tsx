import { BrowserOAuthFlow, type BrowserOAuthFlowConfig } from './BrowserOAuthFlow';
import type { FlowProps } from './types';

const CONFIG: BrowserOAuthFlowConfig = {
  title: 'Claude',
  providerType: 'anthropic',
  authHost: 'claude.ai',
  vendor: 'Claude',
  signInLabel: 'Sign in with Claude',
  getBridge: () => window.api?.claudeOAuth,
  getModels: () => window.api?.claude?.getModels(),
  notice: (
    <p className="rounded-md border border-border bg-elevated/40 px-2.5 py-2 text-xs text-fg-subtle">
      Unofficial: this signs in as the Claude Code client and uses your Pro/Max plan’s usage limits.
      Anthropic’s terms only allow subscription access from its own apps, so requests may be blocked
      and your account could be restricted. Use at your own risk, for personal use.
    </p>
  ),
};

export function ClaudeFlow(props: FlowProps) {
  return <BrowserOAuthFlow {...props} config={CONFIG} />;
}
