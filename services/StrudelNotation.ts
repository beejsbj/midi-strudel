/**
 * StrudelNotation — public entry point.
 *
 * Implementation is split across focused modules under services/notation/:
 *   NotationUtils   — pure helpers (math, formatting, isRest, etc.)
 *   GridBuilder     — LCM/GCD grid construction and subdivision rendering
 *   DrumRenderer    — drum track → Strudel notation
 *   MelodicRenderer — melody + harmony voice splitting and rendering
 */

import { ConversionDiagnostic, Note, StrudelConfig, Track } from '../types';
import { DRUM_MAP, getAutoSound } from '../constants';
import { prepareEffectiveTracks, type EffectiveEvent } from './notation/EffectiveEvents';
import { renderPreciseLiteral } from './notation/LiteralRenderer';
import { splitMelodyHarmony } from './notation/MelodicRenderer';
import {
  buildVisualSuffix,
  formatTrackName,
  gcd,
  getCycleDuration,
  getMeasureDuration,
  getRelativeDegree,
} from './notation/NotationUtils';

export class StrudelNotation {
  private config: StrudelConfig;

  constructor(config: StrudelConfig) {
    this.config = config;
  }

  public generate(tracks: Track[]): string {
    return this.generateWithDiagnostics(tracks).code;
  }

  public generateWithDiagnostics(tracks: Track[]): {
    code: string;
    diagnostics: ConversionDiagnostic[];
    sharedSpanSeconds: number;
  } {
    const droppedNoteCounts = new Map<number, number>();
    tracks.forEach((track) => {
      if (!track.isDrum || track.hidden) return;
      track.notes.forEach((note) => {
        if (!DRUM_MAP[note.midi]) {
          droppedNoteCounts.set(note.midi, (droppedNoteCounts.get(note.midi) ?? 0) + 1);
        }
      });
    });
    const diagnostics = [...droppedNoteCounts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([midiNote, count]): ConversionDiagnostic => ({
        code: 'unmapped-drum-note',
        severity: 'warning',
        midiNote,
        count,
        message: `Dropped ${count} unmapped drum note event${count === 1 ? '' : 's'} for MIDI ${midiNote}`,
      }));

    const effectiveTracks = prepareEffectiveTracks(tracks, this.config).map(({ track, events }) => ({
      track,
      events: track.isDrum ? events.filter((event) => DRUM_MAP[event.midi]) : events,
    }));

    // 1. Calculate Global Song Duration
    let maxDuration = effectiveTracks.reduce((max, entry) => {
      const trackMax = entry.events.reduce((m, event) => Math.max(m, event.releaseSeconds), 0);
      return Math.max(max, trackMax);
    }, 0);

    const barDur = getMeasureDuration(this.config);
    if (maxDuration === 0) maxDuration = barDur;
    // A single song-origin meter grid is shared even by hidden tracks. Do not
    // let a delayed voice establish a private measure origin or private loop.
    maxDuration = Math.ceil((maxDuration - Number.EPSILON) / barDur) * barDur;

    // 2. Generate CPS setup
    const cpsFormula = this.getCpsFormula();

    const timeSig = `${this.config.timeSignature.numerator}/${this.config.timeSignature.denominator}`;
    const title = this.config.fileName ?? 'MIDI Conversion';
    let output = [
      `// @title ${title}`,
      `// @by midi-strudel`,
      `// @details BPM: ${this.config.sourceBpm} | Time: ${timeSig}`,
      ``,
      `const BPM = ${this.config.bpm};`,
      `setcps(${cpsFormula});`,
      ``,
      ``,
    ].join('\n');

    const literalFallbackTracks: string[] = [];
    effectiveTracks.forEach(({ track, events }) => {
      if (track.hidden) return;
      if (!events.length) return;

      // The literal boundary is intentionally used here while structured
      // notation is still incomplete. It represents all attacks/gates without
      // the old subdivision whitelist or configured display-decimal loss.
      output += this.renderLiteralTrack(track, events, maxDuration);
      if (this.config.timingStyle === 'relativeDivision') literalFallbackTracks.push(track.name);
      output += '\n';
    });

    if (literalFallbackTracks.length > 0) {
      diagnostics.push({
        code: 'precise-literal-fallback',
        severity: 'warning',
        count: literalFallbackTracks.length,
        message: `Used precise literal timing for ${literalFallbackTracks.length} track${literalFallbackTracks.length === 1 ? '' : 's'} because exact subdivision formatting is unavailable`,
      });
    }

    return { code: output, diagnostics, sharedSpanSeconds: maxDuration };
  }

