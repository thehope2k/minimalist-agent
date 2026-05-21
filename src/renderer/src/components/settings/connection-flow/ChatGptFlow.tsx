import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { generateSlug, saveConnection } from '@/lib/connections';
import type { ConnectionMeta, Credential, ModelDef } from '@/lib/electron';
import { Button, Field, Input, Select } from '@/components/ui';
import { Actions, ErrorBox, FormShell } from './shared';
import type { FlowProps } from './types';

type Step = 'idle' | 'browser-open' | 'saving';

export function ChatGptFlow({ onBack, onClose, onSaved, editingMeta }: FlowProps) {
  const editing = !!editingMeta;
  const [name, setName] = useState(editingMeta?.name ?? 'ChatGPT Plus');
  const [models, setModels] = useState<ModelDef[]>(editingMeta?.models ?? []);
  const [model, setModel] = useState<string>(
    editingMeta?.defaultModel ?? '',
  );

  // Load the Pi SDK’s openai-codex model catalog on mount.
  useEffect(() => {
    window.api?.chatgpt?.getModels().then((list) => {
      if (list.length === 0) return;
      setModels(list);
      setModel((prev) => list.find((m) => m.id === prev)?.id ?? list[0].id);
    }).catch(() => {/* keep empty list */});
  }, []);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const bridgeMissing = !window.api?.chatgptOAuth;

  useEffect(() => {
    if (!window.api?.chatgptOAuth) return;
    // Subscribe to the browser-open event so we can transition to the
    // "waiting for browser" state before the IPC promise resolves.
    const off = window.api.chatgptOAuth.onBrowserOpen(() => {
      setStep('browser-open');
    });
    return () => {
      off();
      if (inFlight.current) void window.api.chatgptOAuth.cancel();
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
    // Reset to idle state in case of a retry.
    setStep('idle');
    inFlight.current = true;
    try {
      const tokens = await window.api.chatgptOAuth.start();
      setStep('saving');

      // Use the Pi SDK model list fetched on mount.
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
            piAuthProvider: 'openai-codex',
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
      setError(
        e instanceof Error ? e.message : 'ChatGPT Plus authorization failed.',
      );
    } finally {
      inFlight.current = false;
    }
  };

  const cancel = async () => {
    if (window.api?.chatgptOAuth && inFlight.current) {
      await window.api.chatgptOAuth.cancel();
    }
    setStep('idle');
  };

  return (
    <FormShell title="ChatGPT Plus" onBack={onBack}>
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      {step === 'idle' && (
        <div className="space-y-3">
          <p className="text-xs text-fg-subtle">
            Sign in with your ChatGPT Plus or Pro account. Your browser will
            open to <code className="mx-1 rounded bg-elevated px-1 py-0.5 text-[11px] text-fg-muted">auth.openai.com</code>{' '}
            and redirect back automatically — no code to copy.
          </p>
          <p className="text-xs text-fg-subtle">
            Chat runs through the Pi runtime — permission prompts, plan/ask/auto
            modes, and tool streaming all behave like Claude.
          </p>
          <Button
            variant="primary"
            icon={ExternalLink}
            onClick={start}
            disabled={bridgeMissing}
            fullWidth
          >
            Sign in with ChatGPT
          </Button>
        </div>
      )}

      {step === 'browser-open' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-elevated/40 px-4 py-3">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-fg-muted" />
            <p className="text-xs text-fg-subtle">
              Browser opened. Complete sign-in on the OpenAI page — this
              dialog will close automatically.
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
