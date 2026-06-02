/** Payload pushed from non-chat surfaces (e.g. New Skill) into a fresh chat. */
export interface SeedSubmit {
  /** What the user sees in the chat transcript. */
  displayText: string;
  /** What the agent actually receives — typically wraps `displayText` with context. */
  agentText: string;
  /** Origin tag for the contextual chip above the user bubble. */
  intentTag: string;
}

export const PANEL_CARD =
  'h-full w-full overflow-hidden rounded-[10px] ring-1 ring-border-strong bg-panel';

export const PROJECT_FILTER_KEY = 'minimalist:projectFilter';
