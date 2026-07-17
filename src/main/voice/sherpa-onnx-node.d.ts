declare module 'sherpa-onnx-node' {
  export type Waveform = {
    samples: Float32Array;
    sampleRate: number;
  };

  export interface OfflineRecognizerResult {
    text: string;
    lang: string;
    emotion: string;
    event: string;
  }

  export class OfflineStream {
    acceptWaveform(wave: Waveform): void;
  }

  export interface OfflineMoonshineModelConfig {
    preprocessor: string;
    encoder: string;
    uncachedDecoder: string;
    cachedDecoder: string;
  }

  export interface OfflineRecognizerConfig {
    modelConfig: {
      moonshine: OfflineMoonshineModelConfig;
      tokens: string;
      numThreads?: number;
      provider?: string;
      debug?: boolean;
    };
  }

  export class OfflineRecognizer {
    static createAsync(config: OfflineRecognizerConfig): Promise<OfflineRecognizer>;
    createStream(): OfflineStream;
    decodeAsync(stream: OfflineStream): Promise<OfflineRecognizerResult>;
  }

  export type SpeechSegment = {
    start: number;
    samples: Float32Array;
  };

  export interface SileroVadModelConfig {
    model: string;
    threshold?: number;
    minSilenceDuration?: number;
    minSpeechDuration?: number;
    windowSize?: number;
    maxSpeechDuration?: number;
  }

  export interface VadConfig {
    sileroVad: SileroVadModelConfig;
    sampleRate?: number;
    numThreads?: number;
    provider?: string;
  }

  export class Vad {
    constructor(config: VadConfig, bufferSizeInSeconds: number);
    acceptWaveform(samples: Float32Array): void;
    isEmpty(): boolean;
    isDetected(): boolean;
    pop(): void;
    front(enableExternalBuffer: boolean): SpeechSegment;
    reset(): void;
    flush(): void;
  }

  // The package is CommonJS with a single `module.exports = { ... }` object
  // built from other required modules' properties, which Node's CJS-lexer
  // can't statically analyze for named exports. Import the default and
  // destructure at runtime instead of `import { OfflineRecognizer } from ...`.
  const sherpaOnnxNode: {
    OfflineRecognizer: typeof OfflineRecognizer;
    Vad: typeof Vad;
  };
  export default sherpaOnnxNode;
}
