import { CheckCircle2, ExternalLink } from 'lucide-react';
import { Button, Field, Input, PasswordInput, Select, Textarea } from '@/components/ui';
import { OPENAI_COMPATIBLE_PRESETS } from '@/lib/openai-compatible-presets';
import { Actions, ErrorBox, FormShell } from './shared';
import type { FlowProps } from './types';
import { useOpenAICompatibleForm } from './openai-compatible/useOpenAICompatibleForm';

export function OpenAICompatibleFlow(props: FlowProps) {
  const form = useOpenAICompatibleForm(props);

  return (
    <FormShell
      title={form.editing ? 'Update API key' : 'OpenAI-compatible provider'}
      onBack={props.onBack}
    >
      {!form.editing && (
        <Field label="Provider">
          <Select
            value={form.presetId}
            onChange={form.pickPreset}
            options={OPENAI_COMPATIBLE_PRESETS.map((preset) => ({
              value: preset.id,
              label: preset.name,
            }))}
          />
        </Field>
      )}

      {form.preset && !form.isCustom && !form.editing && (
        <p className="text-xs text-fg-subtle">{form.preset.blurb}</p>
      )}

      <Field label="Name">
        <Input
          value={form.name}
          onChange={(event) => form.setName(event.target.value)}
          placeholder="StepFun"
        />
      </Field>

      {(form.isCustom || form.editing) && (
        <Field
          label="Base URL"
          hint="OpenAI-compatible endpoint, including the version path (e.g. /v1)."
        >
          <Input
            value={form.baseUrl}
            onChange={(event) => form.setBaseUrl(event.target.value)}
            placeholder="https://api.stepfun.ai/v1"
            mono
            disabled={form.editing}
          />
        </Field>
      )}

      {form.isCustom && !form.editing && (
        <Field label="Model ids" hint="One per line. These are passed verbatim to the API.">
          <Textarea
            value={form.customModels}
            onChange={(event) => form.setCustomModels(event.target.value)}
            placeholder={'step-3.7-flash\nstep-3.5-flash'}
            rows={3}
            mono
          />
        </Field>
      )}

      <Field label="API key" hint={form.preset?.keyHint ?? 'Stored encrypted via the OS keychain.'}>
        <PasswordInput
          value={form.apiKey}
          onChange={(event) => form.setApiKey(event.target.value)}
          autoComplete="off"
          placeholder={
            form.editing ? 'Enter a new key to replace the stored one' : 'Paste your API key'
          }
        />
      </Field>

      {form.preset?.keyUrl && (
        <a
          href={form.preset.keyUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          Get an API key <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {!form.editing && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={form.fetchModels}
            loading={form.fetching}
            disabled={!form.baseUrl.trim()}
          >
            Fetch models from API
          </Button>
          {form.fetchNote && <span className="text-xs text-fg-subtle">{form.fetchNote}</span>}
        </div>
      )}

      {form.models.length > 0 && (
        <Field label="Default model">
          <Select
            value={form.effectiveModel}
            onChange={form.setModel}
            options={form.models.map((model) => ({
              value: model.id,
              label: model.description ? `${model.name} — ${model.description}` : model.name,
            }))}
          />
        </Field>
      )}

      {form.error && <ErrorBox>{form.error}</ErrorBox>}
      {form.tested && (
        <p className="inline-flex items-center gap-1.5 text-xs text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Connection verified.
        </p>
      )}

      <Actions>
        <Button variant="ghost" onClick={props.onClose} disabled={form.saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={form.submit} loading={form.saving}>
          {form.editing ? 'Update key' : 'Save & verify'}
        </Button>
      </Actions>
    </FormShell>
  );
}
