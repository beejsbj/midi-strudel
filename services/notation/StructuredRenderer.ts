import type { StrudelConfig, Track } from '../../types';
import type { EffectiveEvent } from './EffectiveEvents';
import type { SharedLiteralSpan } from './LiteralRenderer';
import { assessSourceTimingEligibility } from './SourceEligibility';
import { numberExpression, ratioExpression, roundedDecimal, snappedRatio } from './NumberFormat';

export interface StructuredEvent {
  event: EffectiveEvent;
  value: string | number;
}

/** Integer tick spans retain rational timing until the final gate serialization. */
export type RhythmNode =
  | { kind: 'rest'; ticks: number }
  | { kind: 'event'; ticks: number; gateTicks: number; sources: StructuredEvent[]; sourceGateTicks: number[] }
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
  const colon = config.controlSyntax === 'colon';
  const chordsByOnset = new Map<number, StructuredEvent[][]>();
  for (const [onset, group] of byOnset) {
    group.sort((a, b) => a.event.midi - b.event.midi
      || durations.get(a.event)! - durations.get(b.event)!
      || a.event.velocity - b.event.velocity || a.event.id.localeCompare(b.event.id));
    // Chained controls give a chord one gate and velocity, so differing members
    // need separate lanes. Colon fields travel with each note: one chord.
    const matchingControls = new Map<string, StructuredEvent[]>();
    for (const item of group) {
      const key = colon ? '' : `${durations.get(item.event)}:${config.includeVelocity ? item.event.velocity : ''}`;
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
        if (!sources) return { kind: 'rest', ticks };
        const sourceGateTicks = sources.map((source) => durations.get(source.event)!);
        return { kind: 'event', ticks, gateTicks: Math.max(...sourceGateTicks), sources, sourceGateTicks };
      });
      beats.push({ kind: 'sequence', ticks: beatTicks, grouping: equal ? 'subdivision' : 'weighted', children });
    }
    const measures: RhythmNode[] = [];
    for (let index = 0; index < beats.length; index += meter.numerator) {
      const children = beats.slice(index, index + meter.numerator);
      measures.push(simplify({ kind: 'sequence', ticks: children.length * beatTicks, grouping: 'measure', children }));
    }
    lanes.push({ kind: 'sequence', ticks: spanTicks, grouping: 'song', children: measures });
  }
  const rhythm: RhythmNode = { kind: 'stack', ticks: spanTicks, children: lanes };
  const measureTicks = meter.numerator * beatTicks;
  // `<...>` gives each whole measure one cycle; a partial measure would be stretched.
  const measureSteps = spanTicks % measureTicks === 0;
  const expression = emitRhythm(rhythm, control, config, measureSteps);
  const scaleSuffix = control === 'n' && scale !== undefined ? `.scale(${JSON.stringify(scale)})` : '';
  const cycles = snappedRatio((measureSteps ? measureTicks : spanTicks) * secondsPerTick / span.cycleDurationSeconds);
  const slowSuffix = cycles === 1 ? '' : `.slow(${numberExpression(cycles)})`;
  return { ok: true, expression: `${expression}${scaleSuffix}${slowSuffix}`, rhythm };
};

type EventNode = Extract<RhythmNode, { kind: 'event' }>;
type Attribute = 'value' | 'gate' | 'velocity';
type Field = 'velocity' | 'clip';
const leaves = (node: RhythmNode): EventNode[] =>
  node.kind === 'event' ? [node] : node.kind === 'rest' ? [] : node.children.flatMap(leaves);

/**
 * Held notes become structure: an event absorbs following rest siblings its
 * gate fully covers, an all-rest group is one rest, and a group reduced to one
 * child is that child. Bottom-up, so a note held through whole beats reaches
 * the measure level. Partially covered rests stay; the gate then rings (clip > 1).
 */
