import { useState } from 'react';
import { Button, Textarea } from '../../ui';
import { DialogLayout } from './DialogLayout';
import type { DialogProps, FeedbackPayload } from './types';

export function FeedbackDialog({ reqId, payload, onRespond }: DialogProps<FeedbackPayload>) {
  const [feedback, setFeedback] = useState('');

  const handleSubmit = () => {
    onRespond({
      reqId,
      decision: 'custom',
      feedback: feedback.trim() || 'Looks good',
    });
  };

  return (
    <DialogLayout
      title="Feedback Requested"
      onBackdropClick={handleSubmit}
      maxHeight
      footer={
        <Button onClick={handleSubmit} variant="primary">
          Submit Feedback
        </Button>
      }
    >
      <div>
        <div className="text-sm font-medium text-fg-subtle mb-2">Work Completed:</div>
        <p className="text-fg">{payload.work_completed}</p>
      </div>

      {payload.preview && (
        <div>
          <div className="text-sm font-medium text-fg-subtle mb-2">Preview:</div>
          <pre className="p-3 rounded bg-elevated-2 border border-border text-xs overflow-x-auto font-mono">
            {payload.preview}
          </pre>
        </div>
      )}

      {payload.specific_questions && payload.specific_questions.length > 0 && (
        <div>
          <div className="text-sm font-medium text-fg-subtle mb-2">Questions:</div>
          <ul className="list-disc list-inside space-y-1 text-sm text-fg-muted">
            {payload.specific_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-fg-subtle">
          Your feedback:
        </label>
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Looks good! Or: Please change..."
          rows={4}
          autoFocus
        />
      </div>
    </DialogLayout>
  );
}
