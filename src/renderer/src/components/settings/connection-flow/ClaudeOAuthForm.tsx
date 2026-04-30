import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ANTHROPIC_MODELS } from '@/lib/models';
import { generateSlug, saveConnection } from '@/lib/connections';
import type { ConnectionMeta, Credential } from '@/lib/electron';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { Actions, ErrorBox, FormShell } from './shared';
import type { FlowProps } from './types';

type Step = 'idle' | 'opening' | 'awaiting' | 'exchanging';

export function ClaudeOAuthForm({ onBack, onClose, onSaved, editingMeta }: FlowProps) {
  const editing = !!editingMeta;
  const [name, setName] = useState(editingMeta?.name ?? 'Claude Pro / Max');
  const [model, setModel] = useState(editingMeta?.defaultModel ?? ANTHROPIC_MODELS[0].id);
  const [step, setStep] = useState<Step>('idle');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const bridgeMissing = !window.api?.claudeOAuth;

  const startLogin = async () => {
    setError(null);
    if (bridgeMissing) {
      setError('IPC bridge unavailable. Restart the app and try again.');
      return;
    }
    setStep('opening');
    try {
      await window.api.claudeOAuth.start();
      setStep('awaiting');
    } catch (e) {
      setStep('idle');
      setError(e instanceof Error ? e.message : 'Failed to start login.');
    }
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Name is required.');
    if (!code.trim()) return setError('Paste the authorization code first.');

    setStep('exchanging');
    try {
      const tokens = await window.api.claudeOAuth.exchange(code.trim());
      const meta: ConnectionMeta = editing
        ? {
            ...editingMeta!,
            name: name.trim(),
            defaultModel: model,
          }
        : {
            slug: generateSlug(name),
            name: name.trim(),
            providerType: 'anthropic',
            authType: 'oauth',
            defaultModel: model,
            models: ANTHROPIC_MODELS,
            createdAt: Date.now(),
          };
      const credential: Credential = {
        type: 'oauth',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
      };
      await saveConnection(meta, credential);
      onSaved(meta);
      onClose();
    } catch (e) {
      setStep('awaiting');
      setError(e instanceof Error ? e.message : 'Token exchange failed.');
    }
  };

  return (
    <FormShell title={editing ? 'Reconnect Claude Pro / Max' : 'Claude Pro / Max'} onBack={onBack}>
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      {step === 'idle' ? (
        <div className="space-y-3">
          <p className="text-xs text-fg-subtle">
            Sign in with your Claude Pro or Max account. We&apos;ll open
            <code className="mx-1 rounded bg-elevated px-1 py-0.5 text-[11px] text-fg-muted">
              claude.ai
            </code>
            in your browser. After you authorize, copy the code shown on the
            callback page and paste it back here.
          </p>
          <Button
            variant="primary"
            icon={ExternalLink}
            onClick={startLogin}
            disabled={bridgeMissing}
            fullWidth
          >
            Sign in with Claude
          </Button>
          {bridgeMissing && (
            <p className="text-xs text-fg-subtle">
              IPC bridge not detected. Quit and run{' '}
              <code className="rounded bg-elevated px-1">npm run dev</code> again.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-fg-subtle">
            {step === 'opening'
              ? 'Opening browser…'
              : 'Browser opened. After you authorize on claude.ai, paste the authorization code below.'}
          </p>
          <Field label="Authorization code">
            <Textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              rows={3}
              autoFocus
              mono
              placeholder="Paste the code from the callback page…"
            />
          </Field>
          <Button
            variant="link"
            type="button"
            onClick={startLogin}
            disabled={step === 'opening' || step === 'exchanging'}
            className="text-xs text-fg-muted hover:text-fg hover:no-underline"
          >
            ↻ Re-open browser
          </Button>
        </div>
      )}

      <Field label="Default model">
        <Select
          value={model}
          onChange={setModel}
          options={ANTHROPIC_MODELS.map((m) => ({
            value: m.id,
            label: `${m.name} — ${m.description}`,
          }))}
        />
      </Field>

      {error && <ErrorBox>{error}</ErrorBox>}

      <Actions>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={step === 'exchanging'}
          disabled={step === 'idle' || step === 'opening' || !code.trim()}
          onClick={submit}
        >
          {editing ? 'Update credentials' : 'Save connection'}
        </Button>
      </Actions>
    </FormShell>
  );
}
