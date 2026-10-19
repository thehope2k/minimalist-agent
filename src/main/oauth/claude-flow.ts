// Claude (Pro/Max subscription) OAuth — wraps the PKCE browser-redirect flow
// exposed by `@earendil-works/pi-ai`. Opens claude.ai and catches the redirect
// on a temporary localhost server (port 53692, or any free port).
//
// The SDK signs in as the Claude Code client and, for `sk-ant-oat` tokens,
// sends Claude Code's identity headers and system preamble. Anthropic's terms
// only allow subscription tokens in its own apps, so this is personal-use,
// at-your-own-risk (see docs/CLAUDE-SUBSCRIPTION.md).

import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { createPkceBrowserLogin, isExpired, type PkceTokens } from './pkce-browser-login';

export type ClaudeTokens = PkceTokens;

const flow = createPkceBrowserLogin('claude-oauth', () => anthropicProvider().auth.oauth!);

export const startLogin = flow.startLogin;
export const cancelLogin = flow.cancelLogin;
export const refreshClaudeTokens = flow.refreshTokens;
export { isExpired };
