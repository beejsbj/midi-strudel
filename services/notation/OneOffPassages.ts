import type { StrudelConfig, Track } from '../../types';
import type { EffectiveEvent } from './EffectiveEvents';
import { effectiveCoordinates, type PhraseWindow } from './PhraseDiscovery';
import { assessSourceTimingEligibility } from './SourceEligibility';

/** Presentation passages are not claims of discovered repetition. */
export interface OneOffPassage {
  window: PhraseWindow;
  expression: string;
}

/**
 * Bound one-off material at silent bar boundaries. An occupied interval grows
 * through every overlapping sustain before it can be cut, so a crossing gate
 * is never split or retriggered. Adjacent intervals collect into short passages;
 * gaps remain timeline rests instead of padding every expression to song length.
 */
export function renderOneOffPassages(input: {
  track: Track;
  events: EffectiveEvent[];
  config: StrudelConfig;
  render: (window: PhraseWindow, timings: NonNullable<ReturnType<typeof effectiveCoordinates>>['timings'], scale: number) => string | undefined;
}): { passages: OneOffPassage[]; remainder: EffectiveEvent[] } {
  const { track, events, config, render } = input;
  const unchanged = { passages: [], remainder: events };
  if (!events.length || !assessSourceTimingEligibility(track, events).structured) return unchanged;
  // Instantaneous MIDI events need the literal gate route, but should not force
  // every neighboring positive-length note into the same fallback expression.
  const sustained = track.isDrum ? events : events.filter((event) => event.releaseSeconds > event.onsetSeconds);
  const effective = effectiveCoordinates(track, sustained, config);
  if (!effective) return unchanged;
  const meter = config.sourceTimeSignature ?? config.timeSignature;
  const measureTicks = track.sourceTiming!.ppq * 4 * meter.numerator / meter.denominator;
  const barUnits = measureTicks * effective.denominator;
  const measureSeconds = measureTicks * effective.secondsPerTick;
  if (!Number.isSafeInteger(barUnits)) return unchanged;
  const groups: Array<{ start: number; end: number; events: EffectiveEvent[] }> = [];
  for (const { event, onset, release } of effective.coordinates) {
    const start = Math.floor(onset / barUnits);
    // A one-shot drum hit belongs to its own bar, whatever its MIDI length.
    const end = track.isDrum ? start + 1 : Math.ceil(release / barUnits);
    const previous = groups.at(-1);
    if (previous && start < previous.end) {
      previous.end = Math.max(previous.end, end);
      previous.events.push(event);
    } else groups.push({ start, end, events: [event] });
  }
  const windows: typeof groups = [];
  for (const group of groups) {
    const previous = windows.at(-1);
    if (previous && group.start === previous.end && group.end - previous.start <= 4) {
      previous.end = group.end;
      previous.events.push(...group.events);
    } else windows.push(group);
  }
  // This secondary presentation pass must not undo discovery's bounded work.
  if (windows.length > 2048) return unchanged;
  const passages: OneOffPassage[] = [];
  const remainder = track.isDrum ? [] : events.filter((event) => event.releaseSeconds <= event.onsetSeconds);
  for (const group of windows) {
    const window: PhraseWindow = {
      startMeasure: group.start + 1,
      measureCount: group.end - group.start,
      originTicks: group.start * measureTicks,
      originSeconds: group.start * measureSeconds,
      durationSeconds: (group.end - group.start) * measureSeconds,
      events: group.events,
    };
    const expression = render(window, effective.timings, effective.denominator);
    if (expression) passages.push({ window, expression });
    else remainder.push(...group.events);
  }
  return { passages, remainder };
}
