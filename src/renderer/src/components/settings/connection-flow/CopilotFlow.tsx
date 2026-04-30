import { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { generateSlug, saveConnection } from '@/lib/connections';
import type { ConnectionMeta, Credential, ModelDef } from '@/lib/electron';
import { Button, Field, Input, Select } from '@/components/ui';
import { Actions, ErrorBox, FormShell } from './shared';
import type { FlowProps } from './types';

// Copilot exposes Claude Sonnet/Haiku, GPT-5, o4-mini, etc. via its proxy.
// We seed a small list — Pi's model fetcher can replace this once the
// runtime ships.
// Curated fallback list — used only if `copilot.fetchModels` fails.
// Live discovery via the Copilot `/models` endpoint is the source of
// truth; it returns the user's tier-filtered set.
const FALLBACK_COPILOT_MODELS = [
  {
    id: 'claude-sonnet-4.6',
    name: 'Sonnet 4.6 (Copilot)',
    shortName: 'Sonnet',
    description: 'Anthropic Sonnet via Copilot',
    contextWindow: 200_000,
  },
  {
    id: 'claude-haiku-4.5',
    name: 'Haiku 4.5 (Copilot)',
    shortName: 'Haiku',
    description: 'Fast Anthropic Haiku via Copilot',
    contextWindow: 200_000,
  },
  {
    id: 'gpt-5',
    name: 'GPT-5 (Copilot)',
    shortName: 'GPT-5',
    description: 'OpenAI GPT-5 via Copilot',
    contextWindow: 200_000,
  },
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1 (Copilot)',
    shortName: 'GPT-5.1',
    description: 'OpenAI GPT-5.1 via Copilot',
    contextWindow: 200_000,
  },
] as const;

type Step = 'idle' | 'awaiting-code' | 'polling' | 'saving';

export function CopilotFlow({ onBack, onClose, onSaved, editingMeta }: FlowProps) {
  const editing = !!editingMeta;
  const [name, setName] = useState(editingMeta?.name ?? 'GitHub Copilot');
  const [model, setModel] = useState<string>(editingMeta?.defaultModel ?? FALLBACK_COPILOT_MODELS[0].id);
  const [step, setStep] = useState<Step>('idle');
  const [device, setDevice] = useState<{ userCode: string; verificationUri: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  // Track whether a flow is in flight so unmount cancels it.
  const inFlight = useRef(false);

  const bridgeMissing = !window.api?.copilotOAuth;

  useEffect(() => {
    if (!window.api?.copilotOAuth) return;
    const off = window.api.copilotOAuth.onDeviceCode((u) => {
      setDevice(u);
      setStep('polling');
    });
    return () => {
      off();
      if (inFlight.current) void window.api.copilotOAuth.cancel();
    };
  }, []);

  const start = async () => {
    if (bridgeMissing) {
      setError('IPC bridge unavailable. Restart the app and try again.');
      return;
    }
    setError(null);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setStep('awaiting-code');
    inFlight.current = true;
    try {
      const tokens = await window.api.copilotOAuth.start();
      setStep('saving');

      // Live model discovery — query Copilot's /models with the fresh
      // refresh token. Fall back to the curated list on any failure so
      // setup never blocks on a transient network hiccup.
      let models: ModelDef[] = [...FALLBACK_COPILOT_MODELS];
      try {
        if (tokens.refreshToken && window.api.copilot) {
          const result = await window.api.copilot.fetchModels({
            refreshToken: tokens.refreshToken,
          });
          if ('models' in result && result.models.length > 0) {
            models = result.models;
          }
        }
      } catch {
        // Silent fallback — curated list is fine.
      }
      // If the user's pre-OAuth `model` choice isn't in the live list,
      // pick the first live model as the default.
      const finalDefaultModel =
        models.find((m) => m.id === model)?.id ?? models[0]?.id ?? model;

      const meta: ConnectionMeta = editing
        ? {
            ...editingMeta!,
            name: name.trim(),
            defaultModel: finalDefaultModel,
            models,
          }
        : {
            slug: generateSlug(name),
            name: name.trim(),
            providerType: 'pi',
            authType: 'oauth',
            piAuthProvider: 'github-copilot',
            defaultModel: finalDefaultModel,
            models,
            createdAt: Date.now(),
          };
      const credential: Credential = {
        type: 'oauth',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      };
      await saveConnection(meta, credential);
      onSaved(meta);
      onClose();
    } catch (e) {
      setStep('idle');
      setDevice(null);
      setError(e instanceof Error ? e.message : 'GitHub authorization failed.');
    } finally {
      inFlight.current = false;
    }
  };

  const cancel = async () => {
    if (window.api?.copilotOAuth && inFlight.current) {
      await window.api.copilotOAuth.cancel();
    }
    setStep('idle');
    setDevice(null);
  };

  return (
    <FormShell title="GitHub Copilot" onBack={onBack}>
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      {step === 'idle' && (
        <div className="space-y-3">
          <p className="text-xs text-fg-subtle">
            Sign in with your GitHub account that has Copilot enabled. We&apos;ll
            open <code className="mx-1 rounded bg-elevated px-1 py-0.5 text-[11px] text-fg-muted">github.com/login/device</code>{' '}
            in your browser and show you a one-time code to enter.
          </p>
          <p className="text-xs text-fg-subtle">
            Chat runs through the Pi runtime in a Node subprocess —
            permission prompts, plan/ask/auto modes, OAuth refresh, and
            tool streaming all behave like Claude.
          </p>
          <Button
            variant="primary"
            icon={ExternalLink}
            onClick={start}
            disabled={bridgeMissing}
            fullWidth
          >
            Sign in with GitHub
          </Button>
        </div>
      )}

      {(step === 'awaiting-code' || step === 'polling') && (
        <div className="space-y-3">
          <p className="text-xs text-fg-subtle">
            {step === 'awaiting-code'
              ? 'Requesting a device code from GitHub…'
              : 'Browser opened. Enter the code below on the GitHub page, then return here. We&apos;ll finish automatically.'}
          </p>
          {device?.userCode && (
            <div className="rounded-lg border border-border bg-elevated/40 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-fg-subtle">
                Device code
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <code className="font-mono text-lg tracking-wider text-fg">
                  {device.userCode}
                </code>
                <Button
                  variant="ghost"
                  icon={Copy}
                  onClick={() => navigator.clipboard.writeText(device.userCode)}
                >
                  Copy
                </Button>
              </div>
            </div>
          )}
          <Button variant="link" onClick={cancel}>
            Cancel and start over
          </Button>
        </div>
      )}

      <Field label="Default model">
        <Select
          value={model}
          onChange={setModel}
          options={FALLBACK_COPILOT_MODELS.map((m) => ({
            value: m.id,
            label: `${m.name} — ${m.description}`,
          }))}
        />
      </Field>

      {error && <ErrorBox>{error}</ErrorBox>}

      <Actions>
        <Button variant="ghost" onClick={onClose} disabled={step === 'saving'}>
          Cancel
        </Button>
      </Actions>
    </FormShell>
  );
}
