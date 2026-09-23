/**
 * StrudelNotation — public entry point.
 *
 * Implementation is split across focused modules under services/notation/:
 *   NotationUtils   — pure helpers (math, formatting, isRest, etc.)
 *   GridBuilder     — LCM/GCD grid construction and subdivision rendering
 *   DrumRenderer    — drum track → Strudel notation
 *   MelodicRenderer — melody + harmony voice splitting and rendering
 */

import { ConversionDiagnostic, PatternMetadata, StrudelConfig, Track } from '../types';
import { DRUM_MAP, getAutoSound } from '../constants';
import { effectiveEventsToNotes, prepareEffectiveTracks, type EffectiveEvent } from './notation/EffectiveEvents';
import { renderPreciseLiteral } from './notation/LiteralRenderer';
import { splitMelodyHarmony } from './notation/MelodicRenderer';
import { assessSourceTimingEligibility } from './notation/SourceEligibility';
import { renderStructuredRhythm } from './notation/StructuredRenderer';
import { discoverPhrases } from './notation/PhraseDiscovery';
import { renderPhraseTimeline } from './notation/PhraseRenderer';
import {
  buildVisualSuffix,
  formatTrackName,
  gcd,
  getCycleDuration,
  getRelativeDegree,
  getSourceMeasureDuration,
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
    patterns: PatternMetadata;
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

    const sourceMeasureDuration = getSourceMeasureDuration(this.config);
    if (maxDuration === 0) maxDuration = sourceMeasureDuration;
    // A single song-origin meter grid is shared even by hidden tracks. Do not
    // let a delayed voice establish a private measure origin or private loop.
    maxDuration = this.roundUpToSourceMeasure(maxDuration, sourceMeasureDuration);

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

    const literalFallbackTracks = new Map<string, Set<string>>();
    const patterns: PatternMetadata = { definitions: [], occurrences: [] };
    let budgetTracks = 0;
    const activeLabels = this.getUniqueActiveLabels(effectiveTracks);
    effectiveTracks.forEach(({ track, events }, trackIndex) => {
      if (track.hidden) return;
      if (!events.length) return;

      // Both renderers consume the same effective events and shared loop span.
      const rendered = this.renderTrack(track, events, maxDuration, activeLabels.get(track)!, trackIndex, patterns);
      output += rendered.code;
      if (rendered.budgetExhausted) budgetTracks++;
      const eligibility = assessSourceTimingEligibility(track, events);
      const reasons = new Set<string>(eligibility.fallbackReasons);
      if (eligibility.structured) rendered.fallbackReasons.forEach((reason) => reasons.add(reason));
      if (this.config.renderingMode !== 'structured' && this.config.timingStyle === 'relativeDivision') {
        reasons.add('relative-division');
      }
      if (reasons.size) literalFallbackTracks.set(activeLabels.get(track)!, reasons);
      output += '\n';
    });

    if (literalFallbackTracks.size > 0) {
      diagnostics.push({
        code: 'precise-literal-fallback',
        severity: 'warning',
        count: literalFallbackTracks.size,
        message: `Used precise literal timing for ${literalFallbackTracks.size} track${literalFallbackTracks.size === 1 ? '' : 's'} because ${this.describeLiteralFallbackReasons(literalFallbackTracks)}`,
      });
    }

    if (budgetTracks) diagnostics.push({ code: 'phrase-analysis-budget', severity: 'warning', count: budgetTracks,
      message: `Phrase discovery exceeded its deterministic analysis budget for ${budgetTracks} track${budgetTracks === 1 ? '' : 's'}; all events remain explicit` });
    return { code: output, diagnostics, sharedSpanSeconds: maxDuration, patterns };
  }

  private describeLiteralFallbackReasons(
    tracks: Map<string, Set<string>>,
  ): string {
    const reasons = new Set<string>();
    tracks.forEach((trackReasons) => trackReasons.forEach((reason) => reasons.add(reason)));
    const descriptions: string[] = [];
    if (reasons.has('legacy-seconds-only')) descriptions.push('saved notes lack source ticks');
    const tempoChanges = reasons.has('source-tempo-changes');
    const meterChanges = reasons.has('source-meter-changes');
    if (tempoChanges && meterChanges) descriptions.push('the source has tempo and meter changes');
    else if (tempoChanges) descriptions.push('the source has tempo changes');
    else if (meterChanges) descriptions.push('the source has meter changes');
    if (reasons.has('relative-division')) descriptions.push('exact subdivision formatting is unavailable');
    const sourceReasons = new Set(['legacy-seconds-only', 'source-tempo-changes', 'source-meter-changes', 'relative-division']);
    descriptions.push(...[...reasons].filter((reason) => !sourceReasons.has(reason)).sort());
    return descriptions.join('; ');
  }

  private renderTrack(
    track: Track,
    events: EffectiveEvent[],
    sharedSpanSeconds: number,
    activeLabel: string,
    trackIndex: number,
    patterns: PatternMetadata,
  ): { code: string; fallbackReasons: Set<string>; budgetExhausted: boolean } {
    const cycleDurationSeconds = getCycleDuration(this.config);
    const sound = track.sound
      ?? (this.config.useAutoMapping ? getAutoSound(track) : undefined)
      ?? this.config.globalSound;
    const visualSuffix = buildVisualSuffix(this.config, track);
    const span = { durationSeconds: sharedSpanSeconds, cycleDurationSeconds };
    const fallbackReasons = new Set<string>();
    const valuesFor = (eventsForPattern: EffectiveEvent[]) => eventsForPattern.map((event) => ({
        event,
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
    const hasRelativeScale = this.config.notationType === 'relative' && (this.config.key || this.config.playbackKey);
    const control = track.isDrum ? 's' : hasRelativeScale ? 'n' : 'note';
    const key = this.config.playbackKey || this.config.key;
    const scale = control === 'n' && key ? `${key.root}${key.averageOctave}:${key.type}` : undefined;
    const makeExpression = (eventsForPattern: EffectiveEvent[]): string => {
      const values = valuesFor(eventsForPattern);
      const structured = this.config.renderingMode === 'structured'
        ? renderStructuredRhythm({
          track,
          events: values.map(({ event, value }) => ({ event, value })),
          span,
          config: this.config,
          control,
          scale,
        })
        : undefined;
      if (structured && structured.ok === false) fallbackReasons.add(structured.reason);
      const literal = structured?.ok
        ? structured.expression
        : renderPreciseLiteral(values, span, {
          control,
          scale,
          includeVelocity: this.config.includeVelocity,
          formatting: {
            by: this.config.formatPerLineBy,
            itemsPerLine: this.config.measuresPerLine,
            measureSeconds: getSourceMeasureDuration(this.config),
          },
        });
      return literal;
    };
    const makePattern = (eventsForPattern: EffectiveEvent[], name: string, expression?: string): string => {
      const literal = expression ?? makeExpression(eventsForPattern);
      const bank = track.isDrum ? `\n  .bank(${JSON.stringify(track.drumBank || 'RolandTR909')})` : '';
      const soundSuffix = track.isDrum ? '' : `\n  .sound(${JSON.stringify(sound)})`;
      return `$${name}: ${literal}${soundSuffix}${bank}${visualSuffix};\n\n`;
    };

    const discovery = this.config.renderingMode === 'structured' ? discoverPhrases({
      track, events, config: this.config, sharedSpanSeconds,
      render: (window, timings, tickScale) => {
        const rendered = renderStructuredRhythm({ track, events: valuesFor(window.events), config: this.config, control, scale,
          span: { durationSeconds: window.durationSeconds, cycleDurationSeconds }, originTicks: window.originTicks,
          originSeconds: window.originSeconds, effectiveTiming: { scale: tickScale, events: timings } });
        return rendered.ok ? rendered.expression : undefined;
      },
    }) : undefined;
    const budgetExhausted = discovery?.budgetExhausted ?? false;
    if (discovery?.phrases.length) {
      const timeline = renderPhraseTimeline({ phrases: discovery.phrases, trackId: track.id, trackIndex,
        measureSeconds: getSourceMeasureDuration(this.config), cycleSeconds: cycleDurationSeconds, sharedSpanSeconds });
      patterns.definitions.push(...timeline.patterns.definitions);
      patterns.occurrences.push(...timeline.patterns.occurrences);
      const expression = discovery.remainder.length
        ? `stack(${timeline.expression},\n  ${makeExpression(discovery.remainder)})` : timeline.expression;
      return { code: timeline.declarations + makePattern([], activeLabel, expression), fallbackReasons, budgetExhausted };
    }
    if (track.isDrum) {
      return { code: makePattern(events, activeLabel), fallbackReasons, budgetExhausted };
    }

    const notes = effectiveEventsToNotes(events);
    const { melody, harmony } = splitMelodyHarmony(notes);
    const eventsByNote = new Map(notes.map((note, index) => [note, events[index]]));
    const toEvents = (partition: typeof notes): EffectiveEvent[] => partition.map((note) => eventsByNote.get(note)!);
    let result = '';
    if (melody.length) result += makePattern(toEvents(melody), `${activeLabel}_MELODY`);
    if (harmony.length) result += makePattern(toEvents(harmony), `${activeLabel}_HARMONY`);
    return { code: result, fallbackReasons, budgetExhausted };
  }

  private getUniqueActiveLabels(entries: Array<{ track: Track; events: EffectiveEvent[] }>): Map<Track, string> {
    const labels = new Map<Track, string>();
    const used = new Set<string>();
    let activeIndex = 0;
    entries.forEach(({ track, events }) => {
      if (track.hidden || events.length === 0) return;
      activeIndex += 1;
      const name = formatTrackName(track.name) || 'TRACK';
      const identity = formatTrackName(track.id) || `TRACK_${activeIndex}`;
      const base = `${name}_${identity}`;
      let label = base;
      let duplicate = 2;
      while (used.has(label)) {
        label = `${base}_${duplicate}`;
        duplicate += 1;
      }
      used.add(label);
      labels.set(track, label);
    });
    return labels;
  }

  private roundUpToSourceMeasure(endSeconds: number, measureSeconds: number): number {
    const measures = endSeconds / measureSeconds;
    const nearest = Math.round(measures);
    const roundingNoise = Number.EPSILON * Math.max(1, Math.abs(measures)) * 8;
    const roundedMeasures = Math.abs(measures - nearest) <= roundingNoise
      ? nearest
      : Math.ceil(measures);
    return Math.max(1, roundedMeasures) * measureSeconds;
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
