import { Note, Track, StrudelConfig } from '../../types';

export function buildVisualSuffix(config: StrudelConfig, track?: Track): string {
  const parts: string[] = [];
  const trackHue = track?.color;
  const scope = config.visualScope;

  // 1. .color() FIRST — visual methods must see it to render correctly
  if (config.isTrackColoringEnabled && trackHue) {
    parts.push(`  .color('hsl(${trackHue},60%,60%)')`);
  }

  // 2. Visual method(s) — per-track single override takes precedence over global array
  if (track?.trackVisualMethod !== undefined) {
    // Per-track single-select override
    if (track.trackVisualMethod !== 'none') {
      const fn = scope === 'inline' ? `_${track.trackVisualMethod}` : track.trackVisualMethod;
      parts.push(`  .${fn}()`);
    }
  } else {
    // Global multi-select array
    for (const method of config.visualMethods) {
      const fn = scope === 'inline' ? `_${method}` : method;
      parts.push(`  .${fn}()`);
    }
  }

  return parts.length ? '\n' + parts.join('\n') : '';
}

// Scale constants
export const PITCH_MAP: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5,
  'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};

export const SCALES: Record<'major' | 'minor', number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10]
};

export function gcd(a: number, b: number): number {
  return !b ? a : gcd(b, a % b);
}

/**
 * Round BPM to at most 3 decimals, stripping trailing zeros.
 * E.g. 135.000135000135 → "135", 123.45602804920958 → "123.456"
 */
export function formatBpm(bpm: number): string {
  // Number→string never keeps trailing zeros; do not strip integer zeros (120).
  return String(Math.round(bpm * 1000) / 1000);
}

/**
 * The BPM written into `const BPM`, which drives playback. Keeps the short
 * display value (`125`) while a loop of `spanSeconds` drifts by no more than
 * `toleranceSeconds` at its end; otherwise adds digits until it does.
 */
export function formatPlaybackBpm(bpm: number, spanSeconds: number, toleranceSeconds = 0.001): string {
  const drift = (text: string) => spanSeconds * Math.abs(Number(text) - bpm) / bpm;
  const short = formatBpm(bpm);
  if (drift(short) <= toleranceSeconds * 0.99) return short;
  for (let decimals = 4; decimals <= 15; decimals += 1) {
    const text = String(Number(bpm.toFixed(decimals)));
    if (drift(text) <= toleranceSeconds * 0.99) return text;
  }
  return String(bpm);
}

export function getMeterBeatDuration(config: StrudelConfig): number {
  const denominator = config.timeSignature.denominator || 4;
  const quarterNoteDuration = 60 / config.sourceBpm;
  return quarterNoteDuration * (4 / denominator);
}

export function getMeasureDuration(config: StrudelConfig): number {
  const numerator = config.timeSignature.numerator || 4;
  return getMeterBeatDuration(config) * numerator;
}

/** Source-meter duration for song-span rounding, independent of playback UI. */
export function getSourceMeasureDuration(config: StrudelConfig): number {
  const sourceMeter = config.sourceTimeSignature ?? config.timeSignature;
  const denominator = sourceMeter.denominator || 4;
  const quarterNoteDuration = 60 / config.sourceBpm;
  return quarterNoteDuration * (4 / denominator) * (sourceMeter.numerator || 4);
}

/** One Strudel cycle is always one bar. */
export function getCycleDuration(config: StrudelConfig): number {
  return getMeasureDuration(config);
}

export function formatTrackName(name: string): string {
  return name.toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_/, '')
    .replace(/_$/, '');
}

export function getRelativeDegree(note: Note, config: StrudelConfig): string | number {
  if (!config.key) return (note.midi - 60);

  const { root, averageOctave, type } = config.key;
  const rootIndex = PITCH_MAP[root];

  if (rootIndex === undefined) return (note.midi - 60);

  const rootMidi = rootIndex + (averageOctave + 1) * 12;
  const diff = note.midi - rootMidi;
  const octaveShift = Math.floor(diff / 12);
  const semitone = (diff % 12 + 12) % 12;

  const intervals = SCALES[type];

  const candidates = [
    ...intervals.map((val, i) => ({ val: val - 12, deg: i - 7 })),
    ...intervals.map((val, i) => ({ val: val, deg: i })),
    ...intervals.map((val, i) => ({ val: val + 12, deg: i + 7 }))
  ];

  let best = candidates[0];
  let minDelta = Math.abs(semitone - best.val);
  let ties = [best];

  for (let i = 1; i < candidates.length; i++) {
    const d = Math.abs(semitone - candidates[i].val);
    if (d < minDelta) {
      minDelta = d;
      best = candidates[i];
      ties = [best];
    } else if (d === minDelta) {
      ties.push(candidates[i]);
    }
  }

  let selected = ties[0];
  if (ties.length > 1) {
    const preferFlat = root.includes('b') || root === 'F' || (type === 'minor' && ['C', 'F', 'G', 'D'].includes(root));

    if (preferFlat) {
      const c = ties.find(x => x.val > semitone);
      if (c) selected = c;
    } else {
      const c = ties.find(x => x.val < semitone);
      if (c) selected = c;
    }
  }

  const delta = semitone - selected.val;
  const degree = selected.deg + (octaveShift * 7);

  if (delta === 0) return degree;

  const sign = delta > 0 ? "#" : "b";
  return `${degree}${sign.repeat(Math.abs(delta))}`;
}

