import type { LoadedAgent } from '@/lib/electron';
import type { SeedSubmit } from '@/App';
import React from "react";

export type AgentInfoPageProps = {
  agent: LoadedAgent | null;
  onClose: () => void;
  onStartChatWithSubmission?: (submit: SeedSubmit) => void;
};

export interface KeyValueRow {
  label: string;
  value: React.ReactNode;
}
