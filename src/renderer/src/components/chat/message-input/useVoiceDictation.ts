import { useEffect, useRef, useState } from 'react';
import { concatFloat32, createStreamingDownsampler, type StreamingDownsampler } from './pcm';

const TARGET_SAMPLE_RATE = 16000;
// Silent — the node must reach context.destination to keep processing, but
// must not be audible.
const MONITOR_GAIN = 0;
const CHUNK_FLUSH_INTERVAL_SECONDS = 0.2;

export type VoiceModelStatus =
  | 'unknown'
  | 'not-downloaded'
  | 'downloading'
  | 'ready'
  | 'error';

export type VoiceDownloadProgress = {
  downloadedBytes: number;
  totalBytes: number | null;
};

type Phase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'recording'; token: string }
  | { kind: 'stopping' };

type AbortOptions = { flushFinal: boolean };

export function useVoiceDictation(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (text: string) => void,
) {
  const [modelStatus, setModelStatus] = useState<VoiceModelStatus>('unknown');
  const [downloadProgress, setDownloadProgress] = useState<VoiceDownloadProgress | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const transition = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Guards against a fast double-click starting two overlapping
  // ensureModelReady()/getUserMedia() calls before React commits the
  // 'starting'/'recording' phase.
  const startInFlightRef = useRef(false);
  const suppressInsertRef = useRef(false);
  const cancelStartRef = useRef(false);

  // Native-rate audio accumulates here between flushes; once it crosses
  // flushThresholdRef (computed from the mic's actual sample rate), it's
  // downsampled and handed to the send chain below.
  const nativeChunksRef = useRef<Float32Array[]>([]);
  const nativeBufferedSamplesRef = useRef(0);
  const flushThresholdRef = useRef(0);
  const downsamplerRef = useRef<StreamingDownsampler | null>(null);

  // Chunks are sent to the main-process VAD/recognizer pipeline in strict
  // order via this promise chain, so a slow pushChunk() can never race a
  // later one or the final endSession() flush.
  const sendChainRef = useRef<Promise<void>>(Promise.resolve());
  const receivedSpeechRef = useRef(false);

  useEffect(() => {
    window.api.voice.getModelStatus().then(setModelStatus);
  }, []);

  useEffect(() => window.api.voice.onDownloadProgress(setDownloadProgress), []);

  const insertTranscript = (text: string) => {
    if (suppressInsertRef.current) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const el = textareaRef.current;
    const currentValue = valueRef.current;
    if (!el) {
      setValue(currentValue ? `${currentValue} ${trimmed}` : trimmed);
      return;
    }

    const cursor = el.selectionStart ?? currentValue.length;
    const before = currentValue.slice(0, cursor);
    const after = currentValue.slice(cursor);
    const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
    const insertion = `${needsLeadingSpace ? ' ' : ''}${trimmed}`;

    setValue(`${before}${insertion}${after}`);
    requestAnimationFrame(() => {
      const nextCursor = before.length + insertion.length;
      el.focus();
      el.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const enqueueChunk = (token: string, chunk: Float32Array) => {
    sendChainRef.current = sendChainRef.current
      .then(() => window.api.voice.pushChunk(token, chunk))
      .then((texts) => {
        if (texts.length === 0) return;
        receivedSpeechRef.current = true;
        for (const text of texts) insertTranscript(text);
      })
      .catch((e) => {
        if (suppressInsertRef.current) return; // already aborting elsewhere — don't surface a race as a user-facing error
        setError(e instanceof Error ? e.message : 'Transcription failed.');
      });
  };

  const flushNativeBuffer = (token: string) => {
    const chunks = nativeChunksRef.current;
    nativeChunksRef.current = [];
    nativeBufferedSamplesRef.current = 0;
    if (chunks.length === 0 || !downsamplerRef.current) return;

    const resampled = downsamplerRef.current.push(concatFloat32(chunks));
    if (resampled.length > 0) enqueueChunk(token, resampled);
  };

  const teardownAudioGraph = () => {
    workletRef.current?.port.close();
    workletRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void audioContextRef.current?.close();
    workletRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
  };

  const abortDictation = async ({ flushFinal }: AbortOptions): Promise<void> => {
    const current = phaseRef.current;
    if (current.kind !== 'recording') return;
    const { token } = current;

    if (!flushFinal) suppressInsertRef.current = true;

    teardownAudioGraph();
    audioContextRef.current = null;
    transition({ kind: 'stopping' });

    flushNativeBuffer(token);
    await sendChainRef.current;

    if (!flushFinal) {
      releaseSessionToken(token);
      transition({ kind: 'idle' });
      return;
    }

    try {
      const finalTexts = await window.api.voice.endSession(token);
      if (finalTexts.length > 0) {
        receivedSpeechRef.current = true;
        for (const text of finalTexts) insertTranscript(text);
      }
      if (!receivedSpeechRef.current) {
        setError('No speech detected \u2014 try again.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed.');
    } finally {
      transition({ kind: 'idle' });
    }
  };

  const stopRecording = () => abortDictation({ flushFinal: true });

  const ensureModelReady = async (): Promise<boolean> => {
    if (modelStatus === 'ready') return true;
    setError(null);
    setModelStatus('downloading');
    try {
      const status = await window.api.voice.downloadModel();
      setModelStatus(status);
      return status === 'ready';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Voice model download failed.');
      setModelStatus('error');
      return false;
    }
  };

  const releaseSessionToken = (token: string) => {
    void window.api.voice.endSession(token).catch(() => {});
  };

  const startRecording = async () => {
    if (startInFlightRef.current || phaseRef.current.kind !== 'idle') return;
    startInFlightRef.current = true;
    cancelStartRef.current = false;
    transition({ kind: 'starting' });
    setError(null);

    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    const token = crypto.randomUUID();
    try {
      if (!(await ensureModelReady())) {
        transition({ kind: 'idle' });
        return;
      }
      if (cancelStartRef.current) {
        transition({ kind: 'idle' });
        return;
      }
      await window.api.voice.startSession(token);

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelStartRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        releaseSessionToken(token);
        transition({ kind: 'idle' });
        return;
      }

      stream.getTracks().forEach((track) => {
        track.onended = () => {
          setError('Microphone disconnected.');
          void abandonRecording();
        };
      });

      context = new AudioContext();
      await context.audioWorklet.addModule(
        new URL('./voice-capture-processor.js', import.meta.url),
      );
      const source = context.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(context, 'voice-capture-processor');
      const monitor = context.createGain();
      monitor.gain.value = MONITOR_GAIN;

      nativeChunksRef.current = [];
      nativeBufferedSamplesRef.current = 0;
      flushThresholdRef.current = Math.round(context.sampleRate * CHUNK_FLUSH_INTERVAL_SECONDS);
      downsamplerRef.current = createStreamingDownsampler(context.sampleRate, TARGET_SAMPLE_RATE);
      sendChainRef.current = Promise.resolve();
      receivedSpeechRef.current = false;
      suppressInsertRef.current = false;

      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
        nativeChunksRef.current.push(event.data);
        nativeBufferedSamplesRef.current += event.data.length;
        if (nativeBufferedSamplesRef.current >= flushThresholdRef.current) {
          flushNativeBuffer(token);
        }
      };

      source.connect(worklet);
      worklet.connect(monitor);
      monitor.connect(context.destination);

      streamRef.current = stream;
      audioContextRef.current = context;
      sourceRef.current = source;
      workletRef.current = worklet;

      if (cancelStartRef.current) {
        teardownAudioGraph();
        audioContextRef.current = null;
        releaseSessionToken(token);
        transition({ kind: 'idle' });
        return;
      }
      transition({ kind: 'recording', token });
    } catch (e) {
      // Anything failing after getUserMedia() must not leave the mic hot —
      // stop tracks/close the context here rather than only surfacing an error.
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
      releaseSessionToken(token);
      setError(e instanceof Error ? e.message : 'Microphone access failed.');
      transition({ kind: 'idle' });
    } finally {
      startInFlightRef.current = false;
    }
  };

  useEffect(
    () => () => {
      void abandonRecording();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const abandonRecording = (): Promise<void> => {
    if (phaseRef.current.kind === 'starting') {
      cancelStartRef.current = true;
      return Promise.resolve();
    }
    if (phaseRef.current.kind === 'stopping') {
      suppressInsertRef.current = true;
      return Promise.resolve();
    }
    return abortDictation({ flushFinal: false });
  };

  return {
    recording: phase.kind === 'recording',
    starting: phase.kind === 'starting',
    transcribing: phase.kind === 'stopping',
    modelStatus,
    downloadProgress,
    error,
    startRecording,
    stopRecording,
    abandonRecording,
  };
}
