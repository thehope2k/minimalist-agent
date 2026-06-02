import type { PermissionMode } from '@/lib/electron';

export type SeedSubmit = {
  /** What the user sees in the chat transcript. */
  displayText: string;
  /** What the agent actually receives — typically wraps `displayText` with context. */
  agentText: string;
  /** Origin tag for the contextual chip above the user bubble. */
  intentTag: string;
};

export type ChatAreaProps = {
  sessionId: string | null;
  /** Called when the user sends in an unsaved chat — App tracks the new id. */
  onSessionCreated: (id: string) => void;
  /** Called when user clicks the "X / new" header button. */
  onNewSession: () => void;
  /** Structured submission auto-sent on next mount (e.g. New Skill). */
  seedSubmit?: SeedSubmit | null;
  /** Fires once ChatArea has consumed the seed; lets App clear its state. */
  onSeedSubmitConsumed?: () => void;
  newSessionDefaultProjectId?: string | null;
  /** Reports the set of session ids with active streams (including off-screen). */
  onStreamingChange?: (ids: ReadonlySet<string>) => void;
  /** Reports CWD changes so the global terminal panel can seed new tabs. */
  onCwdChange?: (cwd: string | undefined) => void;
  /** Global chat visibility gate (e.g. disabled while Settings/Skills/Extensions are shown). */
  shortcutsEnabled?: boolean;
  /** Called when user opens a file from SearchModal or RecentFilesModal. */
  onOpenFile?: (absolutePath: string, lineNumber: number) => void;
  /** Toggle file explorer panel (for header button). */
  onToggleFileExplorer?: () => void;
  /** File explorer panel open state (for active styling). */
  fileExplorerOpen?: boolean;
};

export type SessionMeta = {
  cwd: string | undefined;
  title: string;
  permissionMode: PermissionMode;
  autonomyLevel: number;
  projectDefaultConnectionSlug: string;
  sessionConnectionSlug: string;
  sessionModel: string;
};
