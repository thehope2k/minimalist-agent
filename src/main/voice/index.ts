import { downloadVoiceModels, isVoiceModelReady, type ModelDownloadProgress } from './model';
import { endVoiceSession, pushVoiceChunk, startVoiceSession } from './session';

export type { ModelDownloadProgress };

export type VoiceModelStatus = 'ready' | 'not-downloaded';

export function getVoiceModelStatus(): VoiceModelStatus {
  return isVoiceModelReady() ? 'ready' : 'not-downloaded';
}

export async function ensureVoiceModel(
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<void> {
  await downloadVoiceModels(onProgress);
}

export { startVoiceSession, pushVoiceChunk, endVoiceSession };
