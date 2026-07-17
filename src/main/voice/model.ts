import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { app } from 'electron';
import { extract as extractTar } from 'tar';
import bunzip2 from 'unbzip2-stream';
import { createLogger } from '../logger';

const log = createLogger('voice-model');

const MOONSHINE_MODEL_NAME = 'sherpa-onnx-moonshine-tiny-en-int8';
const MOONSHINE_DOWNLOAD_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${MOONSHINE_MODEL_NAME}.tar.bz2`;
// Computed by us from the official release asset (upstream publishes no
// checksum file) \u2014 guards against a truncated/corrupted download passing
// the file-existence check below.
const MOONSHINE_SHA256 = 'd5fe6ec4334fef36255b2a4010412cad4c007e33103fec62fb5d17cad88086f2';

const MOONSHINE_REQUIRED_FILES = [
  'preprocess.onnx',
  'encode.int8.onnx',
  'uncached_decode.int8.onnx',
  'cached_decode.int8.onnx',
  'tokens.txt',
] as const;

const VAD_MODEL_FILENAME = 'silero_vad.onnx';
const VAD_DOWNLOAD_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${VAD_MODEL_FILENAME}`;
const VAD_SHA256 = '9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6';

export type ModelDownloadProgress = {
  downloadedBytes: number;
  totalBytes: number | null;
};

export type MoonshineModelPaths = {
  preprocessor: string;
  encoder: string;
  uncachedDecoder: string;
  cachedDecoder: string;
  tokens: string;
};

function voiceModelsDir(): string {
  return join(app.getPath('userData'), 'voice-models');
}

function moonshineDir(): string {
  return join(voiceModelsDir(), MOONSHINE_MODEL_NAME);
}

function vadModelPath(): string {
  return join(voiceModelsDir(), VAD_MODEL_FILENAME);
}

export function isMoonshineModelReady(): boolean {
  const dir = moonshineDir();
  return MOONSHINE_REQUIRED_FILES.every((file) => existsSync(join(dir, file)));
}

export function isVadModelReady(): boolean {
  return existsSync(vadModelPath());
}

export function isVoiceModelReady(): boolean {
  return isMoonshineModelReady() && isVadModelReady();
}

export function getMoonshineModelPaths(): MoonshineModelPaths {
  const dir = moonshineDir();
  return {
    preprocessor: join(dir, 'preprocess.onnx'),
    encoder: join(dir, 'encode.int8.onnx'),
    uncachedDecoder: join(dir, 'uncached_decode.int8.onnx'),
    cachedDecoder: join(dir, 'cached_decode.int8.onnx'),
    tokens: join(dir, 'tokens.txt'),
  };
}

export function getVadModelPath(): string {
  return vadModelPath();
}

async function fetchOrThrow(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Voice model download failed: HTTP ${response.status} (${url})`);
  }
  return response;
}

/**
 * Wraps a fetch response body in a Readable that tracks download progress
 * and a running SHA-256 digest as bytes flow through \u2014 shared by both the
 * archive (Moonshine) and single-file (VAD) download paths below so the
 * progress/integrity logic isn't duplicated per model.
 */
function trackDownload(
  response: Response,
  onProgress?: (progress: ModelDownloadProgress) => void,
): { stream: Readable; digest: () => string } {
  const totalBytes = Number(response.headers.get('content-length')) || null;
  let downloadedBytes = 0;
  const hash = createHash('sha256');

  const stream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  stream.on('data', (chunk: Buffer) => {
    downloadedBytes += chunk.length;
    hash.update(chunk);
    onProgress?.({ downloadedBytes, totalBytes });
  });

  return { stream, digest: () => hash.digest('hex') };
}

async function downloadMoonshineModel(
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<void> {
  if (isMoonshineModelReady()) return;

  const dir = moonshineDir();
  mkdirSync(dir, { recursive: true });

  try {
    log.info('Downloading Moonshine model', { url: MOONSHINE_DOWNLOAD_URL });
    const response = await fetchOrThrow(MOONSHINE_DOWNLOAD_URL);
    const { stream, digest } = trackDownload(response, onProgress);

    // The archive extracts into a top-level folder matching MOONSHINE_MODEL_NAME;
    // strip: 1 flattens that so files land directly in dir.
    await pipeline(stream, bunzip2(), extractTar({ cwd: dir, strip: 1 }));

    if (digest() !== MOONSHINE_SHA256) {
      throw new Error('Voice model download failed integrity check (checksum mismatch). Please try again.');
    }
    if (!isMoonshineModelReady()) {
      throw new Error('Voice model download completed but expected files are missing.');
    }
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  log.info('Moonshine model ready', { dir });
}

async function downloadVadModel(
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<void> {
  if (isVadModelReady()) return;

  mkdirSync(voiceModelsDir(), { recursive: true });
  const destPath = vadModelPath();

  try {
    log.info('Downloading VAD model', { url: VAD_DOWNLOAD_URL });
    const response = await fetchOrThrow(VAD_DOWNLOAD_URL);
    const { stream, digest } = trackDownload(response, onProgress);

    await pipeline(stream, createWriteStream(destPath));

    if (digest() !== VAD_SHA256) {
      throw new Error('Voice activity detector download failed integrity check (checksum mismatch). Please try again.');
    }
  } catch (error) {
    rmSync(destPath, { force: true });
    throw error;
  }
  log.info('VAD model ready', { destPath });
}

export async function downloadVoiceModels(
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<void> {
  await downloadMoonshineModel(onProgress);
  await downloadVadModel(onProgress);
}
