import type { Note, StrudelConfig, Track } from '../../types';
import { snapToEar } from './EarTiming';

/** A serializable rational value used for source-tick locations. */
export interface RationalTiming {
  numerator: number;
  denominator: number;
}

/**
 * The performance-time event consumed by renderers. Its `source` keeps the
 * parsed MIDI identity with ear-snapped ticks (see EarTiming).
 */
export interface EffectiveEvent {
  id: string;
  trackId: string;
  note: string;
  midi: number;
  velocity: number;
  onsetSeconds: number;
  releaseSeconds: number;
  source: Note['source'];
  sourceOnsetBeats?: RationalTiming;
  sourceDurationBeats?: RationalTiming;
}

export interface EffectiveTrack {
  track: Track;
  events: EffectiveEvent[];
  /** Notes whose start or end moved onto the beat grid, and the largest move. */
  snapped: { moved: number; maxShiftSeconds: number };
}

export const rationalFromTicks = (ticks: number, ppq: number): RationalTiming => ({
  numerator: ticks,
  denominator: ppq,
});

/**
 * Snaps timing to the ear and returns new event values, leaving parsed notes
 * untouched.
 */
export const prepareEffectiveTracks = (tracks: Track[], config: StrudelConfig): EffectiveTrack[] =>
  tracks.map((track) => {
    const { notes, moved, maxShiftSeconds } = snapToEar(track, config.sourceBpm);
    return { track, snapped: { moved, maxShiftSeconds }, events: notes.map((note, index) => ({
      id: note.source?.id ?? `${track.id}:effective-${index}`,
      trackId: track.id,
      note: note.note,
      midi: note.midi,
      velocity: note.velocity,
      onsetSeconds: note.noteOn,
      releaseSeconds: note.noteOff,
      source: note.source,
      sourceOnsetBeats: note.source && track.sourceTiming
        ? rationalFromTicks(note.source.ticks, track.sourceTiming.ppq)
        : undefined,
      sourceDurationBeats: note.source && track.sourceTiming
        ? rationalFromTicks(note.source.durationTicks, track.sourceTiming.ppq)
        : undefined,
    })) };
  });

/**
 * Fully identical doubles (same pitch, onset, release and velocity) sound as
 * one louder note and come from exports, not writing: every bundled Epic file
 * has them, none of ~1,300 professional phrase files do. Keep the first.
 * Doubles that differ in length or velocity are deliberate and stay.
 */
export const mergeIdenticalDoubles = (events: EffectiveEvent[], oneShot = false): { events: EffectiveEvent[]; merged: number } => {
  const seen = new Set<string>();
  const kept = events.filter((event) => {
    // A one-shot drum's length is not heard, so it does not distinguish a double.
    const key = `${event.midi}:${event.onsetSeconds}:${oneShot ? '' : event.releaseSeconds}:${event.velocity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { events: kept, merged: events.length - kept.length };
};

/**
 * Two drum notes that map to one sample at one instant (GM 35 and 36 are both
 * `bd`) play that sample twice: no new timbre, only a louder hit. Keep the
 * loudest.
 */
export const mergeSameSampleHits = (events: EffectiveEvent[], sampleOf: (midi: number) => string | undefined)
  : { events: EffectiveEvent[]; merged: number } => {
  const loudest = new Map<string, EffectiveEvent>();
  for (const event of events) {
    // Snapped ticks are exact; seconds can differ in the last bits.
    const key = `${sampleOf(event.midi) ?? event.midi}:${event.source ? `t${event.source.ticks}` : event.onsetSeconds}`;
    const kept = loudest.get(key);
    if (!kept || event.velocity > kept.velocity) loudest.set(key, event);
  }
  const kept = new Set(loudest.values());
  return { events: events.filter((event) => kept.has(event)), merged: events.length - kept.size };
};

export const effectiveEventsToNotes = (events: EffectiveEvent[]): Note[] => events.map((event) => ({
  note: event.note,
  midi: event.midi,
  velocity: event.velocity,
  noteOn: event.onsetSeconds,
  noteOff: event.releaseSeconds,
  source: event.source,
}));
