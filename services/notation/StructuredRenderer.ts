import type { StrudelConfig, Track } from '../../types';
import type { EffectiveEvent } from './EffectiveEvents';
import type { SharedLiteralSpan } from './LiteralRenderer';
import { assessSourceTimingEligibility } from './SourceEligibility';
import { numberExpression, ratioExpression } from './NumberFormat';

export interface StructuredEvent {
  event: EffectiveEvent;
  value: string | number;
}

/** Integer tick spans retain rational timing until the final gate serialization. */
export type RhythmNode =
  | { kind: 'rest'; ticks: number }
  | { kind: 'event'; ticks: number; gateTicks: number; sources: StructuredEvent[] }
  | { kind: 'sequence'; ticks: number; grouping: 'song' | 'measure' | 'subdivision' | 'weighted'; children: RhythmNode[] }
  | { kind: 'stack'; ticks: number; children: RhythmNode[] };

export interface StructuredRhythmInput {
  track: Track;
  events: StructuredEvent[];
  span: SharedLiteralSpan;
  config: StrudelConfig;
  control: 'note' | 'n' | 's';
  /** Resolve relative pitches before expanding the passage's rhythmic span. */
  scale?: string;
  /** Absolute source and effective-time origins. Source identities are never rewritten. */
  originTicks?: number;
  originSeconds?: number;
  /** Integer coordinates on an effective tick/scale lattice after quantization. */
  effectiveTiming?: {
    scale: number;
    events: ReadonlyMap<EffectiveEvent, { onsetTicks: number; durationTicks: number }>;
  };
}

export type StructuredRhythmResult =
  | { ok: true; expression: string; rhythm: RhythmNode }
  | { ok: false; reason: string };

const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
const MAX_LOCAL_DIVISIONS = 32;
const MAX_BEATS = 20000;
const MAX_CELLS = 200000;

/**
 * Render a finite source-timed passage at local zero. Simultaneous attacks with
 * matching gates and retained velocity share a chord; other attacks occupy
 * separate equal-span lanes. A gate can cross any later beat or measure
 * without adding another attack. Notes, gates and velocity are emitted from the
 * same tree, so their structural spans cannot drift apart.
 */