const simplify = (node: RhythmNode): RhythmNode => {
  if (node.kind !== 'sequence') return node;
  const children: RhythmNode[] = [];
  for (const child of node.children.map(simplify)) {
    const previous = children[children.length - 1];
    if (child.kind === 'rest' && previous?.kind === 'event' && previous.gateTicks >= previous.ticks + child.ticks) {
      children[children.length - 1] = { ...previous, ticks: previous.ticks + child.ticks };
    } else {
      children.push(child);
    }
  }
  if (children.every((child) => child.kind === 'rest')) return { kind: 'rest', ticks: node.ticks };
  if (children.length === 1) return { ...children[0], ticks: node.ticks };
  // Adjacent rests merge only when that coarsens the grid: `[X@2 ~ ~]` reads
  // as `[X ~]`, while a staccato grid such as `[X ~ ~ Y]` stays as written.
  const merged: RhythmNode[] = [];
  for (const child of children) {
    const previous = merged[merged.length - 1];
    if (child.kind === 'rest' && previous?.kind === 'rest') merged[merged.length - 1] = { kind: 'rest', ticks: previous.ticks + child.ticks };
    else merged.push(child);
  }
  const unit = (items: RhythmNode[]) => items.reduce((divisor, child) => gcd(divisor, child.ticks), 0);
  return { ...node, children: unit(merged) > unit(children) ? merged : children };
};

const repeatCounts = <T>(items: T[], same: (a: T, b: T) => boolean): Array<{ item: T; count: number }> => {
  const runs: Array<{ item: T; count: number }> = [];
  for (const item of items) {
    const last = runs[runs.length - 1];
    if (last && same(last.item, item)) last.count += 1; else runs.push({ item, count: 1 });
  }
  return runs;
};

const noteToken = (node: EventNode, attribute: Attribute, fields: Field[]): string => {
  // Mini '/' slows patterns, and the pinned REPL discards template literal
  // interpolation, so changing controls are three-decimal numbers.
  if (attribute === 'gate') return roundedDecimal(node.gateTicks / node.ticks);
  if (attribute === 'velocity') return roundedDecimal(node.sources[0].event.velocity);
  const values = node.sources.map((source, index) => {
    const extra = fields.map((field) => field === 'velocity'
      ? roundedDecimal(source.event.velocity)
      : roundedDecimal(node.sourceGateTicks[index] / node.ticks));
    // A trailing clip of 1 is the default; the field can be left off.
    while (fields[extra.length - 1] === 'clip' && extra[extra.length - 1] === '1') extra.pop();
    return [String(source.value), ...extra].join(':');
  });
  return values.length === 1 ? values[0] : `[${values.join(',')}]`;
};

/** One bracketed group, or its bare contents at the top of a passage. */
const emitGroup = (node: RhythmNode, attribute: Attribute, fields: Field[]): string => {
  if (node.kind === 'rest') return '~';
  if (node.kind === 'event') return noteToken(node, attribute, fields);
  const text = segments(node, attribute, fields).map(({ text: segment }) => segment).join(' ');
  return node.kind === 'sequence' && node.children.length > 1 ? `[${text}]` : text;
};

/** A sequence's children as tokens with weights and the attacks they hold. */
const segments = (node: RhythmNode, attribute: Attribute, fields: Field[]): Array<{ text: string; attacks: number }> => {
  if (node.kind !== 'sequence') return [{ text: emitGroup(node, attribute, fields), attacks: leaves(node).length }];
  const unit = node.children.reduce((divisor, child) => gcd(divisor, child.ticks), node.children[0].ticks);
  const equal = node.children.every((child) => child.ticks === node.children[0].ticks);
  const tokens = node.children.map((child) => {
    const weight = child.ticks / unit;
    return { text: `${emitGroup(child, attribute, fields)}${equal || weight === 1 ? '' : `@${weight}`}`, attacks: leaves(child).length };
  });
  // Combining `@weight!count` changes weighted support in the pinned mini
  // parser. Repetition is only shorthand for equal-duration siblings.
  if (!equal) return tokens;
  return repeatCounts(tokens, (a, b) => a.text === b.text).map(({ item, count }) =>
    ({ text: count > 1 ? `${item.text}!${count}` : item.text, attacks: item.attacks * count }));
};

/**
 * Lay out one lane. Whole measures become `<...>` steps (one cycle each).
 * Measure wrapping counts measures, including those folded into `m!n`; note
 * wrapping counts attacks and breaks only between beats or measures.
 */
