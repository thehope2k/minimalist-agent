import { ipcMain } from 'electron';
import {
  ensureVoiceModel,
  getVoiceModelStatus,
  startVoiceSession,
  pushVoiceChunk,
  endVoiceSession,
  type ModelDownloadProgress,
} from '../voice';

/** On-device voice dictation (sherpa-onnx + Moonshine model). */
export function registerVoiceIpc(): void {
  ipcMain.handle('voice:getModelStatus', () => getVoiceModelStatus());

  ipcMain.handle('voice:downloadModel', async (event) => {
    await ensureVoiceModel((progress: ModelDownloadProgress) => {
      if (event.sender.isDestroyed()) return;
      event.sender.send('voice:downloadProgress', progress);
    });
    return getVoiceModelStatus();
  });

  ipcMain.handle('voice:startSession', (_e, token: string) => startVoiceSession(token));

  ipcMain.handle(
    'voice:pushChunk',
    async (_e, token: string, samples: Float32Array): Promise<string[]> =>
      pushVoiceChunk(token, samples),
  );

  ipcMain.handle(
    'voice:endSession',
    async (_e, token: string): Promise<string[]> => endVoiceSession(token),
  );
}
