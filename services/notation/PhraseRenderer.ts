import type { PatternMetadata } from '../../types';
import type { DiscoveredPhrase } from './PhraseDiscovery';
import type { OneOffPassage } from './OneOffPassages';
import { ratioExpression } from './NumberFormat';

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

/** A track's values join the single score library; no generated declarations. */
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
  const entries: Array<{ token: string; start: number; length: number }> = [];
  const definitions: Array<{ key: string; expression: string }> = [];
  for (const [index, phrase] of phrases.entries()) {
    const key = phraseKey(definitions.length);
    definitions.push({ key, expression: phrase.expression });
    // Stable discovery IDs remain independent of the emitted object path.
    const id = `track${trackIndex + 1}Phrase${index + 1}`;
    const first = phrase.occurrences[0];
    patterns.definitions.push({ id, name: `phrases.${trackKey}.${key}`, trackId, measureCount: first.measureCount,
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
    const key = phraseKey(definitions.length);
    definitions.push({ key, expression });
    entries.push({ token: key, start: window.startMeasure - 1, length: window.measureCount });
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
    ? `cat(${JSON.stringify(`<${compactSelectors(tokens)}>`)})${slow}.pickRestart(phrases.${trackKey})`
    : '';
  // A lone passage already owns the complete loop; a selector would add noise.
  if (entries.length === 1 && entries[0].start === 0 && entries[0].length === measures) {
    expression = `phrases.${trackKey}.${entries[0].token}`;
  }
  if (remainderExpression) {
    const key = phraseKey(definitions.length);
    definitions.push({ key, expression: remainderExpression });
    const remainder = `phrases.${trackKey}.${key}`;
    expression = expression ? `stack(${expression}, ${remainder})` : remainder;
  }
  const library = `  ${trackKey}: {\n${definitions.map(({ key, expression: value }) =>
    `    ${key}: ${value.replace(/\n/g, '\n    ')},`).join('\n')}\n  },`;
  return { library, expression, patterns };
}
