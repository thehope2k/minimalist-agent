import sherpaOnnxNode, { type OfflineRecognizer } from 'sherpa-onnx-node';
import { getMoonshineModelPaths, isMoonshineModelReady } from './model';

const { OfflineRecognizer: OfflineRecognizerCtor } = sherpaOnnxNode;

const NUM_THREADS = 1;

// Single-flight by design: one native OfflineRecognizer handle, shared
// across calls. The current UI only ever has one active recording/transcribe
// at a time, so this is safe today — a second concurrent caller (e.g. a
// future second dictation surface) would need its own recognizer instance
// or an explicit queue, not a second call into this same singleton.
let recognizerPromise: Promise<OfflineRecognizer> | null = null;

function createRecognizer(): Promise<OfflineRecognizer> {
  if (!isMoonshineModelReady()) {
    throw new Error('Voice model is not downloaded yet.');
  }
  const paths = getMoonshineModelPaths();
  return OfflineRecognizerCtor.createAsync({
    modelConfig: {
      moonshine: {
        preprocessor: paths.preprocessor,
        encoder: paths.encoder,
        uncachedDecoder: paths.uncachedDecoder,
        cachedDecoder: paths.cachedDecoder,
      },
      tokens: paths.tokens,
      numThreads: NUM_THREADS,
      provider: 'cpu',
    },
  });
}

function getRecognizer(): Promise<OfflineRecognizer> {
  if (!recognizerPromise) {
    recognizerPromise = createRecognizer().catch((error: unknown) => {
      recognizerPromise = null;
      throw error;
    });
  }
  return recognizerPromise;
}

export async function transcribe(samples: Float32Array, sampleRate: number): Promise<string> {
  const recognizer = await getRecognizer();
  const stream = recognizer.createStream();
  stream.acceptWaveform({ samples, sampleRate });
  const result = await recognizer.decodeAsync(stream);
  return result.text.trim();
}
