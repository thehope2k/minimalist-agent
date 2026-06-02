import type {
  EngagementRequest,
  DecisionPayload,
  PreferencePayload,
  FeedbackPayload,
  GuidancePayload,
  ApprovalPayload,
  EngagementResponse,
} from '@/lib/electron';

export type {
  EngagementRequest,
  DecisionPayload,
  PreferencePayload,
  FeedbackPayload,
  GuidancePayload,
  ApprovalPayload,
  EngagementResponse,
};

export interface DialogProps<T> {
  reqId: string;
  payload: T;
  onRespond: (response: EngagementResponse) => void;
}
