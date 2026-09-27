/**
 * Independent ear rule, in seconds: a start or end within 10 ms (and an eighth
 * of the step) of the simplest quarter-note division is heard on it. A note
 * exactly on a quintuplet or septuplet (within tick rounding) stays.
 */
export const earSnap = (seconds: number, bpm: number, ppq: number): number => {
  const tick = 60 / bpm / ppq;
  for (const division of [1, 2, 3, 4, 5, 6, 7, 8, 12, 16]) {
    const step = 60 / bpm / division;
    const grid = Math.round(seconds / step) * step;
    if (division === 5 || division === 7) {
      if (Math.abs(grid - seconds) <= tick / 2 + 1e-9) return seconds;
    } else if (Math.abs(grid - seconds) <= Math.min(0.010, step / 8) + 1e-9) return grid;
  }
  return seconds;
};

interface SourceNote { midi: number; name: string; velocity: number; time: number; duration: number }

/**
 * Source notes as heard: starts and ends snapped, never silenced or reversed.
 * Copies fields explicitly because tonejs notes expose them as getters.
 */
export const earNotes = (notes: SourceNote[], bpm: number, ppq: number): SourceNote[] =>
  notes.map((note) => {
    const time = earSnap(note.time, bpm, ppq);
    let end = earSnap(note.time + note.duration, bpm, ppq);
    if (end <= time && note.duration > 0) end = time + note.duration;
    if (note.duration <= 0) end = time;
    return { midi: note.midi, name: note.name, velocity: note.velocity, time, duration: end - time };
  });
