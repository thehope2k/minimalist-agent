import { createServer, type Server } from 'node:http';
import { shell } from 'electron';
import { createLogger } from '../logger';
import type { ModelDef } from '../storage/connections';
import { codeMieApiBase, codeMieCookieHeader, isLoopbackAddress } from './shared';

const log = createLogger('codemie-sso');
const LOGIN_TIMEOUT_MS = 120_000;
const CALLBACK_SUCCESS_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Minimalist Agent</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { display: grid; min-height: 100vh; margin: 0; place-items: center; background: #111; color: #f5f5f5; }
    main { width: min(420px, calc(100% - 32px)); padding: 36px; border: 1px solid #333; border-radius: 16px; background: #1b1b1b; box-shadow: 0 24px 64px #0008; text-align: center; }
    .mark { display: grid; width: 44px; height: 44px; margin: 0 auto 20px; place-items: center; border-radius: 50%; background: #193820; color: #78dc90; font-size: 24px; }
    h1 { margin: 0; font-size: 20px; font-weight: 600; }
    p { margin: 10px 0 0; color: #aaa; font-size: 14px; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <div class="mark">✓</div>
    <h1>Connected to CodeMie</h1>
    <p>Authentication is complete. Return to Minimalist Agent to continue.</p>
  </main>
</body>
</html>`;

type CodeMieCallbackPayload = { cookies?: Record<string, string> };
type CodeMieModel = {
  id?: string;
  base_name?: string;
  deployment_name?: string;
  label?: string;
  provider?: string;
  multimodal?: boolean;
  features?: { streaming?: boolean; tools?: boolean };
};
type CodeMieUser = { username?: string; applications?: string[]; applications_admin?: string[]; applicationsAdmin?: string[] };
type CodeMieIntegration = { id?: string; alias?: string; project_name?: string; credential_type?: string };
type CodeMieBudgetRow = { project_name?: string; current_spending?: number; budget_limit?: number; total?: number; budget_reset_at?: string };
type CodeMieBudgetResponse = { data?: { rows?: CodeMieBudgetRow[] } };

export interface CodeMieIntegrationOption {
  id: string;
  alias: string;
}

export interface CodeMieBudget {
  currentSpending: number;
  budgetLimit?: number;
  usedPercent: number;
  resetAt?: string;
}

export interface CodeMieSsoResult {
  cookies: Record<string, string>;
  expiresAt?: number;
}

function decodeCallbackToken(encoded: string): CodeMieSsoResult {
  const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as CodeMieCallbackPayload;
  if (!payload.cookies || Object.keys(payload.cookies).length === 0) {
    throw new Error('CodeMie returned no session cookies.');
  }
  return { cookies: payload.cookies, expiresAt: readTokenExpiry(payload.cookies.codemie_access_token) };
}

function readTokenExpiry(token: string | undefined): number | undefined {
  if (!token) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

function closeServer(server: Server | undefined): void {
  server?.close();
}

export async function signInWithCodeMie(baseUrl: string): Promise<CodeMieSsoResult> {
  let server: Server | undefined;
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await new Promise<CodeMieSsoResult>((resolve, reject) => {
      const finish = (result: CodeMieSsoResult | Error) => {
        if (timeout) clearTimeout(timeout);
        closeServer(server);
        result instanceof Error ? reject(result) : resolve(result);
      };

      server = createServer((request, response) => {
        if (!isLoopbackAddress(request.socket.remoteAddress)) {
          response.writeHead(403).end('Forbidden');
          return;
        }
        try {
          const callbackUrl = new URL(request.url ?? '/', 'http://localhost');
          const encoded = callbackUrl.searchParams.get('token') ?? callbackUrl.searchParams.get('auth') ?? callbackUrl.searchParams.get('data');
          if (!encoded) throw new Error('CodeMie did not return an authentication token.');
          const result = decodeCallbackToken(encoded);
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(CALLBACK_SUCCESS_PAGE);
          finish(result);
        } catch (error) {
          response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Authentication failed. Return to Minimalist Agent.');
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
      server.once('error', (error) => finish(error));
      server.listen(0, async () => {
        const address = server?.address();
        if (!address || typeof address === 'string') {
          finish(new Error('Could not start the SSO callback listener.'));
          return;
        }
        try {
          await shell.openExternal(`${codeMieApiBase(baseUrl)}/v1/auth/login/${address.port}`);
          timeout = setTimeout(() => finish(new Error('CodeMie sign-in timed out.')), LOGIN_TIMEOUT_MS);
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  } catch (error) {
    log.warn('CodeMie SSO sign-in failed:', error);
    throw error;
  }
}

async function fetchCodeMieJson<T>(baseUrl: string, path: string, cookies: Record<string, string>): Promise<T> {
  const response = await fetch(`${codeMieApiBase(baseUrl)}${path}`, {
    headers: { Cookie: codeMieCookieHeader(cookies) },
  });
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? 'CodeMie session is not authorized.'
      : `CodeMie returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function toCodeMieModel({ id, base_name, deployment_name, label, provider, multimodal, features }: CodeMieModel): ModelDef | null {
  const modelId = id ?? base_name ?? deployment_name ?? label;
  if (!modelId) return null;
  const displayName = label?.trim() || modelId;
  return {
    id: modelId,
    name: displayName,
    shortName: displayName,
    description: provider ? `CodeMie · ${provider}` : 'CodeMie-managed model',
    contextWindow: 128_000,
    supportsVision: multimodal || undefined,
    supportsToolCalls: features?.tools ?? true,
    supportsStreaming: features?.streaming ?? true,
  };
}

export async function fetchCodeMieModels(baseUrl: string, cookies: Record<string, string>): Promise<ModelDef[]> {
  const models = await fetchCodeMieJson<CodeMieModel[]>(baseUrl, '/v1/llm_models?include_all=true', cookies);
  if (!Array.isArray(models)) return [];
  const byId = new Map<string, ModelDef>();
  for (const model of models) {
    const parsed = toCodeMieModel(model);
    if (parsed) byId.set(parsed.id, parsed);
  }
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export async function fetchCodeMieProjects(baseUrl: string, cookies: Record<string, string>): Promise<string[]> {
  const user = await fetchCodeMieJson<CodeMieUser>(baseUrl, '/v1/user', cookies);
  const adminProjects = user.applications_admin ?? user.applicationsAdmin ?? [];
  return [...new Set([...(user.applications ?? []), ...adminProjects])]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

export async function fetchCodeMieBudget(baseUrl: string, cookies: Record<string, string>, project: string): Promise<CodeMieBudget | null> {
  const [user, budget] = await Promise.all([
    fetchCodeMieJson<CodeMieUser>(baseUrl, '/v1/user', cookies),
    fetchCodeMieJson<CodeMieBudgetResponse>(baseUrl, '/v1/analytics/budget_usage', cookies),
  ]);
  const projectNames = [project, user.username ? `${user.username} (cli)` : '']
    .map((name) => name.trim().toLowerCase());
  const row = budget.data?.rows?.find(({ project_name }) => projectNames.includes(project_name?.trim().toLowerCase() ?? ''));
  if (!row || typeof row.current_spending !== 'number' || typeof row.total !== 'number') return null;
  return {
    currentSpending: row.current_spending,
    budgetLimit: typeof row.budget_limit === 'number' ? row.budget_limit : undefined,
    usedPercent: row.total,
    resetAt: row.budget_reset_at,
  };
}

function integrationRows(response: unknown): CodeMieIntegration[] {
  const rows = Array.isArray(response)
    ? response
    : typeof response === 'object' && response !== null && Array.isArray((response as { data?: unknown[] }).data)
      ? (response as { data: unknown[] }).data
      : [];
  return rows.filter((row): row is CodeMieIntegration => typeof row === 'object' && row !== null);
}

export async function fetchCodeMieIntegrations(baseUrl: string, cookies: Record<string, string>, project: string): Promise<CodeMieIntegrationOption[]> {
  const integrations = new Map<string, CodeMieIntegrationOption>();
  const seenRowIds = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: '50',
      filters: JSON.stringify({ type: ['LiteLLM'] }),
    });
    const rows = integrationRows(await fetchCodeMieJson<unknown>(baseUrl, `/v1/settings/user?${params}`, cookies));
    let sawNewRow = false;
    for (const { id, alias, project_name, credential_type } of rows) {
      if (!id || seenRowIds.has(id)) continue;
      seenRowIds.add(id);
      sawNewRow = true;
      if (!alias || project_name !== project || credential_type !== 'LiteLLM') continue;
      integrations.set(id, { id, alias });
    }
    if (rows.length < 50 || !sawNewRow) break;
  }
  return [...integrations.values()].sort((left, right) => left.alias.localeCompare(right.alias));
}
