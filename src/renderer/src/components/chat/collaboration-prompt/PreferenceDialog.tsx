import { useState } from 'react';
import { Button, Textarea } from '../../ui';
import { DialogLayout } from './DialogLayout';
import type { DialogProps, PreferencePayload } from './types';

export function PreferenceDialog({ reqId, payload, onRespond }: DialogProps<PreferencePayload>) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [customResponse, setCustomResponse] = useState('');

  const handleSubmit = () => {
    onRespond({
      reqId,
      decision: 'custom',
      selected_option: selectedOption || undefined,
      custom_response: customResponse.trim() || undefined,
    });
  };

  const handleDefer = () => {
    onRespond({
      reqId,
      decision: 'defer',
      custom_response: customResponse.trim() || undefined,
    });
  };

  return (
    <DialogLayout
      title="Your Preference"
      onBackdropClick={handleDefer}
      footer={
        <>
          <Button onClick={handleDefer} variant="outline">
            Discuss first
          </Button>
          <Button onClick={handleSubmit} variant="primary">
            Continue
          </Button>
        </>
      }
    >
      <p className="text-fg">{payload.question}</p>

      {payload.context && (
        <p className="text-sm text-fg-muted">{payload.context}</p>
      )}

      <div className="space-y-2">
        {payload.options.map((opt, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedOption(opt.name)}
            className={`w-full text-left p-3 rounded border-2 transition-colors ${
              selectedOption === opt.name
                ? 'border-accent bg-accent/10'
                : 'border-border bg-elevated-1 hover:border-accent/50'
            }`}
          >
            <div className="font-medium text-fg mb-1">{opt.name}</div>
            <div className="text-sm text-fg-muted">{opt.description}</div>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-fg-subtle">
          Or describe your preference:
        </label>
        <Textarea
          value={customResponse}
          onChange={(e) => setCustomResponse(e.target.value)}
          placeholder="Describe what you'd prefer..."
          rows={3}
        />
      </div>
    </DialogLayout>
  );
}
