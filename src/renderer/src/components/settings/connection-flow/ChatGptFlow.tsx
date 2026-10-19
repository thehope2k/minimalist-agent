import { BrowserOAuthFlow, type BrowserOAuthFlowConfig } from './BrowserOAuthFlow';
import type { FlowProps } from './types';

const CONFIG: BrowserOAuthFlowConfig = {
  title: 'ChatGPT',
  providerType: 'openai-codex',
  authHost: 'auth.openai.com',
  vendor: 'OpenAI',
  signInLabel: 'Sign in with ChatGPT',
  getBridge: () => window.api?.chatgptOAuth,
  getModels: () => window.api?.chatgpt?.getModels(),
};

export function ChatGptFlow(props: FlowProps) {
  return <BrowserOAuthFlow {...props} config={CONFIG} />;
}