const layoutLane = (lane: RhythmNode, attribute: Attribute, fields: Field[], config: StrudelConfig, measureSteps: boolean): string => {
  const measures = lane.kind === 'sequence' ? lane.children : [lane];
  const perLine = Math.max(1, config.measuresPerLine);
  const lines: string[][] = [[]];
  let count = 0;
  const place = (text: string, amount: number) => {
    if (count >= perLine && lines[lines.length - 1].length) { lines.push([]); count = 0; }
    lines[lines.length - 1].push(text);
    count += amount;
  };
  if (!measureSteps) {
    // Rare partial final measure: the whole lane is one bracketed cycle.
    const text = measures.map((measure) => emitGroup(measure, attribute, fields)).join(' ');
    return measures.length > 1 ? `[${text}]` : text;
  }
  const multiStep = measures.length > 1;
  const runs = repeatCounts(measures.map((measure) => ({ measure, text: emitGroup(measure, attribute, fields) })),
    (a, b) => a.text === b.text);
  for (const { item, count: repeats } of runs) {
    const folded = repeats > 1 ? `${item.text}!${repeats}` : item.text;
    if (!multiStep && config.formatPerLineBy === 'measure') {
      place(segments(item.measure, attribute, fields).map((part) => part.text).join(' '), 1);
      continue;
    }
    if (config.formatPerLineBy === 'measure' || repeats > 1 || item.measure.kind !== 'sequence') {
      place(folded, config.formatPerLineBy === 'measure' ? repeats : leaves(item.measure).length * repeats);
      continue;
    }
    // A measure's beats may break across lines; a `<...>` step keeps its brackets.
    const beats = segments(item.measure, attribute, fields);
    beats.forEach((beat, index) => place(
      `${multiStep && index === 0 ? '[' : ''}${beat.text}${multiStep && index === beats.length - 1 ? ']' : ''}`,
      beat.attacks));
  }
  const rows = lines.map((row) => row.join(' '));
  if (multiStep) return rows.length === 1 ? `<${rows[0]}>` : `<\n  ${rows.join('\n  ')}\n>`;
  return rows.length === 1 ? rows[0] : `\n  ${rows.join('\n  ')}\n`;
};

const emitRhythm = (node: RhythmNode, control: StructuredRhythmInput['control'], config: StrudelConfig, measureSteps: boolean): string => {
  if (node.kind === 'stack') {
    const expressions = node.children.map((child) => emitRhythm(child, control, config, measureSteps));
    return expressions.length === 1 ? expressions[0]
      : `stack(\n  ${expressions.map((expression) => expression.replace(/\n/g, '\n  ')).join(',\n  ')}\n)`;
  }
  const notes = leaves(node);
  if (!notes.length) return 'silence';
  const gates = notes.flatMap((leaf) => leaf.sourceGateTicks.map((gate) => gate / leaf.ticks));
  const velocities = notes.flatMap((leaf) => leaf.sources.map((source) => source.event.velocity));
  const gatesVary = gates.some((gate) => gate !== gates[0]);
  const velocitiesVary = config.includeVelocity && velocities.some((velocity) => velocity !== velocities[0]);
  const colon = config.controlSyntax === 'colon';
  const fields: Field[] = colon ? [...(velocitiesVary ? ['velocity' as const] : []), ...(gatesVary ? ['clip' as const] : [])] : [];
  // Template literals keep source beat/measure layout visible to the musician.
  const mini = (attribute: Attribute) => `\`${layoutLane(node, attribute, fields, config, measureSteps)}\``;
  let expression = fields.length
    ? `${mini('value')}.as(${JSON.stringify([control, ...fields].join(':'))})`
    : `${control}(${mini('value')})`;
  if (!gatesVary && gates[0] !== 1) {
    const leaf = notes[0];
    expression += `.clip(${constantExpression(leaf.sourceGateTicks[0], leaf.ticks)})`;
  } else if (gatesVary && !colon) {
    expression += `.clip(${mini('gate')})`;
  }
  if (config.includeVelocity && !velocitiesVary) {
    expression += `.velocity(${roundedDecimal(velocities[0])})`;
  } else if (velocitiesVary && !colon) {
    expression += `.velocity(${mini('velocity')})`;
  }
  return expression;
};

/** Constant JS arguments: a small exact fraction, else three decimals. */
const constantExpression = (numerator: number, denominator: number): string => {
  const exact = ratioExpression(numerator, denominator);
  return /^-?\d+(\/\d{1,2})?$/.test(exact) ? exact : roundedDecimal(numerator / denominator);
};