  private renderLiteralTrack(track: Track, events: EffectiveEvent[], sharedSpanSeconds: number): string {
    const cycleDurationSeconds = getCycleDuration(this.config);
    const sound = track.sound
      ?? (this.config.useAutoMapping ? getAutoSound(track) : undefined)
      ?? this.config.globalSound;
    const visualSuffix = buildVisualSuffix(this.config, track);
    const span = { durationSeconds: sharedSpanSeconds, cycleDurationSeconds };
    const makePattern = (eventsForPattern: EffectiveEvent[], name: string): string => {
      const values = eventsForPattern.map((event) => ({
        id: event.id,
        value: track.isDrum
          ? DRUM_MAP[event.midi]
          : (this.config.notationType === 'relative' && (this.config.key || this.config.playbackKey)
            ? getRelativeDegree({
              note: event.note,
              midi: event.midi,
              noteOn: event.onsetSeconds,
              noteOff: event.releaseSeconds,
              velocity: event.velocity,
            }, this.config)
            : event.note),
        onsetSeconds: event.onsetSeconds,
        releaseSeconds: event.releaseSeconds,
        velocity: event.velocity,
      }));
      const control = track.isDrum ? 's' : this.config.notationType === 'relative' ? 'n' : 'note';
      const literal = renderPreciseLiteral(values, span, { control, includeVelocity: this.config.includeVelocity });
      const bank = track.isDrum ? `\n  .bank(${JSON.stringify(track.drumBank || 'RolandTR909')})` : '';
      const scale = !track.isDrum && this.config.notationType === 'relative' && (this.config.key || this.config.playbackKey)
        ? `\n  .scale(${JSON.stringify(`${(this.config.playbackKey || this.config.key!).root}${(this.config.playbackKey || this.config.key!).averageOctave}:${(this.config.playbackKey || this.config.key!).type}`)})`
        : '';
      const soundSuffix = track.isDrum ? '' : `\n  .sound(${JSON.stringify(sound)})`;
      return `$${name}: ${literal}${scale}${soundSuffix}${bank}${visualSuffix};\n\n`;
    };

    if (track.isDrum) return makePattern(events, formatTrackName(track.name));

    const notes: Note[] = events.map((event) => ({
      note: event.note,
      midi: event.midi,
      noteOn: event.onsetSeconds,
      noteOff: event.releaseSeconds,
      velocity: event.velocity,
      source: event.source,
    }));
    const { melody, harmony } = splitMelodyHarmony(notes);
    const eventsByNote = new Map(notes.map((note, index) => [note, events[index]]));
    const toEvents = (partition: typeof notes): EffectiveEvent[] => partition.map((note) => eventsByNote.get(note)!);
    let result = '';
    if (melody.length) result += makePattern(toEvents(melody), `${formatTrackName(track.name)}_MELODY`);
    if (harmony.length) result += makePattern(toEvents(harmony), `${formatTrackName(track.name)}_HARMONY`);
    return result;
  }

  private getCpsFormula(): string {
    const numerator = this.config.timeSignature.numerator || 4;
    const denominator = this.config.timeSignature.denominator || 4;
    const quarterNotesPerCycle =
      this.config.cycleUnit === 'bar' ? numerator * 4 : 4;
    const commonFactor = gcd(denominator, quarterNotesPerCycle);
    const scaledNumerator = denominator / commonFactor;
    const scaledDenominator = quarterNotesPerCycle / commonFactor;

    if (scaledNumerator === 1 && scaledDenominator === 1) {
      return 'BPM / 60';
    }
    if (scaledNumerator === 1) {
      return `BPM / 60 / ${scaledDenominator}`;
    }
    if (scaledDenominator === 1) {
      return `BPM / 60 * ${scaledNumerator}`;
    }
    return `BPM / 60 * ${scaledNumerator} / ${scaledDenominator}`;
  }
}
