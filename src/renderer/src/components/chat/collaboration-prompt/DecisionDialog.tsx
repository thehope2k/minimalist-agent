import { useState } from 'react';
import { Button, Textarea } from '../../ui';
import { DialogLayout } from './DialogLayout';
import type { DialogProps, DecisionPayload } from './types';

export function DecisionDialog({ reqId, payload, onRespond }: DialogProps<DecisionPayload>) {
  const [selectedOption, setSelectedOption] = useState<string | null>(
    payload.recommended || null
  );
  const [customResponse, setCustomResponse] = useState('');

  const handleSubmit = () => {
    onRespond({
      reqId,
      decision: 'custom',
      selected_option: selectedOption || undefined,
      custom_response: customResponse.trim() || undefined,
    });
  };

  return (
    <DialogLayout
      title="Decision Needed"
      onBackdropClick={handleSubmit}
      maxHeight
      footer={
        <Button onClick={handleSubmit} variant="primary">
          Proceed with {selectedOption || 'selection'}
        </Button>
      }
    >
      <p className="text-fg">{payload.question}</p>

      {payload.context && (
        <div className="p-3 rounded bg-elevated-1 border border-border">
          <p className="text-sm text-fg-muted">{payload.context}</p>
        </div>
      )}

      <div className="space-y-3">
        {payload.alternatives.map((alt, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedOption(alt.name)}
            className={`w-full text-left p-4 rounded border-2 transition-colors ${
              selectedOption === alt.name
                ? 'border-accent bg-accent/10'
                : 'border-border bg-elevated-1 hover:border-accent/50'
            }`}
          >
            <div className="font-medium text-fg mb-2">{alt.name}</div>
            <div className="text-sm text-fg-muted mb-3">{alt.description}</div>
            
            {alt.pros.length > 0 && (
              <div className="mb-2">
                <div className="text-xs font-medium text-green-400 mb-1">Pros:</div>
                <ul className="text-xs text-fg-muted space-y-0.5 list-disc list-inside">
                  {alt.pros.map((pro, i) => (
                    <li key={i}>{pro}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {alt.cons.length > 0 && (
              <div>
                <div className="text-xs font-medium text-red-400 mb-1">Cons:</div>
                <ul className="text-xs text-fg-muted space-y-0.5 list-disc list-inside">
                  {alt.cons.map((con, i) => (
                    <li key={i}>{con}</li>
                  ))}
                </ul>
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-fg-subtle">
          Additional guidance (optional):
        </label>
        <Textarea
          value={customResponse}
          onChange={(e) => setCustomResponse(e.target.value)}
          placeholder="Any additional context or constraints..."
          rows={3}
        />
      </div>
    </DialogLayout>
  );
}
