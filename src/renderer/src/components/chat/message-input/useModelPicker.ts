import { useState, useEffect, useRef } from 'react';
import { getNewSessionStateDraft } from '@/lib/new-session-draft';
import { useAiData } from '@/hooks/useAiData';
import type { ConnectionMeta } from '@/lib/electron';
import type { ModelPick } from './types';

/**
 * Model picker state and connection/model resolution logic. Handles
 * session-specific picks, project defaults, and global defaults.
 */
export function useModelPicker(
  sessionId: string | null,
  projectDefaultConnectionSlug: string | undefined,
  sessionConnectionSlug: string | undefined,
  sessionModel: string | undefined,
  loadedSessionPickId: string | null | undefined,
) {
  const data = useAiData();
  const [pickerOverride, setPickerOverride] = useState<ModelPick | null>(null);
  const pickerOverrideRef = useRef(pickerOverride);
  pickerOverrideRef.current = pickerOverride;

  const lastSyncedSessionIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (sessionId === null) {
      // Fresh chat — restore picker from draft
      if (lastSyncedSessionIdRef.current !== null) {
        lastSyncedSessionIdRef.current = null;
        const d = getNewSessionStateDraft();
        setPickerOverride(
          d.connectionSlug && d.modelId
            ? { slug: d.connectionSlug, modelId: d.modelId }
            : null,
        );
      }
      return;
    }

    // Wait for the data to belong to the current session
    if (loadedSessionPickId !== sessionId) return;
    
    // Already synced for this session id
    if (lastSyncedSessionIdRef.current === sessionId) return;
    
    lastSyncedSessionIdRef.current = sessionId;
    if (sessionConnectionSlug && sessionModel) {
      setPickerOverride({ slug: sessionConnectionSlug, modelId: sessionModel });
    } else {
      setPickerOverride(null);
    }
  }, [sessionId, loadedSessionPickId, sessionConnectionSlug, sessionModel]);

  // Resolve final connection and model from cascade:
  // picker override → project default → global default → first connection
  const connection: ConnectionMeta | null = data
    ? (pickerOverride &&
        data.connections.find((c) => c.slug === pickerOverride.slug)) ||
      (projectDefaultConnectionSlug &&
        data.connections.find((c) => c.slug === projectDefaultConnectionSlug)) ||
      data.connections.find((c) => c.slug === data.defaultSlug) ||
      data.connections[0] ||
      null
    : null;

  const model: string | null =
    (connection &&
      ((pickerOverride?.slug === connection.slug
        ? connection.models.find((m) => m.id === pickerOverride.modelId)?.id
        : null) ??
        connection.models.find((m) => m.id === data?.settings.defaultModel)
          ?.id ??
        connection.defaultModel)) ||
    null;

  return {
    data,
    connection,
    model,
    pickerOverride,
    pickerOverrideRef,
    setPickerOverride,
  };
}
