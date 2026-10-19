import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { generateSlug, saveConnection } from '@/lib/connections';
import type { ConnectionMeta, Credential, ModelDef, ProviderType } from '@/lib/electron';
import { Button, Field, Input, Select } from '@/components/ui';
import { Actions, ErrorBox, FormShell } from './shared';
import type { FlowProps } from './types';

type Step = 'idle' | 'browser-open' | 'saving';

export interface BrowserOAuthBridge {
  start: () => Promise<{ accessToken: string; refreshToken?: string; expiresAt?: number }>;
  cancel: () => Promise<void>;
  onBrowserOpen: (cb: (url: string) => void) => () => void;
}

export interface BrowserOAuthFlowConfig {
  title: string;
  providerType: ProviderType;
  /** Host shown in the "your browser will open to …" copy. */
  authHost: string;
  /** Who the user signs in with on the browser page, e.g. "OpenAI". */
  vendor: string;
  signInLabel: string;
  getBridge: () => BrowserOAuthBridge | undefined;
  getModels: () => Promise<ModelDef[]> | undefined;
  /** Extra provider-specific copy shown above the sign-in button. */
  notice?: React.ReactNode;
}

/** PKCE browser-redirect sign-in (ChatGPT, Claude): open browser → await tokens → save. */
export function BrowserOAuthFlow({
  config,
  onBack,
  onClose,
  onSaved,
  editingMeta,
}: FlowProps & { config: BrowserOAuthFlowConfig }) {
  const editing = !!editingMeta;
  const [name, setName] = useState(editingMeta?.name ?? config.title);
  const [models, setModels] = useState<ModelDef[]>(editingMeta?.models ?? []);
  const [model, setModel] = useState<string>(editingMeta?.defaultModel ?? '');
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const bridge = config.getBridge();
  const bridgeMissing = !bridge;

  // Load the Pi SDK's static model catalog for this provider on mount.
  useEffect(() => {
    config
      .getModels()
      ?.then((list) => {
        if (list.length === 0) return;
        setModels(list);
        setModel((prev) => list.find((m) => m.id === prev)?.id ?? list[0].id);
      })
      .catch(() => {
        /* keep empty list */
      });
  }, [config]);

  useEffect(() => {
    if (!bridge) return;
    // Flip to "waiting for browser" before the start promise resolves.
    const off = bridge.onBrowserOpen(() => setStep('browser-open'));
    return () => {
      off();
      if (inFlight.current) void bridge.cancel();
    };
  }, [bridge]);

  const start = async () => {
    if (!bridge) {
      setError('IPC bridge unavailable. Restart the app and try again.');
      return;
    }
    setError(null);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setStep('idle');
    inFlight.current = true;
    try {
      const tokens = await bridge.start();
      setStep('saving');

      const finalDefaultModel = models.find((m) => m.id === model)?.id ?? models[0]?.id ?? model;

      const meta: ConnectionMeta = editing
        ? { ...editingMeta!, name: name.trim(), defaultModel: finalDefaultModel, models }
        : {
            slug: generateSlug(name),
            name: name.trim(),
            providerType: config.providerType,
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
      setError(e instanceof Error ? e.message : `${config.title} authorization failed.`);
    } finally {
      inFlight.current = false;
    }
  };

  const cancel = async () => {
    if (bridge && inFlight.current) await bridge.cancel();
    setStep('idle');
  };

  return (
    <FormShell title={config.title} onBack={onBack}>
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      {step === 'idle' && (
        <div className="space-y-3">
          <p className="text-xs text-fg-subtle">
            Sign in with your {config.title} account. Your browser will open to{' '}
            <code className="mx-1 rounded bg-elevated px-1 py-0.5 text-[11px] text-fg-muted">
              {config.authHost}
            </code>
            and redirect back automatically — no code to copy. Model availability varies by plan —
            if a model returns an error, switch to another from the picker.
          </p>
          {config.notice}
          <p className="text-xs text-fg-subtle">
            Chat runs through the agent runtime, including permission prompts, plan/auto modes, and
            tool streaming.
          </p>
          <Button
            variant="primary"
            icon={ExternalLink}
            onClick={start}
            disabled={bridgeMissing}
            fullWidth
          >
            {config.signInLabel}
          </Button>
        </div>
      )}

      {step === 'browser-open' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-elevated/40 px-4 py-3">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-fg-muted" />
            <p className="text-xs text-fg-subtle">
              Browser opened. Complete sign-in on the {config.vendor} page — this dialog will close
              automatically.
            </p>
          </div>
          <Button variant="link" onClick={cancel}>
            Cancel and start over
          </Button>
        </div>
      )}

      <Field label="Default model">
        <Select
          value={model}
          onChange={setModel}
          options={models.map((m) => ({
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
