/**
 * StrudelNotation — public entry point.
 *
 * Implementation is split across focused modules under services/notation/:
 *   NotationUtils   — pure helpers (math, formatting, isRest, etc.)
 *   StructuredRenderer — source-timed rhythms and polyphony
 *   PhraseRenderer — each track's phrase object and arrangement
 */

import { ConversionDiagnostic, PatternMetadata, StrudelConfig, Track } from '../types';
import { getAutoSound } from '../constants';
import { drumKitFor, drumSample, GM_PERCUSSION, indexedSampleKey } from './drums/DrumKits';
import { mergeIdenticalDoubles, mergeSameSampleHits, prepareEffectiveTracks, type EffectiveEvent } from './notation/EffectiveEvents';
import { EAR_TOLERANCE_SECONDS } from './notation/EarTiming';
import { renderPreciseLiteral } from './notation/LiteralRenderer';
import { assessSourceTimingEligibility } from './notation/SourceEligibility';
import { LINE_WIDTH, renderStructuredRhythm, trackControlSuffix, trackControlsFor, type StructuredRhythmResult } from './notation/StructuredRenderer';
import { discoverPhrases, type EffectiveTickTiming, type PhraseWindow } from './notation/PhraseDiscovery';
import { renderPhraseTimeline } from './notation/PhraseRenderer';
import { renderOneOffPassages } from './notation/OneOffPassages';
import {
  buildVisualSuffix,
  formatBpm,
  formatPlaybackBpm,
  gcd,
  getCycleDuration,
  getRelativeDegree,
  getSourceMeasureDuration,
} from './notation/NotationUtils';

/** Drum samples play at full level; Strudel's soundfonts and synths peak at 0.3. */
const DRUM_GAIN = 0.3;

/**
 * A track label names both a `const` phrase object and a `$label:` line, so it
 * cannot be a JS reserved word or a Strudel global the generated code calls.
 */
const RESERVED_LABELS = new Set([
  'arguments', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'enum', 'eval', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'implements', 'import', 'in',
  'instanceof', 'interface', 'let', 'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'static',
  'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield',
  'mini', 'n', 'note', 's', 'setcps', 'silence', 'sound', 'stack',
]);

/** Rule width for the short separator between a phrase object and its track line. */
const SHORT_RULE_WIDTH = 40;

/**
 * Two full-width lines open each track, so a scan finds every instrument; a
 * short rule then splits its phrase object from the line that plays it.
 */
const trackHeader = (name: string): string => {
  const title = `// ── ${name.replace(/[\r\n\t]+/g, ' ').trim()} `;
  return `// ${'─'.repeat(LINE_WIDTH - 3)}\n${title}${'─'.repeat(Math.max(2, LINE_WIDTH - title.length))}`;
};
const phraseRule = `// ${'─'.repeat(SHORT_RULE_WIDTH - 3)}`;

