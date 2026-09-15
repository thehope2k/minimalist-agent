export interface TranscriptCandidate {
  path: string;
  mtimeMs: number;
}

/** Select the recorded transcript, or the newest one only when no id was persisted. */
export function selectTranscriptFile(
  candidates: readonly TranscriptCandidate[],
  runtimeSessionId?: string,
): string | undefined {
  if (runtimeSessionId) {
    return candidates.find((candidate) => candidate.path.endsWith(`_${runtimeSessionId}.jsonl`))
      ?.path;
  }
  return [...candidates].sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.path;
}
