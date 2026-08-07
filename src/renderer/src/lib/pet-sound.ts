export type PetSoundKind = 'click' | 'tool' | 'error' | 'happy';

interface ChirpLayer {
  /** Frequency ramp in Hz, applied as an exponential glide over the note's duration. */
  freqStartHz: number;
  freqEndHz: number;
  /** Detune in cents — layering two voices a few cents apart gives a fuller, less sterile tone. */
  detuneCents: number;
  waveform: OscillatorType;
  /** Relative level of this voice within the note (voices are mixed, not summed at full gain each). */
  gainMul: number;
}

interface ChirpNote {
  durationSec: number;
  layers: ChirpLayer[];
  /** Lowpass sweep from closed to open (or vice versa) — gives the note punch/character instead of a flat buzz. */
  filterStartHz: number;
  filterEndHz: number;
  filterQ: number;
  peakGain: number;
}

const PANDA_PROFILES: Record<PetSoundKind, ChirpNote[]> = {
  // Quick, snappy double-voice "boop" with a friendly downward wobble at the tail.
  click: [
    {
      durationSec: 0.14,
      layers: [
        { freqStartHz: 820, freqEndHz: 580, detuneCents: 0, waveform: 'triangle', gainMul: 1 },
        { freqStartHz: 826, freqEndHz: 586, detuneCents: 8, waveform: 'sine', gainMul: 0.5 },
      ],
      filterStartHz: 3200,
      filterEndHz: 1400,
      filterQ: 0.7,
      peakGain: 0.16,
    },
  ],
  // Curious little upward "hm?" — two quick rising blips.
  tool: [
    {
      durationSec: 0.08,
      layers: [
        { freqStartHz: 520, freqEndHz: 680, detuneCents: 0, waveform: 'sine', gainMul: 1 },
        { freqStartHz: 524, freqEndHz: 684, detuneCents: 6, waveform: 'triangle', gainMul: 0.35 },
      ],
      filterStartHz: 2600,
      filterEndHz: 2200,
      filterQ: 0.6,
      peakGain: 0.13,
    },
    {
      durationSec: 0.09,
      layers: [
        { freqStartHz: 640, freqEndHz: 820, detuneCents: 0, waveform: 'sine', gainMul: 1 },
        { freqStartHz: 645, freqEndHz: 826, detuneCents: 6, waveform: 'triangle', gainMul: 0.35 },
      ],
      filterStartHz: 2800,
      filterEndHz: 2400,
      filterQ: 0.6,
      peakGain: 0.13,
    },
  ],
  // Soft descending "uh-oh" — filtered and detuned so it reads as bummed-out, not harsh.
  error: [
    {
      durationSec: 0.22,
      layers: [
        { freqStartHz: 560, freqEndHz: 260, detuneCents: 0, waveform: 'triangle', gainMul: 1 },
        { freqStartHz: 564, freqEndHz: 262, detuneCents: -10, waveform: 'sine', gainMul: 0.55 },
      ],
      filterStartHz: 1800,
      filterEndHz: 500,
      filterQ: 0.5,
      peakGain: 0.14,
    },
  ],
  // Bright three-note bounce with a shimmer of detune — the "good job!" chime.
  happy: [
    {
      durationSec: 0.09,
      layers: [
        { freqStartHz: 620, freqEndHz: 700, detuneCents: 0, waveform: 'triangle', gainMul: 1 },
        { freqStartHz: 624, freqEndHz: 704, detuneCents: 7, waveform: 'sine', gainMul: 0.4 },
      ],
      filterStartHz: 3000,
      filterEndHz: 3000,
      filterQ: 0.6,
      peakGain: 0.13,
    },
    {
      durationSec: 0.09,
      layers: [
        { freqStartHz: 840, freqEndHz: 940, detuneCents: 0, waveform: 'triangle', gainMul: 1 },
        { freqStartHz: 846, freqEndHz: 946, detuneCents: 7, waveform: 'sine', gainMul: 0.4 },
      ],
      filterStartHz: 3200,
      filterEndHz: 3200,
      filterQ: 0.6,
      peakGain: 0.13,
    },
    {
      durationSec: 0.14,
      layers: [
        { freqStartHz: 1120, freqEndHz: 1320, detuneCents: 0, waveform: 'triangle', gainMul: 1 },
        { freqStartHz: 1128, freqEndHz: 1328, detuneCents: 9, waveform: 'sine', gainMul: 0.4 },
      ],
      filterStartHz: 3600,
      filterEndHz: 3600,
      filterQ: 0.7,
      peakGain: 0.14,
    },
  ],
};

/** Small per-play randomization so repeated triggers (esp. `tool`) don't sound identical every time. */
const PITCH_JITTER_RATIO = 0.03;

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  audioContext ??= new AudioContext();
  return audioContext;
}

function jitter(hz: number): number {
  const factor = 1 + (Math.random() * 2 - 1) * PITCH_JITTER_RATIO;
  return hz * factor;
}

function playLayer(
  ctx: AudioContext,
  destination: AudioNode,
  startTime: number,
  durationSec: number,
  layer: ChirpLayer,
  noteGain: number,
): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = layer.waveform;
  oscillator.detune.setValueAtTime(layer.detuneCents, startTime);
  oscillator.frequency.setValueAtTime(jitter(layer.freqStartHz), startTime);
  oscillator.frequency.exponentialRampToValueAtTime(jitter(layer.freqEndHz), startTime + durationSec);

  const peak = noteGain * layer.gainMul;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peak, startTime + durationSec * 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + durationSec);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}

function playNote(ctx: AudioContext, startTime: number, note: ChirpNote): void {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.setValueAtTime(note.filterQ, startTime);
  filter.frequency.setValueAtTime(note.filterStartHz, startTime);
  filter.frequency.linearRampToValueAtTime(note.filterEndHz, startTime + note.durationSec);
  filter.connect(ctx.destination);

  for (const layer of note.layers) {
    playLayer(ctx, filter, startTime, note.durationSec, layer, note.peakGain);
  }

  const cleanupDelayMs = note.durationSec * 1000 + 50;
  setTimeout(() => filter.disconnect(), cleanupDelayMs);
}

export function playPetSound(kind: PetSoundKind): void {
  try {
    const ctx = getAudioContext();
    void ctx.resume();

    let cursor = ctx.currentTime;
    for (const note of PANDA_PROFILES[kind]) {
      playNote(ctx, cursor, note);
      cursor += note.durationSec * 0.82;
    }
  } catch {
    /* ignore */
  }
}
