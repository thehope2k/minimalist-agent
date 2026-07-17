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

export function useVoiceDictation(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (text: string) => void,
) {
  const [modelStatus, setModelStatus] = useState<VoiceModelStatus>('unknown');
  const [downloadProgress, setDownloadProgress] = useState<VoiceDownloadProgress | null>(null);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Mirrors `recording` state so start/stop guards never act on a stale
  // closure captured by a caller (e.g. a keyboard-shortcut effect) that
  // hasn't re-subscribed since the last render.
  const recordingRef = useRef(false);
  recordingRef.current = recording;
  // Guards against a fast double-click starting two overlapping
  // ensureModelReady()/getUserMedia() calls before React commits the
  // 'downloading'/recording state.
  const startInFlightRef = useRef(false);

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

  const enqueueChunk = (chunk: Float32Array) => {
    sendChainRef.current = sendChainRef.current
      .then(() => window.api.voice.pushChunk(chunk))
      .then((texts) => {
        if (texts.length === 0) return;
        receivedSpeechRef.current = true;
        for (const text of texts) insertTranscript(text);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Transcription failed.');
      });
  };

  const flushNativeBuffer = () => {
    const chunks = nativeChunksRef.current;
    nativeChunksRef.current = [];
    nativeBufferedSamplesRef.current = 0;
    if (chunks.length === 0 || !downsamplerRef.current) return;

    const resampled = downsamplerRef.current.push(concatFloat32(chunks));
    if (resampled.length > 0) enqueueChunk(resampled);
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

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    teardownAudioGraph();
    audioContextRef.current = null;
    setRecording(false);

    flushNativeBuffer();
    await sendChainRef.current;

    setTranscribing(true);
    try {
      const finalTexts = await window.api.voice.endSession();
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
      setTranscribing(false);
    }
  };

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

  const startRecording = async () => {
    if (startInFlightRef.current || recordingRef.current) return;
    startInFlightRef.current = true;
    setStarting(true);
    setError(null);

    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    try {
      if (!(await ensureModelReady())) return;
      await window.api.voice.startSession();

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
        nativeChunksRef.current.push(event.data);
        nativeBufferedSamplesRef.current += event.data.length;
        if (nativeBufferedSamplesRef.current >= flushThresholdRef.current) {
          flushNativeBuffer();
        }
      };

      source.connect(worklet);
      worklet.connect(monitor);
      monitor.connect(context.destination);

      streamRef.current = stream;
      audioContextRef.current = context;
      sourceRef.current = source;
      workletRef.current = worklet;
      setRecording(true);
    } catch (e) {
      // Anything failing after getUserMedia() must not leave the mic hot —
      // stop tracks/close the context here rather than only surfacing an error.
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
      setError(e instanceof Error ? e.message : 'Microphone access failed.');
    } finally {
      startInFlightRef.current = false;
      setStarting(false);
    }
  };

  useEffect(() => () => teardownAudioGraph(), []);

  return {
    recording,
    starting,
    transcribing,
    modelStatus,
    downloadProgress,
    error,
    startRecording,
    stopRecording,
  };
}
