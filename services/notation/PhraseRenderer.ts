import type { PatternMetadata } from '../../types';
import type { DiscoveredPhrase } from './PhraseDiscovery';

/** Spelling is separate from discovery: @ represents actual occupied measures. */
export function renderPhraseTimeline(input: {
  phrases: DiscoveredPhrase[];
  trackId: string;
  trackIndex: number;
  measureSeconds: number;
  cycleSeconds: number;
  sharedSpanSeconds: number;
}): { declarations: string; expression: string; patterns: PatternMetadata } {
  const { phrases, trackId, trackIndex, measureSeconds, cycleSeconds, sharedSpanSeconds } = input;
  const patterns: PatternMetadata = { definitions: [], occurrences: [] };
  const entries: Array<{ token: string; start: number; length: number }> = [];
  const names: string[] = [];
  const declarations = phrases.map((phrase, index) => {
    const name = `track${trackIndex + 1}Phrase${index + 1}`;
    names.push(name);
    const first = phrase.occurrences[0];
    patterns.definitions.push({ id: name, name, trackId, measureCount: first.measureCount,
      durationSeconds: first.durationSeconds, sourceNoteIds: first.events.map((event) => event.source!.id) });
    for (const occurrence of phrase.occurrences) {
      entries.push({ token: name, start: occurrence.startMeasure - 1, length: occurrence.measureCount });
      patterns.occurrences.push({ definitionId: name, trackId, sourceStartMeasure: occurrence.startMeasure,
        measureCount: occurrence.measureCount, startSeconds: occurrence.originSeconds,
        endSeconds: occurrence.originSeconds + occurrence.durationSeconds,
        sourceNoteIds: occurrence.events.map((event) => event.source!.id) });
    }
    return `// ${name}: source measures ${phrase.occurrences.map((window) => window.startMeasure).join(', ')}${first.measureCount > 1 ? ` (${first.measureCount} measures each)` : ''}\nconst ${name} = ${phrase.expression};\n`;
  }).join('\n');
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
  const timeline = `track${trackIndex + 1}Timeline`;
  return {
    declarations: `${declarations}\nconst ${timeline} = cat(${JSON.stringify(`<${tokens.join(' ')}>`)}).slow(${measureSeconds / cycleSeconds});\n`,
    expression: `${timeline}.pickRestart({ ${names.join(', ')} })`, patterns,
  };
}
