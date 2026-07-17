import sherpaOnnxNode, { type Vad } from 'sherpa-onnx-node';
import { getVadModelPath, isVoiceModelReady } from './model';

const { Vad: VadCtor } = sherpaOnnxNode;

const VAD_SAMPLE_RATE = 16000;
const VAD_THRESHOLD = 0.5;
const VAD_MIN_SILENCE_DURATION_SECONDS = 0.5;
const VAD_MIN_SPEECH_DURATION_SECONDS = 0.25;
const VAD_WINDOW_SIZE = 512;
const VAD_MAX_SPEECH_DURATION_SECONDS = 20;
const VAD_INTERNAL_BUFFER_SECONDS = 30;

// Single-flight by design, same invariant as recognizer.ts: one active
// dictation session at a time, enforced by the renderer's own guards.
let vadInstance: Vad | null = null;

function createVad(): Vad {
  return new VadCtor(
    {
      sileroVad: {
        model: getVadModelPath(),
        threshold: VAD_THRESHOLD,
        minSilenceDuration: VAD_MIN_SILENCE_DURATION_SECONDS,
        minSpeechDuration: VAD_MIN_SPEECH_DURATION_SECONDS,
        windowSize: VAD_WINDOW_SIZE,
        maxSpeechDuration: VAD_MAX_SPEECH_DURATION_SECONDS,
      },
      sampleRate: VAD_SAMPLE_RATE,
      numThreads: 1,
      provider: 'cpu',
    },
    VAD_INTERNAL_BUFFER_SECONDS,
  );
}

export function getVad(): Vad {
  if (!isVoiceModelReady()) {
    throw new Error('Voice model is not downloaded yet.');
  }
  if (!vadInstance) {
    vadInstance = createVad();
  }
  return vadInstance;
}

export const VOICE_SESSION_SAMPLE_RATE = VAD_SAMPLE_RATE;
