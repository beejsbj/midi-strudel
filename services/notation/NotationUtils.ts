import { Note, StrudelConfig } from '../../types';

export function resolveMarkcss(config: StrudelConfig, hue?: string): string {
  if (config.markcssPreset === 'none' && config.isTrackColoringEnabled && hue) {
    return `background:hsla(${hue},60%,45%,0.75);border-radius:2px`;
  }
  switch (config.markcssPreset) {
    case 'track-color':      return hue ? `background:hsla(${hue},60%,45%,0.75);border-radius:2px` : '';
    case 'pitch-rainbow':    return `background:hsl(calc(var(--note-value,60)*2.8deg),70%,50%,0.8)`;
    case 'velocity-glow':    return `box-shadow:0 0 calc(var(--velocity,0.7)*12px) hsl(calc(var(--note-value,180)*2.8deg),80%,60%,0.6)`;
    case 'progressive-fill': return `animation:strudel-fill calc(var(--duration,0.5)*1s) linear forwards`;
    default:                 return '';
  }
}

export function buildVisualSuffix(config: StrudelConfig, trackHue?: string): string {
  const parts: string[] = [];
  if (config.visualMethod !== 'none') {
    const fn = config.visualScope === 'inline' ? `_${config.visualMethod}` : config.visualMethod;
    parts.push(`  .${fn}()`);
  }
  const css = resolveMarkcss(config, trackHue);
  if (css) parts.push(`  .markcss(\`${css}\`)`);
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

// Helper for rounding
export const round = (num: number, precision: number): number => {
  const factor = Math.pow(10, precision);
  return Math.round(num * factor) / factor;
};

export function gcd(a: number, b: number): number {
  return !b ? a : gcd(b, a % b);
}

export function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return (a * b) / gcd(a, b);
}

/**
 * Returns true if the given Strudel token represents a rest.
 * Valid rest patterns: ~, ~@0.5, [~], [~]@0.5
 */
export function isRest(token: string): boolean {
  const t = token.trim();
  return /^~(@[\d.]+)?$/.test(t) || /^\[~\](@[\d.]+)?$/.test(t);
}

export function getRestDuration(token: string): number {
  const parts = token.split('@');
  if (parts.length === 2) return parseFloat(parts[1]);
  return 1;
}

export function getCycleDuration(config: StrudelConfig): number {
  const beatDur = 60 / config.sourceBpm;
  if (config.cycleUnit === 'beat') return beatDur;
  return beatDur * (config.timeSignature.numerator || 4);
}

/** Creates a rest token from a duration in seconds */
export function createRestToken(durationSeconds: number, cycleDur: number, config: StrudelConfig): string {
  const cycles = durationSeconds / cycleDur;
  return createRestTokenCycles(cycles, config);
}

/** Creates a rest token from a duration in cycles */
export function createRestTokenCycles(cycles: number, config: StrudelConfig): string {
  const r = round(cycles, config.durationPrecision);
  const suffix = Math.abs(r - 1) < 1e-6 ? "" : `@${r}`;

  if (config.timingStyle === 'relativeDivision') {
    return `[~]${suffix}`;
  }
  return `~${suffix}`;
}

export function formatTrackName(name: string): string {
  return name.toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_/, '')
    .replace(/_$/, '');
}

export function getAsString(isDrum: boolean, config: StrudelConfig): string {
  if (isDrum) return "s";
  let s = config.notationType === 'absolute' ? "note" : "n";
  if (config.includeVelocity) s += ":velocity";
  return s;
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

export function formatNoteVal(
  note: Note,
  cycleDur: number,
  isDrum: boolean,
  config: StrudelConfig,
  drumMap: Record<number, string>,
  durOverride?: number
): string {
  let val: string | number = "";

  if (isDrum) {
    val = drumMap[note.midi] || "?";
  } else if (config.notationType === 'relative' && (config.key || config.playbackKey)) {
    val = getRelativeDegree(note, config);
  } else {
    val = config.notationType === 'absolute' ? note.note : (note.midi - 60).toString();
  }

  let suffix = "";
  if (config.includeVelocity) {
    suffix += `:${round(note.velocity, 2)}`;
  }

  if (config.timingStyle === 'absoluteDuration') {
    const d = durOverride !== undefined ? durOverride : (note.noteOff - note.noteOn);
    const cycles = d / cycleDur;
    if (Math.abs(cycles - 1) < 0.001) return `${val}${suffix}`;
    return `${val}${suffix}@${round(cycles, config.durationPrecision)}`;
  } else {
    return `${val}${suffix}`;
  }
}

export function prepareNotes(rawNotes: Note[], config: StrudelConfig): Note[] {
  let notes = [...rawNotes].sort((a, b) => a.noteOn - b.noteOn);

  if (config.isQuantized) {
    const beatDuration = 60 / config.sourceBpm;
    const gridUnit = beatDuration / 4;
    const strength = config.quantizationStrength / 100;

    notes = notes.map(n => {
      const nearestOn = Math.round(n.noteOn / gridUnit) * gridUnit;
      const diffOn = nearestOn - n.noteOn;
      let newOn = n.noteOn;

      if (Math.abs(diffOn) * 1000 <= config.quantizationThreshold) {
        newOn = n.noteOn + (diffOn * strength);
      }

      const dur = n.noteOff - n.noteOn;
      const nearestDur = Math.round(dur / gridUnit) * gridUnit;
      const diffDur = nearestDur - dur;
      let newDur = dur;

      if (Math.abs(diffDur) * 1000 <= config.quantizationThreshold) {
        newDur = dur + (diffDur * strength);
      }

      if (newDur < gridUnit * 0.1) newDur = gridUnit;

      return { ...n, noteOn: newOn, noteOff: newOn + newDur };
    });
  }

  return notes;
}