export const renderStructuredRhythm = ({
  track, events, span, config, control, scale, originTicks = 0, originSeconds = 0, effectiveTiming,
}: StructuredRhythmInput): StructuredRhythmResult => {
  const timing = track.sourceTiming;
  if (!timing || !Number.isSafeInteger(timing.ppq) || timing.ppq <= 0) {
    return { ok: false, reason: 'Missing source ticks' };
  }
  const tempos = timing.tempos;
  const meters = timing.timeSignatures;
  if (!assessSourceTimingEligibility(track, events.map(({ event }) => event)).structured) {
    return { ok: false, reason: 'Changing source timing' };
  }
  const bpm = tempos[0]?.bpm ?? 120;
  const meter = meters[0] ?? { numerator: 4, denominator: 4 };
  const tickScale = effectiveTiming?.scale ?? 1;
  if (!Number.isSafeInteger(tickScale) || tickScale <= 0) return { ok: false, reason: 'Invalid effective tick scale' };
  const secondsPerTick = 60 / bpm / timing.ppq / tickScale;
  const beatTicks = timing.ppq * 4 / meter.denominator * tickScale;
  originTicks *= tickScale;
  const spanTicks = Math.round(span.durationSeconds / secondsPerTick);
  const beatCount = spanTicks / beatTicks;
  if (!Number.isSafeInteger(beatTicks) || !Number.isSafeInteger(originTicks)
    || !Number.isSafeInteger(spanTicks) || !Number.isInteger(beatCount) || beatCount <= 0 || beatCount > MAX_BEATS
    || Math.abs(spanTicks * secondsPerTick - span.durationSeconds) > 1e-9) {
    return { ok: false, reason: 'Unsupported finite rhythmic span' };
  }
  const byOnset = new Map<number, StructuredEvent[]>();
  const durations = new Map<EffectiveEvent, number>();
  for (const item of events) {
    const { event } = item;
    const original = event.source;
    const effective = effectiveTiming?.events.get(event);
    const source = effective ? { ticks: effective.onsetTicks, durationTicks: effective.durationTicks } : original;
    if (!source || !Number.isSafeInteger(source.ticks) || !Number.isSafeInteger(source.durationTicks)
      || source.durationTicks <= 0
      || Math.abs((source.ticks - originTicks) * secondsPerTick - (event.onsetSeconds - originSeconds)) > 1e-9
      || Math.abs(source.durationTicks * secondsPerTick - (event.releaseSeconds - event.onsetSeconds)) > 1e-9) {
      return { ok: false, reason: 'Effective timing differs from source rhythm' };
    }
    const onset = source.ticks - originTicks;
    durations.set(event, source.durationTicks);
    if (onset < 0 || onset >= spanTicks || onset + source.durationTicks > spanTicks) {
      return { ok: false, reason: 'Event crosses finite passage boundary' };
    }
    const group = byOnset.get(onset) ?? [];
    group.push(item);
    byOnset.set(onset, group);
  }
  const chordsByOnset = new Map<number, StructuredEvent[][]>();
  for (const [onset, group] of byOnset) {
    group.sort((a, b) => a.event.midi - b.event.midi
      || durations.get(a.event)! - durations.get(b.event)!
      || a.event.velocity - b.event.velocity || a.event.id.localeCompare(b.event.id));
    const matchingControls = new Map<string, StructuredEvent[]>();
    for (const item of group) {
      const key = `${durations.get(item.event)}:${config.includeVelocity ? item.event.velocity : ''}`;
      const chord = matchingControls.get(key) ?? [];
      chord.push(item);
      matchingControls.set(key, chord);
    }
    chordsByOnset.set(onset, [...matchingControls.values()]);
  }
  let laneCount = 1;
  for (const group of chordsByOnset.values()) laneCount = Math.max(laneCount, group.length);
  if (laneCount * beatCount > MAX_CELLS) return { ok: false, reason: 'Rhythm rendering budget exceeded' };
  let cells = 0;
  const lanes: RhythmNode[] = [];
  // Onsets are bucketed once, avoiding a whole-song scan for every beat.
  const buckets = new Map<number, number[]>();
  for (const onset of byOnset.keys()) {
    const beat = Math.floor(onset / beatTicks);
    const bucket = buckets.get(beat) ?? [];
    bucket.push(onset);
    buckets.set(beat, bucket);
  }
  for (let lane = 0; lane < laneCount; lane += 1) {
    const beats: RhythmNode[] = [];
    for (let beat = 0; beat < beatCount; beat += 1) {
      const start = beat * beatTicks;
      const attacks = (buckets.get(beat) ?? []).filter((onset) => chordsByOnset.get(onset)![lane]);
      const offsets = Array.from(new Set([0, ...attacks.map((onset) => onset - start), beatTicks])).sort((a, b) => a - b);
      const unit = offsets.reduce((divisor, offset) => gcd(divisor, offset), beatTicks);
      const divisions = beatTicks / unit;
      const equal = divisions <= MAX_LOCAL_DIVISIONS;
      const boundaries = equal ? Array.from({ length: divisions + 1 }, (_, index) => index * unit) : offsets;
      cells += boundaries.length - 1;
      if (cells > MAX_CELLS) return { ok: false, reason: 'Rhythm rendering budget exceeded' };
      const children: RhythmNode[] = boundaries.slice(0, -1).map((offset, index) => {
        const ticks = boundaries[index + 1] - offset;
        const sources = chordsByOnset.get(start + offset)?.[lane];
        return sources
          ? { kind: 'event', ticks, gateTicks: durations.get(sources[0].event)!, sources }
          : { kind: 'rest', ticks };
      });
      beats.push({ kind: 'sequence', ticks: beatTicks, grouping: equal ? 'subdivision' : 'weighted', children });
    }
    const measures: RhythmNode[] = [];
    for (let index = 0; index < beats.length; index += meter.numerator) {
      const children = beats.slice(index, index + meter.numerator);
      measures.push({ kind: 'sequence', ticks: children.length * beatTicks, grouping: 'measure', children });
    }
    lanes.push({ kind: 'sequence', ticks: spanTicks, grouping: 'song', children: measures });
  }
  const rhythm: RhythmNode = { kind: 'stack', ticks: spanTicks, children: lanes };
  const expression = emitRhythm(rhythm, control, config);
  const scaleSuffix = control === 'n' && scale !== undefined ? `.scale(${JSON.stringify(scale)})` : '';
  const cycles = span.durationSeconds / span.cycleDurationSeconds;
  const slowSuffix = cycles === 1 ? '' : `.slow(${numberExpression(cycles)})`;
  return { ok: true, expression: `${expression}${scaleSuffix}${slowSuffix}`, rhythm };
};

