import { useState } from 'react';
import { Button, Textarea } from '../../ui';
import { DialogLayout } from './DialogLayout';
import type { DialogProps, GuidancePayload } from './types';

export function GuidanceDialog({ reqId, payload, onRespond }: DialogProps<GuidancePayload>) {
  const [guidance, setGuidance] = useState('');

  const handleSubmit = () => {
    onRespond({
      reqId,
      decision: 'custom',
      custom_response: guidance.trim() || undefined,
    });
  };

  const handleDefer = () => {
    onRespond({
      reqId,
      decision: 'defer',
      custom_response: guidance.trim() || undefined,
    });
  };

  return (
    <DialogLayout
      title="Guidance Needed"
      onBackdropClick={handleDefer}
      maxHeight
      footer={
        <>
          <Button onClick={handleDefer} variant="outline">
            Discuss first
          </Button>
          <Button onClick={handleSubmit} variant="primary">
            Submit Guidance
          </Button>
        </>
      }
    >
      <div>
        <div className="text-sm font-medium text-fg-subtle mb-2">Situation:</div>
        <p className="text-fg">{payload.situation}</p>
      </div>

      <div>
        <div className="text-sm font-medium text-fg-subtle mb-2">Trade-offs:</div>
        <div className="space-y-3">
          {payload.trade_offs.map((tradeOff, idx) => (
            <div key={idx} className="p-3 rounded bg-elevated-1 border border-border">
              <div className="font-medium text-fg mb-2">{tradeOff.option}</div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs font-medium text-green-400 mb-1">Pros:</div>
                  <ul className="text-xs text-fg-muted space-y-0.5 list-disc list-inside">
                    {tradeOff.pros.map((pro, i) => (
                      <li key={i}>{pro}</li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <div className="text-xs font-medium text-red-400 mb-1">Cons:</div>
                  <ul className="text-xs text-fg-muted space-y-0.5 list-disc list-inside">
                    {tradeOff.cons.map((con, i) => (
                      <li key={i}>{con}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm font-medium text-fg-subtle mb-2">
          {payload.what_guidance_needed}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-fg-subtle">
          Your guidance:
        </label>
        <Textarea
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          placeholder="What should I prioritize?"
          rows={4}
          autoFocus
        />
      </div>
    </DialogLayout>
  );
}
