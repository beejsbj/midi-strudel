import type { StrudelConfig, Track } from '../../types';
import type { EffectiveEvent } from './EffectiveEvents';
import { assessSourceTimingEligibility } from './SourceEligibility';
import { QUANTIZATION_DIVISIONS, quantizeNoteTiming } from './NotationUtils';

/** Hard deterministic bounds. A partial search is never published as a result. */
const MAX_BARS = 8192;
const MAX_EVENT_VISITS = 100000;
const MAX_SELECTION_VISITS = 200000;

export interface EffectiveTickTiming { onsetTicks: number; durationTicks: number }
export interface PhraseWindow {
  startMeasure: number;
  measureCount: number;
  originTicks: number;
  originSeconds: number;
  durationSeconds: number;
  events: EffectiveEvent[];
}
export interface DiscoveredPhrase {
  expression: string;
  signature: string;
  occurrences: PhraseWindow[];
}
export interface PhraseDiscovery {
  phrases: DiscoveredPhrase[];
  remainder: EffectiveEvent[];
  budgetExhausted: boolean;
}

/**
 * Use a shared integer lattice for exact equality after requested quantization.
 * Its denominator represents ppq/4 grid points and the decimal strength. Source
 * identities and floating subtraction of distant timestamps never enter keys.
 */
function effectiveCoordinates(track: Track, events: EffectiveEvent[], config: StrudelConfig) {
  const ppq = track.sourceTiming!.ppq;
  const secondsPerTick = 60 / config.sourceBpm / ppq;
  const strength = config.isQuantized ? config.quantizationStrength : 0;
  const strengthPlaces = String(strength).split('.')[1]?.length ?? 0;
  if (!Number.isFinite(strength) || strengthPlaces > 6) return undefined;
  const scale = 10 ** strengthPlaces;
  const strengthInteger = strength * scale;
  const denominator = QUANTIZATION_DIVISIONS * 100 * scale;
  const sourceNotes = new Map(track.notes.map((note) => [note.source?.id, note]));
  const timings = new Map<EffectiveEvent, EffectiveTickTiming>();
  const coordinates: Array<{ event: EffectiveEvent; onset: number; release: number }> = [];
  for (const event of events) {
    const source = event.source!;
    const sourceNote = sourceNotes.get(source.id);
    if (!sourceNote) return undefined;
    const decision = quantizeNoteTiming(sourceNote, config);
    const coordinate = (ticks: number, appliedGridIndex: number | undefined) =>
      ticks * denominator + (appliedGridIndex === undefined ? 0
        : (appliedGridIndex * ppq - ticks * QUANTIZATION_DIVISIONS) * strengthInteger);
    const onset = coordinate(source.ticks, decision.onsetGridIndex);
    const duration = decision.durationClamped ? ppq * denominator / QUANTIZATION_DIVISIONS
      : coordinate(source.durationTicks, decision.durationGridIndex);
    const release = onset + duration;
    if (![onset, duration, release].every(Number.isSafeInteger)
      || Math.abs(onset / denominator * secondsPerTick - event.onsetSeconds) > 1e-9
      || Math.abs(release / denominator * secondsPerTick - event.releaseSeconds) > 1e-9) return undefined;
    coordinates.push({ event, onset, release });
    timings.set(event, { onsetTicks: onset, durationTicks: duration });
  }
  coordinates.sort((a, b) => a.onset - b.onset || a.release - b.release || a.event.midi - b.event.midi);
  return { coordinates, denominator, timings, secondsPerTick };
}

/**
 * Flat vocabulary selection: highest surviving nonoverlapping use count first,
 * then shortest window, greatest estimated byte saving, full signature, origin.
 * Cost includes declaration/lookup overhead, each selector use, and a window
 * complexity penalty. No nested definitions; minimum net saving is 24 bytes.
 * This intentionally favors reusable local vocabulary over global compression.
 */
