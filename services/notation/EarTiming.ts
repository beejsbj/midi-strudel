import type { Note, Track } from '../../types';
import { assessSourceTimingEligibility } from './SourceEligibility';

/**
 * Faithful means exact to the ear, not to the tick: a start or end this close
 * to a beat subdivision is heard on it. Played MIDI keeps 1–8 tick jitter
 * (1–10 ms) that would otherwise surface as weights like `@193` and lengths
 * like `1.005`; anything further from the grid stays exactly as played.
 */
export const EAR_TOLERANCE_SECONDS = 0.010;

/**
 * Quarter-note divisions, simplest first. Quintuplets and septuplets only hold a
 * note already on them (within tick rounding) so it cannot drift to a finer
 * grid; they never pull a played note in.
 */
const BEAT_DIVISIONS = [1, 2, 3, 4, 5, 6, 7, 8, 12, 16];
const HOLD_ONLY = new Set([5, 7]);

export interface EarSnap {
  notes: Note[];
  moved: number;
  maxShiftSeconds: number;
}

/**
 * Snap each start and end, independently, to the simplest beat subdivision
 * within the ear tolerance. A division only claims positions within an eighth
 * of its own step, so fine grids cannot swallow the whole beat. Works in source
 * ticks so every later stage sees one consistent, integer-tick MIDI. Tracks
 * without single-tempo tick timing are returned unchanged.
 */
export function snapToEar(track: Track, sourceBpm: number): EarSnap {
  const notes = [...track.notes].sort((a, b) => a.noteOn - b.noteOn);
  const unchanged = { notes, moved: 0, maxShiftSeconds: 0 };
  const ppq = track.sourceTiming?.ppq;
  if (!ppq || !Number.isInteger(ppq) || notes.some((note) => !note.source)) return unchanged;
  if (assessSourceTimingEligibility(track, []).fallbackReasons.includes('source-tempo-changes')) return unchanged;
  const secondsPerTick = 60 / sourceBpm / ppq;
  const earTicks = EAR_TOLERANCE_SECONDS / secondsPerTick;
  const snap = (ticks: number) => {
    for (const division of BEAT_DIVISIONS) {
      const step = ppq / division;
      const grid = Math.round(ticks / step) * step;
      if (HOLD_ONLY.has(division)) {
        if (Math.abs(grid - ticks) <= 0.5) return ticks;
      } else if (Math.abs(grid - ticks) <= Math.min(earTicks, step / 8)) {
        return grid;
      }
    }
    return ticks;
  };

  let moved = 0;
  let maxShiftTicks = 0;
  const snapped = notes.map((note) => {
    const source = note.source!;
    const release = source.ticks + source.durationTicks;
    const onset = snap(source.ticks);
    let end = snap(release);
    // Never let snapping silence or reverse a note: keep its played length.
    if (end <= onset && source.durationTicks > 0) end = onset + source.durationTicks;
    if (source.durationTicks <= 0) end = onset;
    if (onset === source.ticks && end === release) return note;
    moved++;
    maxShiftTicks = Math.max(maxShiftTicks, Math.abs(onset - source.ticks), Math.abs(end - release));
    return {
      ...note,
      noteOn: note.noteOn + (onset - source.ticks) * secondsPerTick,
      noteOff: note.noteOff + (end - release) * secondsPerTick,
      source: { ...source, ticks: onset, durationTicks: end - onset },
    };
  });
  return {
    notes: snapped.sort((a, b) => a.noteOn - b.noteOn),
    moved,
    maxShiftSeconds: maxShiftTicks * secondsPerTick,
  };
}
