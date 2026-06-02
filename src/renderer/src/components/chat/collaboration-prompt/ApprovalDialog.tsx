import { useState } from 'react';
import { Button, Textarea } from '../../ui';
import { DialogLayout } from './DialogLayout';
import type { DialogProps, ApprovalPayload } from './types';

export function ApprovalDialog({ reqId, payload, onRespond }: DialogProps<ApprovalPayload>) {
  const [note, setNote] = useState('');

  const handleApprove = () => {
    onRespond({
      reqId,
      decision: 'approved',
      custom_response: note.trim() || undefined,
    });
  };

  const handleDeny = () => {
    onRespond({
      reqId,
      decision: 'denied',
      custom_response: note.trim() || undefined,
    });
  };

  const riskColor =
    payload.risk_level >= 80 ? 'text-red-400' :
    payload.risk_level >= 50 ? 'text-yellow-400' :
    'text-green-400';

  return (
    <DialogLayout
      title="Approval Required"
      onBackdropClick={handleDeny}
      footer={
        <>
          <Button onClick={handleDeny} variant="outline">
            Deny
          </Button>
          <Button onClick={handleApprove} variant="primary">
            Approve
          </Button>
        </>
      }
    >
      <div>
        <div className="text-sm font-medium text-fg-subtle mb-2">Operation:</div>
        <p className="text-fg font-medium">{payload.operation}</p>
      </div>

      <div>
        <div className="text-sm font-medium text-fg-subtle mb-2">Reason:</div>
        <p className="text-fg-muted">{payload.reason}</p>
      </div>

      <div className="flex items-center gap-3 p-3 rounded bg-elevated-1 border border-border">
        <div className="text-sm">
          <span className="text-fg-subtle">Risk Level: </span>
          <span className={`font-medium ${riskColor}`}>{payload.risk_level}/100</span>
        </div>
      </div>

      {payload.risk_factors.length > 0 && (
        <div>
          <div className="text-sm font-medium text-fg-subtle mb-2">Risk Factors:</div>
          <ul className="space-y-1 text-sm text-fg-muted list-disc list-inside">
            {payload.risk_factors.map((factor, i) => (
              <li key={i}>{factor}</li>
            ))}
          </ul>
        </div>
      )}

      {payload.details && Object.keys(payload.details).length > 0 && (
        <div>
          <div className="text-sm font-medium text-fg-subtle mb-2">Details:</div>
          <pre className="p-2 rounded bg-elevated-2 border border-border text-xs overflow-x-auto font-mono">
            {JSON.stringify(payload.details, null, 2)}
          </pre>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-fg-subtle">
          Note (optional):
        </label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Any instructions or concerns..."
          rows={2}
        />
      </div>
    </DialogLayout>
  );
}
