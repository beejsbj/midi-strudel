import type { Note, StrudelConfig, Track } from '../../types';
import { prepareNotes } from './NotationUtils';

/** A serializable rational value used for source-tick locations. */
export interface RationalTiming {
  numerator: number;
  denominator: number;
}

/**
 * The mutable, performance-time event consumed by renderers. Its `source`
 * remains an immutable reference to the parsed MIDI event when available.
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
}

export const rationalFromTicks = (ticks: number, ppq: number): RationalTiming => ({
  numerator: ticks,
  denominator: ppq,
});

/**
 * Applies only requested transformations. It deliberately returns new event
 * values, leaving parsed notes and their source identities untouched.
 */
export const prepareEffectiveTracks = (tracks: Track[], config: StrudelConfig): EffectiveTrack[] =>
  tracks.map((track) => ({
    track,
    events: prepareNotes(track.notes, config).map((note, index) => ({
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
    })),
  }));

/**
 * Fully identical doubles (same pitch, onset, release and velocity) sound as
 * one louder note and come from exports, not writing: every bundled Epic file
 * has them, none of ~1,300 professional phrase files do. Keep the first.
 * Doubles that differ in length or velocity are deliberate and stay.
 */
export const mergeIdenticalDoubles = (events: EffectiveEvent[]): { events: EffectiveEvent[]; merged: number } => {
  const seen = new Set<string>();
  const kept = events.filter((event) => {
    const key = `${event.midi}:${event.onsetSeconds}:${event.releaseSeconds}:${event.velocity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { events: kept, merged: events.length - kept.length };
};

export const effectiveEventsToNotes = (events: EffectiveEvent[]): Note[] => events.map((event) => ({
  note: event.note,
  midi: event.midi,
  velocity: event.velocity,
  noteOn: event.onsetSeconds,
  noteOff: event.releaseSeconds,
  source: event.source,
}));
