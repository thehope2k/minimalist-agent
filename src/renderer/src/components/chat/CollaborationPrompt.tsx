/**
 * Collaboration prompts - engagement dialogs for intelligent collaboration.
 * 
 * Similar to PermissionPrompt, subscribes to collaboration-request events
 * from main and shows appropriate UI based on engagement type.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Textarea } from '../ui';
import type {
  EngagementRequest,
  DecisionPayload,
  PreferencePayload,
  FeedbackPayload,
  GuidancePayload,
  ApprovalPayload,
  EngagementResponse,
} from '@/lib/electron';

export function CollaborationPrompt() {
  const [queue, setQueue] = useState<EngagementRequest[]>([]);

  // Subscribe to collaboration-request events from main
  useEffect(() => {
    if (!window.api?.chat?.onCollaborationRequest) return;
    return window.api.chat.onCollaborationRequest((req) => {
      setQueue((q) => [...q, req]);
    });
  }, []);

  const current = queue[0] ?? null;

  const respond = async (response: EngagementResponse) => {
    if (!current) return;
    await window.api.chat.respondCollaboration(response);
    setQueue((q) => q.slice(1));
  };

  if (!current) return null;

  const dialogContent = (() => {
    switch (current.type) {
      case 'decision':
        return (
          <DecisionDialog
            reqId={current.reqId}
            payload={current.payload as DecisionPayload}
            onRespond={respond}
          />
        );
      case 'preference':
        return (
          <PreferenceDialog
            reqId={current.reqId}
            payload={current.payload as PreferencePayload}
            onRespond={respond}
          />
        );
      case 'feedback':
        return (
          <FeedbackDialog
            reqId={current.reqId}
            payload={current.payload as FeedbackPayload}
            onRespond={respond}
          />
        );
      case 'guidance':
        return (
          <GuidanceDialog
            reqId={current.reqId}
            payload={current.payload as GuidancePayload}
            onRespond={respond}
          />
        );
      case 'approval':
        return (
          <ApprovalDialog
            reqId={current.reqId}
            payload={current.payload as ApprovalPayload}
            onRespond={respond}
          />
        );
      default:
        return null;
    }
  })();

  return createPortal(dialogContent, document.body);
}

/* ============================================================ */
/*  Decision Dialog                                               */
/* ============================================================ */

interface DecisionDialogProps {
  reqId: string;
  payload: DecisionPayload;
  onRespond: (response: EngagementResponse) => void;
}

function DecisionDialog({ reqId, payload, onRespond }: DecisionDialogProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleSubmit}
      />
      
      <div className="relative w-[min(640px,calc(100vw-32px))] max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-panel shadow-2xl">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-fg">Decision Needed</h2>
        </div>

        <div className="space-y-4 p-5">
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
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button onClick={handleSubmit} variant="primary">
            Proceed with {selectedOption || 'selection'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  Preference Dialog                                             */
/* ============================================================ */

interface PreferenceDialogProps {
  reqId: string;
  payload: PreferencePayload;
  onRespond: (response: EngagementResponse) => void;
}

function PreferenceDialog({ reqId, payload, onRespond }: PreferenceDialogProps) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleSubmit}
      />
      
      <div className="relative w-[min(560px,calc(100vw-32px))] rounded-xl border border-border bg-panel shadow-2xl">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-fg">Your Preference</h2>
        </div>

        <div className="space-y-4 p-5">
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
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button onClick={handleSubmit} variant="primary">
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  Feedback Dialog                                               */
/* ============================================================ */

interface FeedbackDialogProps {
  reqId: string;
  payload: FeedbackPayload;
  onRespond: (response: EngagementResponse) => void;
}

function FeedbackDialog({ reqId, payload, onRespond }: FeedbackDialogProps) {
  const [feedback, setFeedback] = useState('');

  const handleSubmit = () => {
    onRespond({
      reqId,
      decision: 'custom',
      feedback: feedback.trim() || 'Looks good',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleSubmit}
      />
      
      <div className="relative w-[min(640px,calc(100vw-32px))] max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-panel shadow-2xl">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-fg">Feedback Requested</h2>
        </div>

        <div className="space-y-4 p-5">
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
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button onClick={handleSubmit} variant="primary">
            Submit Feedback
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  Guidance Dialog                                               */
/* ============================================================ */

interface GuidanceDialogProps {
  reqId: string;
  payload: GuidancePayload;
  onRespond: (response: EngagementResponse) => void;
}

function GuidanceDialog({ reqId, payload, onRespond }: GuidanceDialogProps) {
  const [guidance, setGuidance] = useState('');

  const handleSubmit = () => {
    onRespond({
      reqId,
      decision: 'custom',
      custom_response: guidance.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleSubmit}
      />
      
      <div className="relative w-[min(640px,calc(100vw-32px))] max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-panel shadow-2xl">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-fg">Guidance Needed</h2>
        </div>

        <div className="space-y-4 p-5">
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
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button onClick={handleSubmit} variant="primary">
            Submit Guidance
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  Approval Dialog                                               */
/* ============================================================ */

interface ApprovalDialogProps {
  reqId: string;
  payload: ApprovalPayload;
  onRespond: (response: EngagementResponse) => void;
}

function ApprovalDialog({ reqId, payload, onRespond }: ApprovalDialogProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleDeny}
      />
      
      <div className="relative w-[min(560px,calc(100vw-32px))] rounded-xl border border-border bg-panel shadow-2xl">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-fg">Approval Required</h2>
        </div>

        <div className="space-y-4 p-5">
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
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button onClick={handleDeny} variant="outline">
            Deny
          </Button>
          <Button onClick={handleApprove} variant="primary">
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}
