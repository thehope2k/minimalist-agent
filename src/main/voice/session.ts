import { createLogger } from '../logger';
import { transcribe } from './recognizer';
import { getVad, VOICE_SESSION_SAMPLE_RATE } from './vad';

const log = createLogger('voice-session');

// Electron's V8 build doesn't support the zero-copy "external buffer"
// sherpa-onnx-node returns by default from Vad.front() — throws
// "External buffers are not allowed". Passing false forces a real copy.
// See https://k2-fsa.github.io/sherpa/onnx/faqs/index.html
const ENABLE_EXTERNAL_BUFFER = false;

// Assumes a single BrowserWindow / MessageInput at a time — not enforced
// elsewhere in the app. A second concurrent session resets this one.
let sessionActive = false;

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

export function startVoiceSession(): void {
  if (sessionActive) {
    log.warn('startVoiceSession called while a session was already active \u2014 resetting.');
  }
  getVad().reset();
  sessionActive = true;
}

export async function pushVoiceChunk(samples: Float32Array): Promise<string[]> {
  if (!sessionActive) {
    throw new Error('No active voice dictation session.');
  }
  getVad().acceptWaveform(samples);
  return drainDetectedSegments();
}

export async function endVoiceSession(): Promise<string[]> {
  if (!sessionActive) return [];
  getVad().flush();
  const texts = await drainDetectedSegments();
  sessionActive = false;
  return texts;
}