type Attribute = 'value' | 'gate' | 'velocity';
const leaves = (node: RhythmNode): Extract<RhythmNode, { kind: 'event' }>[] =>
  node.kind === 'event' ? [node] : node.kind === 'rest' ? [] : node.children.flatMap(leaves);

const compressRepetitions = (tokens: string[]): string[] => {
  const result: string[] = [];
  for (let index = 0; index < tokens.length;) {
    let end = index + 1;
    while (end < tokens.length && tokens[end] === tokens[index]) end += 1;
    const count = end - index;
    result.push(count > 1 ? `${tokens[index]}!${count}` : tokens[index]);
    index = end;
  }
  return result;
};

const emitMini = (node: RhythmNode, attribute: Attribute, config: StrudelConfig): string => {
  if (node.kind === 'rest') return '~';
  if (node.kind === 'event') {
    // Mini '/' slows patterns, and the pinned REPL discards template literal
    // interpolation. Keep changing controls decimal; only JS arguments use fractions.
    if (attribute === 'gate') return String(node.gateTicks / node.ticks);
    if (attribute === 'velocity') return String(node.sources[0].event.velocity);
    const values = node.sources.map((source) => source.value);
    return values.length === 1 ? String(values[0]) : `[${values.join(',')}]`;
  }
  const unit = node.children.reduce((divisor, child) => gcd(divisor, child.ticks), node.children[0]?.ticks ?? 1);
  const equal = node.children.every((child) => child.ticks === node.children[0].ticks);
  const tokens = node.children.map((child) => {
    const value = emitMini(child, attribute, config);
    return equal ? value : `${value}@${child.ticks / unit}`;
  });
  // An empty beat or measure occupies its parent's span without needing an
  // expanded row of rests. This applies equally to notes, gates and velocity.
  if (tokens.every((token) => token === '~')) return '~';
  const chunkSize = Math.max(1, config.measuresPerLine);
  const wrap = node.kind === 'sequence' && ((node.grouping === 'song' && config.formatPerLineBy === 'measure')
    || (['subdivision', 'weighted'].includes(node.grouping) && config.formatPerLineBy === 'note'));
  // Combining `@weight!count` changes weighted support in the pinned mini
  // parser. Repetition is only shorthand for equal-duration siblings.
  const compact = equal ? compressRepetitions(tokens) : tokens;
  const text = wrap
    ? compact.map((token, index) => `${index && index % chunkSize === 0 ? '\n    ' : index ? ' ' : ''}${token}`).join('')
    : compact.join(' ');
  return node.children.length === 1 ? text : `[${text}]`;
};

const emitRhythm = (node: RhythmNode, control: StructuredRhythmInput['control'], config: StrudelConfig): string => {
  if (node.kind === 'stack') {
    const expressions = node.children.map((child) => emitRhythm(child, control, config));
    return expressions.length === 1 ? expressions[0] : `stack(\n  ${expressions.join(',\n  ')}\n)`;
  }
  const notes = leaves(node);
  if (!notes.length) return 'silence';
  // Template literals keep source beat/measure layout visible to the musician.
  let expression = `${control}(\`${emitMini(node, 'value', config)}\`)`;
  const gates = notes.map((leaf) => leaf.gateTicks / leaf.ticks);
  if (gates.some((gate) => gate !== 1)) {
    expression += gates.every((gate) => gate === gates[0])
      ? `.clip(${ratioExpression(notes[0].gateTicks, notes[0].ticks)})` : `.clip(\`${emitMini(node, 'gate', config)}\`)`;
  }
  if (config.includeVelocity) {
    const velocities = notes.map((leaf) => leaf.sources[0].event.velocity);
    expression += velocities.every((velocity) => velocity === velocities[0])
      ? `.velocity(${numberExpression(velocities[0])})` : `.velocity(\`${emitMini(node, 'velocity', config)}\`)`;
  }
  return expression;
};
