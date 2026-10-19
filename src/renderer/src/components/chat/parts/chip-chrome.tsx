// Outer chrome shared by the one-line part chips (tool, thinking, diff, todo).
// Standalone, each chip is its own bordered card; inside a ToolPack the pack
// supplies the border and dividers, so chips render as flush rows.
import { createContext, useContext } from 'react';

const GroupedContext = createContext(false);

/** Renders descendant chips as flush rows (`grouped`) or standalone cards. */
export function ChipGroup({
  grouped = true,
  children,
}: {
  grouped?: boolean;
  children: React.ReactNode;
}) {
  return <GroupedContext.Provider value={grouped}>{children}</GroupedContext.Provider>;
}

export type ChipTone = 'default' | 'error' | 'agent';

const STANDALONE: Record<ChipTone, string> = {
  default: 'rounded-md border border-border bg-elevated/40',
  error: 'rounded-md border border-red-500/30 bg-red-500/5',
  agent: 'rounded-md border border-accent/40 bg-elevated/40',
};

const GROUPED: Record<ChipTone, string> = {
  default: '',
  error: 'bg-red-500/5',
  agent: 'bg-accent/5',
};

export function useChipChrome(tone: ChipTone = 'default'): string {
  return useContext(GroupedContext) ? GROUPED[tone] : STANDALONE[tone];
}
