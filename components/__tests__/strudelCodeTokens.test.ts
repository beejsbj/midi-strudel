import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { convertMidi } from '../../services/convertMidi';
import { evaluateGeneratedStrudelCode } from '../../services/__tests__/helpers/strudelRuntime';
import {
  extractChainCallRanges,
  extractDegreeTokens,
  extractRestTokens,
  scaleDegreeToMidi,
} from '../strudelCodeTokens';

const noteMidi = (value: unknown): number => {
  if (typeof value === 'number') return value;
  const match = /^([A-Ga-g])([#b]*)(-?\d+)$/.exec(String(value))!;
  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1].toUpperCase()]!;
  return (Number(match[3]) + 1) * 12 + semitone + [...match[2]].reduce((sum, c) => sum + (c === '#' ? 1 : -1), 0);
};

describe('scale degree tokens', () => {
  it('follows Strudel scale steps, including octaves below the tonic', () => {
    expect(scaleDegreeToMidi(0, 'E4:major')).toBe(64);
    expect(scaleDegreeToMidi(2, 'E4:major')).toBe(68);
    expect(scaleDegreeToMidi(7, 'E4:major')).toBe(76);
    expect(scaleDegreeToMidi(-1, 'E4:major')).toBe(63);
    expect(scaleDegreeToMidi(-5, 'E4:major')).toBe(56);
    expect(scaleDegreeToMidi(0, 'nonsense')).toBeNull();
  });

  it.each(['colon', 'chained'] as const)('colours every %s degree with the pitch Strudel plays there', async (controlSyntax) => {
    const bytes = await readFile(new URL('../../public/examples/ruthlessness-epic-the-musical.mid', import.meta.url));
    const result = convertMidi(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      'ruthlessness.mid', { notationType: 'relative', controlSyntax });
    const tokens = new Map(extractDegreeTokens(result.code).map((token) => [token.from, token]));
    const runtime = await evaluateGeneratedStrudelCode(result.code, { exactBpm: result.config.bpm });
    try {
      const pitched = runtime.querySeconds(0, result.sharedSpanSeconds).filter((event) => event.value.note !== undefined);
      expect(pitched.length).toBeGreaterThan(100);
      for (const event of pitched) {
        // The degree token is the location that starts on a number.
        const token = event.locations.map((location) => tokens.get(location.start)).find(Boolean);
        expect(token, `no token for event at ${JSON.stringify(event.locations)}`).toBeDefined();
        expect(token!.midi).toBe(noteMidi(event.value.note));
      }
    } finally { runtime.stop(); }
  });

  it('reads accidentals and skips fields, weights and counts', () => {
    const code = 'const p = {\n  a: `[0 2#:0.5@3] 1b!2`\n    .as("n:clip").scale("C4:major"),\n};\n';
    const tokens = extractDegreeTokens(code).map((token) => [code.slice(token.from, token.to), token.midi]);
    expect(tokens).toEqual([['0', 60], ['2#', 65], ['1b', 61]]);
  });

  it('leaves note-name phrases and phrases without a scale alone', () => {
    expect(extractDegreeTokens('const p = {\n  a: note(`C4 D4`),\n  b: n(`0 1`),\n};\n')).toEqual([]);
  });
});

describe('rest and chain call ranges', () => {
  it('finds rests only inside mini-notation strings', () => {
    const code = '$a: "<~@2 a>"\n  .pickRestart(p);\nconst x = ~1;';
    expect(extractRestTokens(code).map((range) => code.slice(range.from, range.to))).toEqual(['~']);
  });

  it('dims whole constant calls and only the name and parens of pattern calls', () => {
    const code = 'a: n(`0 1`)\n  .clip(`1 0.5`)\n  .scale("C4:major"),\n$a: "<a>"\n  .pickRestart(p)\n  .color(\'hsl(0,60%,60%)\');';
    expect(extractChainCallRanges(code).map((range) => code.slice(range.from, range.to)))
      .toEqual(['.clip(', ')', '.scale("C4:major")', '.pickRestart(p)', ".color('hsl(0,60%,60%)')"]);
  });
});
