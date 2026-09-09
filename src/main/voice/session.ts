import { createLogger } from '../logger';
import { transcribe } from './recognizer';
import { getVad, VOICE_SESSION_SAMPLE_RATE } from './vad';

const log = createLogger('voice-session');

// Electron's V8 build doesn't support the zero-copy "external buffer"
// sherpa-onnx-node returns by default from Vad.front() — throws
// "External buffers are not allowed". Passing false forces a real copy.
// See https://k2-fsa.github.io/sherpa/onnx/faqs/index.html
const ENABLE_EXTERNAL_BUFFER = false;

type ActiveSession = { token: string; startedAt: number };
let active: ActiveSession | null = null;

class ForeignVoiceSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForeignVoiceSessionError';
  }
}

async function drainDetectedSegments(): Promise<string[]> {
  const vad = getVad();
  const texts: string[] = [];

  while (!vad.isEmpty()) {
    const segment = vad.front(ENABLE_EXTERNAL_BUFFER);
    vad.pop();
    const text = await transcribe(segment.samples, VOICE_SESSION_SAMPLE_RATE);
    if (text) texts.push(text);
  }

  return texts;
}

export function startVoiceSession(token: string): void {
  if (active) {
    log.warn('startVoiceSession: rejecting — another session is already active.', {
      activeToken: active.token,
      requestedToken: token,
      activeAgeMs: Date.now() - active.startedAt,
    });
    throw new ForeignVoiceSessionError(
      'Another window or tab is already dictating. Stop that session first.',
    );
  }
  getVad().reset();
  active = { token, startedAt: Date.now() };
}

export async function pushVoiceChunk(token: string, samples: Float32Array): Promise<string[]> {
  if (!active) {
    throw new Error('No active voice dictation session.');
  }
  if (active.token !== token) {
    log.warn('pushVoiceChunk: rejecting chunk from a foreign/stale session token.', {
      activeToken: active.token,
      requestedToken: token,
    });
    throw new ForeignVoiceSessionError('This dictation session is no longer active.');
  }
  getVad().acceptWaveform(samples);
  return drainDetectedSegments();
}

export async function endVoiceSession(token: string): Promise<string[]> {
  if (!active || active.token !== token) return [];
  getVad().flush();
  const texts = await drainDetectedSegments();
  active = null;
  return texts;
}