/** A drum part's indexed samples named under its header, wrapped at the line width. */
const sampleKeyLines = (entries: string[]): string => {
  const lines: string[] = [];
  for (const entry of entries) {
    const last = lines.length - 1;
    if (last >= 0 && `${lines[last]} · ${entry}`.length <= LINE_WIDTH) lines[last] += ` · ${entry}`;
    else lines.push(`// ${entry}`);
  }
  return lines.map((line) => `${line}\n`).join('');
};

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
    const standIns = new Map<string, { midi: number; standIn: number; kit: string; count: number }>();
    tracks.forEach((track) => {
      if (!track.isDrum || track.hidden) return;
      const kit = drumKitFor(track);
      track.notes.forEach((note) => {
        const sample = drumSample(note.midi, kit);
        if (!sample) {
          droppedNoteCounts.set(note.midi, (droppedNoteCounts.get(note.midi) ?? 0) + 1);
        } else if (sample.standIn !== undefined) {
          const key = `${note.midi}:${kit}`;
          const entry = standIns.get(key) ?? { midi: note.midi, standIn: sample.standIn, kit, count: 0 };
          standIns.set(key, { ...entry, count: entry.count + 1 });
        }
      });
    });
    const gmName = (midi: number) => GM_PERCUSSION[midi] ?? `MIDI ${midi}`;
    const diagnostics: ConversionDiagnostic[] = [...droppedNoteCounts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([midiNote, count]): ConversionDiagnostic => ({
        code: 'unmapped-drum-note',
        severity: 'warning',
        midiNote,
        count,
        message: `Dropped ${count} unmapped drum note event${count === 1 ? '' : 's'} for MIDI ${midiNote}`,
      }));
    // A kit without the exact sound plays the nearest one it has.
    [...standIns.values()].sort((a, b) => a.midi - b.midi || a.kit.localeCompare(b.kit)).forEach(({ midi, standIn, kit, count }) =>
      diagnostics.push({ code: 'substituted-drum-note', severity: 'info', midiNote: midi, count,
        message: `Played ${count} ${gmName(midi)} hit${count === 1 ? '' : 's'} (MIDI ${midi}) as ${gmName(standIn)}: ${kit} has no ${gmName(midi).toLowerCase()}` }));

    let mergedDoubles = 0;
    let drumLayers = 0;
    let silentNotes = 0;
    let snappedNotes = 0;
    let maxSnapSeconds = 0;
    const effectiveTracks = prepareEffectiveTracks(tracks, this.config).map(({ track, events, snapped }) => {
      // A zero-length pitched note makes no sound; a zero-length drum hit does.
      const kit = track.isDrum ? drumKitFor(track) : '';
      const sampleOf = (midi: number) => drumSample(midi, kit)?.token;
      const audible = track.isDrum ? events.filter((event) => sampleOf(event.midi))
        : events.filter((event) => event.releaseSeconds > event.onsetSeconds);
      const merged = mergeIdenticalDoubles(audible, track.isDrum);
      const layered = track.isDrum ? mergeSameSampleHits(merged.events, sampleOf) : merged;
      if (!track.hidden) {
        mergedDoubles += merged.merged;
        drumLayers += track.isDrum ? layered.merged : 0;
        if (!track.isDrum) silentNotes += events.length - audible.length;
        snappedNotes += snapped.moved;
        maxSnapSeconds = Math.max(maxSnapSeconds, snapped.maxShiftSeconds);
      }
      return { track, events: layered.events };
    });
    if (mergedDoubles) diagnostics.push({ code: 'merged-duplicate-notes', severity: 'warning', count: mergedDoubles,
      message: `Merged ${mergedDoubles} fully identical duplicate note${mergedDoubles === 1 ? '' : 's'} (same pitch, start, length and velocity; drums ignore length)` });
    if (drumLayers) diagnostics.push({ code: 'merged-drum-layers', severity: 'info', count: drumLayers,
      message: `Merged ${drumLayers} drum hit${drumLayers === 1 ? '' : 's'} that land on the same sample at the same time (one sample twice is only louder)` });
    if (snappedNotes) diagnostics.push({ code: 'snapped-to-ear', severity: 'info', count: snappedNotes,
      message: `Moved ${snappedNotes} note${snappedNotes === 1 ? '' : 's'} onto the beat grid by at most ${(maxSnapSeconds * 1000).toFixed(1)} ms (exact to the ear: ${EAR_TOLERANCE_SECONDS * 1000} ms tolerance)` });
    if (silentNotes) diagnostics.push({ code: 'dropped-silent-notes', severity: 'warning', count: silentNotes,
      message: `Dropped ${silentNotes} zero-length pitched note${silentNotes === 1 ? '' : 's'}, which make no sound` });

    // 1. Calculate Global Song Duration
    const sourceMeasureDuration = getSourceMeasureDuration(this.config);
    let maxDuration = effectiveTracks.reduce((max, entry) => {
      // A boundary attack starts the next bar, even when its MIDI gate is zero.
      const trackMax = entry.events.reduce((m, event) => Math.max(m, event.releaseSeconds,
        this.roundUpToSourceMeasure(event.onsetSeconds, sourceMeasureDuration, true)), 0);
      return Math.max(max, trackMax);
    }, 0);

    if (maxDuration === 0) maxDuration = sourceMeasureDuration;
    // A single song-origin meter grid is shared even by hidden tracks. Do not
    // let a delayed voice establish a private measure origin or private loop.
    maxDuration = this.roundUpToSourceMeasure(maxDuration, sourceMeasureDuration);

    // 2. Generate CPS setup
    const cpsFormula = this.getCpsFormula();

    const timeSig = `${this.config.timeSignature.numerator}/${this.config.timeSignature.denominator}`;
    const title = this.config.fileName ?? 'MIDI Conversion';
    const formattedSourceBpm = formatBpm(this.config.sourceBpm);
    const formattedBpm = formatPlaybackBpm(this.config.bpm, maxDuration * this.config.sourceBpm / this.config.bpm);
    let output = [
      `// @title ${title}`,
      `// @by midi-strudel`,
      `// @details BPM: ${formattedSourceBpm} | Time: ${timeSig}`,
      ``,
      `const BPM = ${formattedBpm};`,
      `setcps(${cpsFormula});`,
      ``,
      ``,
    ].join('\n');

    const literalFallbackTracks = new Map<string, Set<string>>();
    const patterns: PatternMetadata = { definitions: [], occurrences: [] };
    const blocks: string[] = [];
    let budgetTracks = 0;
    const activeLabels = this.getUniqueActiveLabels(effectiveTracks);
    effectiveTracks.forEach(({ track, events }, trackIndex) => {
      if (track.hidden) return;
      if (!events.length) return;

      // Every track retains its original polyphony under one shared loop span.
      const rendered = this.renderTrack(track, events, maxDuration, activeLabels.get(track)!, trackIndex, patterns);
      const key = track.isDrum ? sampleKeyLines(indexedSampleKey(events.map((event) => event.midi), drumKitFor(track))) : '';
      blocks.push(`${trackHeader(track.name || activeLabels.get(track)!)}\n${key}${rendered.library}\n\n${phraseRule}\n${rendered.code}`);
      if (rendered.budgetExhausted) budgetTracks++;
      const eligibility = assessSourceTimingEligibility(track, events);
      const reasons = new Set<string>(eligibility.fallbackReasons);
      if (eligibility.structured) rendered.fallbackReasons.forEach((reason) => reasons.add(reason));
      if (reasons.size) literalFallbackTracks.set(activeLabels.get(track)!, reasons);
    });
    output += blocks.join('\n');

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
    const sourceReasons = new Set(['legacy-seconds-only', 'source-tempo-changes', 'source-meter-changes']);
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
  ): { code: string; library: string; fallbackReasons: Set<string>; budgetExhausted: boolean } {
    const cycleDurationSeconds = getCycleDuration(this.config);
    const sound = track.sound
      ?? (this.config.useAutoMapping ? getAutoSound(track) : undefined)
      ?? this.config.globalSound;
    const visualSuffix = buildVisualSuffix(this.config, track);
    const span = { durationSeconds: sharedSpanSeconds, cycleDurationSeconds };
    const fallbackReasons = new Set<string>();
    const kit = track.isDrum ? drumKitFor(track) : '';
    const valuesFor = (eventsForPattern: EffectiveEvent[]) => eventsForPattern.map((event) => ({
        event,
        id: event.id,
        value: track.isDrum
          ? drumSample(event.midi, kit)!.token
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
    // Built passages by emitted text, so a colon track can re-emit them as bare strings.
    const built = new Map<string, Extract<StructuredRhythmResult, { ok: true }>>();
    const makeExpression = (eventsForPattern: EffectiveEvent[]): string => {
      const values = valuesFor(eventsForPattern);
      const structured = renderStructuredRhythm({
        track,
        events: values.map(({ event, value }) => ({ event, value })),
        span,
        config: this.config,
        control,
        scale,
      });
      if (structured.ok === false) fallbackReasons.add(structured.reason);
      else built.set(structured.expression, structured);
      const literal = structured.ok
        ? structured.expression
        : renderPreciseLiteral(values, span, {
          control,
          scale,
          includeVelocity: this.config.includeVelocity,
          formatting: {
            itemsPerLine: this.config.measuresPerLine,
            measureSeconds: getSourceMeasureDuration(this.config),
          },
        });
      return literal;
    };
    const makePattern = (expression: string): string => {
      const bank = track.isDrum ? `\n  .bank(${JSON.stringify(kit)})\n  .gain(${DRUM_GAIN})` : '';
      const soundSuffix = track.isDrum ? '' : `\n  .sound(${JSON.stringify(sound)})`;
      return `$${activeLabel}: ${expression}${soundSuffix}${bank}${visualSuffix};\n`;
    };

    const renderWindow = (window: PhraseWindow, timings: ReadonlyMap<EffectiveEvent, EffectiveTickTiming>, tickScale: number) => {
      const rendered = renderStructuredRhythm({ track, events: valuesFor(window.events), config: this.config, control, scale,
        span: { durationSeconds: window.durationSeconds, cycleDurationSeconds }, originTicks: window.originTicks,
        originSeconds: window.originSeconds, effectiveTiming: { scale: tickScale, events: timings } });
      if (!rendered.ok) return undefined;
      built.set(rendered.expression, rendered);
      return rendered.expression;
    };
    const discovery = discoverPhrases({ track, events, config: this.config, sharedSpanSeconds, render: renderWindow });
    const oneOff = discovery.budgetExhausted ? { passages: [], remainder: discovery.remainder }
      : renderOneOffPassages({ track, events: discovery.remainder, config: this.config, render: renderWindow });
    let phrases = discovery.phrases;
    let passages = oneOff.passages;
    let remainderExpression = oneOff.remainder.length ? makeExpression(oneOff.remainder) : undefined;
    let trackSuffix = '';
    // Colon style: the library holds bare pattern strings and the track line
    // reads them once. A literal fallback passage is already a full pattern, so
    // such a track keeps per-passage wrappers.
    const passageTexts = [...phrases.map((phrase) => phrase.expression), ...passages.map((passage) => passage.expression),
      ...(remainderExpression ? [remainderExpression] : [])];
    if (this.config.controlSyntax === 'colon' && passageTexts.every((text) => built.has(text))) {
      const controls = trackControlsFor(passageTexts.map((text) => built.get(text)!.rhythm), control, this.config);
      const bare = (text: string) => built.get(text)!.libraryExpression(controls);
      phrases = phrases.map((phrase) => ({ ...phrase, expression: bare(phrase.expression) }));
      passages = passages.map((passage) => ({ ...passage, expression: bare(passage.expression) }));
      remainderExpression = remainderExpression && bare(remainderExpression);
      trackSuffix = trackControlSuffix(controls);
    }
    const timeline = renderPhraseTimeline({ phrases, passages,
      remainderExpression,
      trackId: track.id, trackIndex, trackKey: activeLabel,
      measureSeconds: getSourceMeasureDuration(this.config), cycleSeconds: cycleDurationSeconds, sharedSpanSeconds });
    patterns.definitions.push(...timeline.patterns.definitions);
    patterns.occurrences.push(...timeline.patterns.occurrences);
    return { code: makePattern(`${timeline.expression}${trackSuffix}`), library: timeline.library,
      fallbackReasons, budgetExhausted: discovery.budgetExhausted };
  }

  private getUniqueActiveLabels(entries: Array<{ track: Track; events: EffectiveEvent[] }>): Map<Track, string> {
    const labels = new Map<Track, string>();
    const used = new Set<string>();
    entries.forEach(({ track, events }) => {
      if (track.hidden || events.length === 0) return;
      const name = track.name.toLowerCase().replace(/\([^)]*\)/g, '').replace(/\b(grand|classic)\b/g, '')
        .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24).replace(/_$/g, '') || (track.isDrum ? 'drums' : 'track');
      const base = /^[a-z]/.test(name) && !RESERVED_LABELS.has(name) ? name : `track_${name}`;
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

  private roundUpToSourceMeasure(endSeconds: number, measureSeconds: number, includeBoundary = false): number {
    const measures = endSeconds / measureSeconds;
    const nearest = Math.round(measures);
    const roundingNoise = Number.EPSILON * Math.max(1, Math.abs(measures)) * 8;
    const roundedMeasures = Math.abs(measures - nearest) <= roundingNoise
      ? nearest + (includeBoundary ? 1 : 0)
      : Math.ceil(measures);
    return Math.max(1, roundedMeasures) * measureSeconds;
  }

  private getCpsFormula(): string {
    const numerator = this.config.timeSignature.numerator || 4;
    const denominator = this.config.timeSignature.denominator || 4;
    const quarterNotesPerCycle = numerator * 4;
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
