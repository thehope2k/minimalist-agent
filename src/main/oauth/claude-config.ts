// Public OAuth configuration for Claude Pro/Max sign-in. The client ID is a
// public PKCE client (no secret), and the redirect URI is an Anthropic-hosted
// page that shows the user a code to paste back into the app.

import { app } from 'electron';

export const CLAUDE_OAUTH_CONFIG = {
  CLIENT_ID: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  AUTH_URL: 'https://claude.ai/oauth/authorize',
  TOKEN_URL: 'https://platform.claude.com/v1/oauth/token',
  REDIRECT_URI: 'https://console.anthropic.com/oauth/code/callback',
  SCOPES: 'org:create_api_key user:profile user:inference',
} as const;

export const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/** Reads the version from package.json at runtime so it stays in sync. */
export const APP_USER_AGENT = `MinimalistAgent/${app.getVersion()}`;
