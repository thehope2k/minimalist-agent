export function concatFloat32(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export type StreamingDownsampler = {
  /** Filters + resamples one chunk, continuing from where the previous chunk left off. */
  push(input: Float32Array): Float32Array;
};

/**
 * One-pole IIR low-pass (anti-alias) + linear-interpolation decimation,
 * both stateful across calls. Needed because audio now streams in small
 * chunks continuously during recording rather than arriving as one buffer
 * at the end \u2014 resetting filter/interpolation state at every chunk boundary
 * would produce an audible click every ~200ms and corrupt the resample
 * timeline (the ratio rarely divides a chunk evenly).
 */
export function createStreamingDownsampler(
  fromRate: number,
  toRate: number,
): StreamingDownsampler {
  if (fromRate === toRate) {
    return { push: (input) => input };
  }

  const resampleRatio = fromRate / toRate;
  const targetNyquistHz = toRate / 2;
  const filterTimeConstant = 1 / (2 * Math.PI * targetNyquistHz);
  const sampleInterval = 1 / fromRate;
  const filterAlpha = sampleInterval / (filterTimeConstant + sampleInterval);

  let filterState = 0;
  let filterInitialized = false;
  let previousChunkTail = 0;
  let nextSourcePosition = 0;

  function applyLowPass(input: Float32Array): Float32Array {
    const filtered = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      if (!filterInitialized) {
        filterState = input[i];
        filterInitialized = true;
      } else {
        filterState += filterAlpha * (input[i] - filterState);
      }
      filtered[i] = filterState;
    }
    return filtered;
  }

  function sampleAt(filtered: Float32Array, index: number): number {
    if (index < 0) return previousChunkTail;
    return filtered[index];
  }

  function decimate(filtered: Float32Array): Float32Array {
    const output: number[] = [];
    while (true) {
      const lowerIndex = Math.floor(nextSourcePosition);
      const upperIndex = lowerIndex + 1;
      if (upperIndex > filtered.length - 1) break;

      const weight = nextSourcePosition - lowerIndex;
      const lowerValue = sampleAt(filtered, lowerIndex);
      const upperValue = sampleAt(filtered, upperIndex);
      output.push(lowerValue * (1 - weight) + upperValue * weight);
      nextSourcePosition += resampleRatio;
    }

    nextSourcePosition -= filtered.length;
    if (filtered.length > 0) {
      previousChunkTail = filtered[filtered.length - 1];
    }
    return Float32Array.from(output);
  }

  return {
    push(input: Float32Array): Float32Array {
      return decimate(applyLowPass(input));
    },
  };
}