export function discoverPhrases(input: {
  track: Track;
  events: EffectiveEvent[];
  config: StrudelConfig;
  sharedSpanSeconds: number;
  render: (window: PhraseWindow, timings: ReadonlyMap<EffectiveEvent, EffectiveTickTiming>, scale: number) => string | undefined;
}): PhraseDiscovery {
  const { track, events, config, sharedSpanSeconds, render } = input;
  const empty = (budgetExhausted = false): PhraseDiscovery => ({ phrases: [], remainder: events, budgetExhausted });
  if (!assessSourceTimingEligibility(track, events).structured) return empty();
  const meter = config.sourceTimeSignature ?? config.timeSignature;
  const measureTicks = track.sourceTiming!.ppq * 4 * meter.numerator / meter.denominator;
  const measureSeconds = measureTicks * 60 / config.sourceBpm / track.sourceTiming!.ppq;
  const bars = Math.round(sharedSpanSeconds / measureSeconds);
  if (bars > MAX_BARS || events.length > MAX_EVENT_VISITS) return empty(true);
  const effective = effectiveCoordinates(track, events, config);
  if (!effective) return empty();
  const { coordinates, denominator, timings } = effective;
  const barUnits = measureTicks * denominator;
  if (!Number.isSafeInteger(barUnits) || !Number.isSafeInteger(barUnits * bars)) return empty();
  let visits = 0;
  const groups = new Map<string, PhraseWindow[]>();
  // Scan sorted events once for each window size, retaining the furthest prior
  // release to reject incoming sustains without an all-events scan per window.
  for (const measureCount of [1, 2, 4]) {
    let cursor = 0;
    let priorRelease = 0;
    for (let bar = 0; bar + measureCount <= bars; bar++) {
      const start = bar * barUnits;
      const end = start + measureCount * barUnits;
      while (cursor < coordinates.length && coordinates[cursor].onset < start) {
        priorRelease = Math.max(priorRelease, coordinates[cursor++].release);
      }
      if (priorRelease > start) continue;
      const selected: typeof coordinates = [];
      let crossing = false;
      for (let index = cursor; index < coordinates.length && coordinates[index].onset < end; index++) {
        if (++visits > MAX_EVENT_VISITS) return empty(true);
        if (coordinates[index].release > end) crossing = true;
        selected.push(coordinates[index]);
      }
      if (crossing || selected.length === 0) continue;
      const tuples = selected.map(({ event, onset, release }) => [
        onset - start, release - start, event.midi, ...(config.includeVelocity ? [event.velocity] : []),
      ]).sort((a, b) => {
        for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return a[index] - b[index];
        return 0;
      });
      const signature = JSON.stringify([measureCount, tuples]);
      const window: PhraseWindow = {
        startMeasure: bar + 1, measureCount, originTicks: bar * measureTicks,
        originSeconds: bar * measureSeconds, durationSeconds: measureCount * measureSeconds,
        events: selected.map(({ event }) => event),
      };
      const group = groups.get(signature);
      if (group) group.push(window); else groups.set(signature, [window]);
    }
  }
  const candidates = [...groups.entries()].flatMap(([signature, occurrences]) => {
    if (occurrences.length < 2) return [];
    const expression = render(occurrences[0], timings, denominator);
    return expression ? [{ signature, occurrences, expression }] : [];
  });
  const coveredBars = new Set<number>();
  const phrases: DiscoveredPhrase[] = [];
  let selectionVisits = 0;
  while (candidates.length) {
    const choices = candidates.flatMap((candidate) => {
      let previousEnd = 0;
      const occurrences = candidate.occurrences.filter((window) => {
        if (++selectionVisits > MAX_SELECTION_VISITS) return false;
        const end = window.startMeasure + window.measureCount;
        if (window.startMeasure < previousEnd) return false;
        for (let bar = window.startMeasure; bar < end; bar++) {
          if (++selectionVisits > MAX_SELECTION_VISITS || coveredBars.has(bar)) return false;
        }
        previousEnd = end;
        return true;
      });
      if (occurrences.length < 2) return [];
      const size = occurrences[0].measureCount;
      const saving = (occurrences.length - 1) * candidate.expression.length
        - 64 - occurrences.length * 12 - size * 4;
      return saving >= 24 ? [{ candidate, occurrences, saving, size }] : [];
    }).sort((a, b) => {
      selectionVisits++;
      return b.occurrences.length - a.occurrences.length || a.size - b.size
        || b.saving - a.saving || a.candidate.signature.localeCompare(b.candidate.signature)
        || a.occurrences[0].startMeasure - b.occurrences[0].startMeasure;
    });
    if (selectionVisits > MAX_SELECTION_VISITS) return empty(true);
    if (!choices.length) break;
    const choice = choices[0];
    phrases.push({ ...choice.candidate, occurrences: choice.occurrences });
    choice.occurrences.forEach((window) => {
      for (let bar = window.startMeasure; bar < window.startMeasure + window.measureCount; bar++) coveredBars.add(bar);
    });
    candidates.splice(candidates.indexOf(choice.candidate), 1);
  }
  const coveredEvents = new Set(phrases.flatMap((phrase) => phrase.occurrences.flatMap((window) => window.events)));
  return { phrases, remainder: events.filter((event) => !coveredEvents.has(event)), budgetExhausted: false };
}
