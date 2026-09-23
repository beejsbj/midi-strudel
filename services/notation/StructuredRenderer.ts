import type { StrudelConfig, Track } from '../../types';
import type { EffectiveEvent } from './EffectiveEvents';
import type { SharedLiteralSpan } from './LiteralRenderer';
import { assessSourceTimingEligibility } from './SourceEligibility';

export interface StructuredEvent {
  event: EffectiveEvent;
  value: string | number;
}

/** Integer tick spans retain rational timing until the final gate serialization. */
export type RhythmNode =
  | { kind: 'rest'; ticks: number }
  | { kind: 'event'; ticks: number; gateTicks: number; source: StructuredEvent }
  | { kind: 'sequence'; ticks: number; grouping: 'song' | 'measure' | 'subdivision' | 'weighted'; children: RhythmNode[] }
  | { kind: 'stack'; ticks: number; children: RhythmNode[] };

export interface StructuredRhythmInput {
  track: Track;
  events: StructuredEvent[];
  span: SharedLiteralSpan;
  config: StrudelConfig;
  control: 'note' | 'n' | 's';
  /** Absolute source and effective-time origins. Source identities are never rewritten. */
  originTicks?: number;
  originSeconds?: number;
}

export type StructuredRhythmResult =
  | { ok: true; expression: string; rhythm: RhythmNode }
  | { ok: false; reason: string };

const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
const MAX_LOCAL_DIVISIONS = 32;
const MAX_BEATS = 20000;
const MAX_CELLS = 200000;

/**
 * Render a finite source-timed passage at local zero. Each simultaneous attack
 * occupies its own equal-span lane; a gate can cross any later beat or measure
 * without adding another attack. Notes, gates and velocity are emitted from the
 * same tree, so their structural spans cannot drift apart.
 */
export const renderStructuredRhythm = ({
  track, events, span, config, control, originTicks = 0, originSeconds = 0,
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
  const secondsPerTick = 60 / bpm / timing.ppq;
  const beatTicks = timing.ppq * 4 / meter.denominator;
  const spanTicks = Math.round(span.durationSeconds / secondsPerTick);
  const beatCount = spanTicks / beatTicks;
  if (!Number.isSafeInteger(beatTicks) || !Number.isSafeInteger(originTicks)
    || !Number.isSafeInteger(spanTicks) || !Number.isInteger(beatCount) || beatCount <= 0 || beatCount > MAX_BEATS
    || Math.abs(spanTicks * secondsPerTick - span.durationSeconds) > 1e-9) {
    return { ok: false, reason: 'Unsupported finite rhythmic span' };
  }
  const byOnset = new Map<number, StructuredEvent[]>();
  for (const item of events) {
    const { event } = item;
    const source = event.source;
    if (!source || !Number.isSafeInteger(source.ticks) || !Number.isSafeInteger(source.durationTicks)
      || source.durationTicks <= 0
      || Math.abs((source.ticks - originTicks) * secondsPerTick - (event.onsetSeconds - originSeconds)) > 1e-9
      || Math.abs(source.durationTicks * secondsPerTick - (event.releaseSeconds - event.onsetSeconds)) > 1e-9) {
      return { ok: false, reason: 'Effective timing differs from source rhythm' };
    }
    const onset = source.ticks - originTicks;
    if (onset < 0 || onset >= spanTicks || onset + source.durationTicks > spanTicks) {
      return { ok: false, reason: 'Event crosses finite passage boundary' };
    }
    const group = byOnset.get(onset) ?? [];
    group.push(item);
    byOnset.set(onset, group);
  }
  for (const group of byOnset.values()) {
    group.sort((a, b) => a.event.midi - b.event.midi
      || a.event.source!.durationTicks - b.event.source!.durationTicks
      || a.event.velocity - b.event.velocity || a.event.id.localeCompare(b.event.id));
  }
  let laneCount = 1;
  for (const group of byOnset.values()) laneCount = Math.max(laneCount, group.length);
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
      const attacks = (buckets.get(beat) ?? []).filter((onset) => byOnset.get(onset)![lane]);
      const offsets = Array.from(new Set([0, ...attacks.map((onset) => onset - start), beatTicks])).sort((a, b) => a - b);
      const unit = offsets.reduce((divisor, offset) => gcd(divisor, offset), beatTicks);
      const divisions = beatTicks / unit;
      const equal = divisions <= MAX_LOCAL_DIVISIONS;
      const boundaries = equal ? Array.from({ length: divisions + 1 }, (_, index) => index * unit) : offsets;
      cells += boundaries.length - 1;
      if (cells > MAX_CELLS) return { ok: false, reason: 'Rhythm rendering budget exceeded' };
      const children: RhythmNode[] = boundaries.slice(0, -1).map((offset, index) => {
        const ticks = boundaries[index + 1] - offset;
        const item = byOnset.get(start + offset)?.[lane];
        return item
          ? { kind: 'event', ticks, gateTicks: item.event.source!.durationTicks, source: item }
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
  return { ok: true, expression: `${expression}.slow(${span.durationSeconds / span.cycleDurationSeconds})`, rhythm };
};

type Attribute = 'value' | 'gate' | 'velocity';
const leaves = (node: RhythmNode): Extract<RhythmNode, { kind: 'event' }>[] =>
  node.kind === 'event' ? [node] : node.kind === 'rest' ? [] : node.children.flatMap(leaves);

const emitMini = (node: RhythmNode, attribute: Attribute, config: StrudelConfig): string => {
  if (node.kind === 'rest') return '~';
  if (node.kind === 'event') {
    if (attribute === 'gate') return String(node.gateTicks / node.ticks);
    if (attribute === 'velocity') return String(node.source.event.velocity);
    return String(node.source.value);
  }
  const unit = node.children.reduce((divisor, child) => gcd(divisor, child.ticks), node.children[0]?.ticks ?? 1);
  const equal = node.children.every((child) => child.ticks === node.children[0].ticks);
  const tokens = node.children.map((child) => {
    const value = emitMini(child, attribute, config);
    return equal ? value : `${value}@${child.ticks / unit}`;
  });
  const chunkSize = Math.max(1, config.measuresPerLine);
  const wrap = node.kind === 'sequence' && ((node.grouping === 'song' && config.formatPerLineBy === 'measure')
    || (['subdivision', 'weighted'].includes(node.grouping) && config.formatPerLineBy === 'note'));
  const text = wrap
    ? tokens.map((token, index) => `${index && index % chunkSize === 0 ? '\n    ' : index ? ' ' : ''}${token}`).join('')
    : tokens.join(' ');
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
      ? `.clip(${gates[0]})` : `.clip(\`${emitMini(node, 'gate', config)}\`)`;
  }
  if (config.includeVelocity) {
    const velocities = notes.map((leaf) => leaf.source.event.velocity);
    expression += velocities.every((velocity) => velocity === velocities[0])
      ? `.velocity(${velocities[0]})` : `.velocity(\`${emitMini(node, 'velocity', config)}\`)`;
  }
  return expression;
};
