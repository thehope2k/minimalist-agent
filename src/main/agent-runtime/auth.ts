// Fresh, runtime-ready auth produced by `auth/resolve.ts`. Connection-specific
// credentials are normalized into either OAuth or OpenAI-compatible API auth.

import type { ApiProvider, OAuthProvider } from '../../shared/provider-types';

export interface ResolvedOAuthAuth {
  type: 'oauth';
  provider: OAuthProvider;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface ResolvedApiAuth {
  type: 'api';
  provider: ApiProvider;
  /** Base URL of the model server, e.g. http://localhost:11434 or https://api.stepfun.ai/v1. */
  baseUrl: string;
  /** Bearer key for remote endpoints; undefined for local Ollama/LM Studio. */
  apiKey?: string;
}

export type ResolvedAuth = ResolvedOAuthAuth | ResolvedApiAuth;
