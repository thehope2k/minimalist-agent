// ChatGPT (Codex) OAuth — wraps the PKCE browser-redirect flow
// exposed by `@earendil-works/pi-ai`.
//
// Unlike Copilot (device-code, no local server), this flow opens the
// user's browser to auth.openai.com and catches the redirect on a
// temporary HTTP server the Pi SDK spins up on localhost:1455.
//
// We persist:
//   accessToken  = OpenAI API key derived from the id_token exchange
//   refreshToken = standard OAuth refresh token (long-lived)

import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { createPkceBrowserLogin, isExpired, type PkceTokens } from './pkce-browser-login';

export type ChatGptTokens = PkceTokens;

const flow = createPkceBrowserLogin('chatgpt-oauth', () => openaiCodexProvider().auth.oauth!);

export const startLogin = flow.startLogin;
export const cancelLogin = flow.cancelLogin;
export const refreshChatGptTokens = flow.refreshTokens;
export { isExpired };
