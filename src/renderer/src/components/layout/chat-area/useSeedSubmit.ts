import { useEffect, useRef } from 'react';
import { homedir } from '@/lib/path';
import type { PermissionMode } from '@/lib/electron';
import type { useAiData } from '@/hooks/useAiData';
import type { SeedSubmit } from './types';

/**
 * Auto-send seeded submissions (e.g. from "+ New Skill"). Waits until
 * AI data has loaded, no in-flight stream, and fresh chat before firing.
 */
export function resolveSeedPermissionMode(
  seedSubmit: SeedSubmit,
  sessionPermissionMode: PermissionMode,
): PermissionMode {
  return seedSubmit.permissionMode ?? sessionPermissionMode;
}

export function useSeedSubmit(
  seedSubmit: SeedSubmit | null | undefined,
  onSeedSubmitConsumed: (() => void) | undefined,
  aiData: ReturnType<typeof useAiData>,
  isStreaming: boolean,
  messages: any[],
  cwd: string | undefined,
  permissionMode: PermissionMode,
  send: (args: any) => void,
) {
  const seedFiredRef = useRef<SeedSubmit | null>(null);

  useEffect(() => {
    if (!seedSubmit) return;
    if (seedFiredRef.current === seedSubmit) return;
    if (!aiData) return;
    if (isStreaming) return;
    if (messages.length > 0) return;

    const connection =
      aiData.connections.find((c) => c.slug === aiData.defaultSlug) ?? aiData.connections[0];
    if (!connection) return;

    const model =
      connection.models.find((m) => m.id === aiData.settings.defaultModel)?.id ??
      connection.defaultModel;
    if (!model) return;

    seedFiredRef.current = seedSubmit;
    onSeedSubmitConsumed?.();

    void send({
      text: seedSubmit.displayText,
      agentText: seedSubmit.agentText,
      intentTag: seedSubmit.intentTag,
      connection,
      model,
      cwd: cwd ?? (homedir() || undefined),
      // A seed always creates a fresh session. Its requested mode must become
      // that session's persisted mode, not merely override its first turn.
      permissionMode: resolveSeedPermissionMode(seedSubmit, permissionMode),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedSubmit, aiData, isStreaming, messages.length]);
}
