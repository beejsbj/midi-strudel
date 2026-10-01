import type { PatternMetadata } from '../../types';
import type { DiscoveredPhrase } from './PhraseDiscovery';
import type { OneOffPassage } from './OneOffPassages';
import { ratioExpression } from './NumberFormat';
import { LINE_WIDTH } from './StructuredRenderer';

/** a..z, aa..az: compact local names independent of metadata identity. */
function phraseKey(index: number): string {
  let name = '';
  do {
    name = String.fromCharCode(97 + index % 26) + name;
    index = Math.floor(index / 26) - 1;
  } while (index >= 0);
  return name;
}

/** Repeat selectors only when ! is a literal repetition of one-bar entries. */
function compactSelectors(tokens: string[]): string {
  const compact: string[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    let count = 1;
    if (/^[a-z]+$/.test(token)) {
      while (tokens[index + count] === token) count++;
    }
    compact.push(count > 1 ? `${token}!${count}` : token);
    index += count - 1;
  }
  return compact.join(' ');
}

/**
 * The REPL transpiles double-quoted and backtick strings to mini patterns; no
 * cat() wrapper. A timeline wider than its `$label: ` line wraps into a
 * backtick block.
 */
function selectorString(selectors: string, trackKey: string): string {
  if (`$${trackKey}: "<${selectors}>"`.length <= LINE_WIDTH) return JSON.stringify(`<${selectors}>`);
  const rows: string[] = [];
  for (const token of selectors.split(' ')) {
    const last = rows[rows.length - 1];
    if (last !== undefined && 2 + last.length + 1 + token.length <= LINE_WIDTH) rows[rows.length - 1] = `${last} ${token}`;
    else rows.push(token);
  }
  return `\`<\n  ${rows.join('\n  ')}\n>\``;
}

/**
 * A track's phrases become its own object, declared just above the track line
 * that reads it. Keys follow the order phrases first play; the remainder last.
 */
export function renderPhraseTimeline(input: {
  phrases: DiscoveredPhrase[];
  passages: OneOffPassage[];
  remainderExpression?: string;
  trackId: string;
  trackIndex: number;
  trackKey: string;
  measureSeconds: number;
  cycleSeconds: number;
  sharedSpanSeconds: number;
}): { library: string; expression: string; patterns: PatternMetadata } {
  const { phrases, passages, remainderExpression, trackId, trackIndex, trackKey,
    measureSeconds, cycleSeconds, sharedSpanSeconds } = input;
  const patterns: PatternMetadata = { definitions: [], occurrences: [] };

  // Identical text shares one key, placed by its earliest start.
  const firstStart = new Map<string, number>();
  const place = (expression: string, start: number) =>
    firstStart.set(expression, Math.min(firstStart.get(expression) ?? Infinity, start));
  for (const phrase of phrases) for (const occurrence of phrase.occurrences) place(phrase.expression, occurrence.startMeasure - 1);
  for (const { window, expression } of passages) place(expression, window.startMeasure - 1);
  if (remainderExpression) place(remainderExpression, Infinity);
  const definitions = [...firstStart].sort((a, b) => a[1] - b[1])
    .map(([expression], index) => ({ key: phraseKey(index), expression }));
  const keyOf = new Map(definitions.map(({ key, expression }) => [expression, key]));

  const entries: Array<{ token: string; start: number; length: number }> = [];
  for (const [index, phrase] of phrases.entries()) {
    const key = keyOf.get(phrase.expression)!;
    // Stable discovery IDs remain independent of the emitted object path.
    const id = `track${trackIndex + 1}Phrase${index + 1}`;
    const first = phrase.occurrences[0];
    patterns.definitions.push({ id, name: `${trackKey}.${key}`, trackId, measureCount: first.measureCount,
      durationSeconds: first.durationSeconds, sourceNoteIds: first.events.map((event) => event.source!.id) });
    for (const occurrence of phrase.occurrences) {
      entries.push({ token: key, start: occurrence.startMeasure - 1, length: occurrence.measureCount });
      patterns.occurrences.push({ definitionId: id, trackId, sourceStartMeasure: occurrence.startMeasure,
        measureCount: occurrence.measureCount, startSeconds: occurrence.originSeconds,
        endSeconds: occurrence.originSeconds + occurrence.durationSeconds,
        sourceNoteIds: occurrence.events.map((event) => event.source!.id) });
    }
  }
  for (const { window, expression } of passages) {
    entries.push({ token: keyOf.get(expression)!, start: window.startMeasure - 1, length: window.measureCount });
  }
  entries.sort((a, b) => a.start - b.start);
  patterns.occurrences.sort((a, b) => a.startSeconds - b.startSeconds);
  const tokens: string[] = [];
  const token = (value: string, length: number) => length === 1 ? value : `${value}@${length}`;
  let cursor = 0;
  for (const entry of entries) {
    if (entry.start > cursor) tokens.push(token('~', entry.start - cursor));
    tokens.push(token(entry.token, entry.length));
    cursor = entry.start + entry.length;
  }
  const measures = Math.round(sharedSpanSeconds / measureSeconds);
  if (cursor < measures) tokens.push(token('~', measures - cursor));
  const slow = measureSeconds === cycleSeconds ? '' : `.slow(${ratioExpression(measureSeconds, cycleSeconds)})`;
  let expression = entries.length
    ? `${selectorString(compactSelectors(tokens), trackKey)}${slow}\n  .pickRestart(${trackKey})`
    : '';
  // A lone passage already owns the complete loop; a selector would add noise.
  if (entries.length === 1 && entries[0].start === 0 && entries[0].length === measures) {
    expression = `${trackKey}.${entries[0].token}`;
  }
  if (remainderExpression) {
    const remainder = `${trackKey}.${keyOf.get(remainderExpression)!}`;
    expression = expression ? `stack(${expression}, ${remainder})` : remainder;
  }
  const library = `const ${trackKey} = {\n${definitions.map(({ key, expression: value }) =>
    `  ${key}: ${value.replace(/\n/g, '\n  ')},`).join('\n')}\n};`;
  return { library, expression, patterns };
}
