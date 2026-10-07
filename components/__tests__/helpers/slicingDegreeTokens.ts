import { scaleDegreeToMidi, type PitchedRange } from '../../strudelCodeTokens';

/** The slicing implementation `extractDegreeTokens` replaced, kept as the test oracle. */
export const extractDegreeTokensSlicing = (content: string): PitchedRange[] => {
  const strings: { from: number; to: number; body: string; bodyFrom: number }[] = [];
  for (const match of content.matchAll(/`[^`]*`|"(?:[^"\\\n]|\\.)*"/g)) {
    const from = match.index!;
    strings.push({ from, to: from + match[0].length, body: match[0].slice(1, -1), bodyFrom: from + 1 });
  }
  const entryEnd = (from: number): number => {
    const boundary = content.slice(from).search(/\n\s*[a-z]+: |\n\};|\n\$/);
    return boundary < 0 ? content.length : from + boundary;
  };
  const tokens: PitchedRange[] = [];
  for (const literal of strings) {
    if (!literal.body.length || content[literal.from] !== '`') continue;
    const before = content.slice(Math.max(0, literal.from - 2), literal.from);
    const after = content.slice(literal.to, literal.to + 40);
    if (before !== 'n(' && !/^\s*\.as\("n[:"]/.test(after)) continue;
    const end = entryEnd(literal.to);
    const scale = /\.scale\("([^"]+)"\)/.exec(content.slice(literal.to, end))?.[1];
    if (!scale) continue;
    for (const match of literal.body.matchAll(/(?<=^|[\s[<,])(-?\d+)(#+|b+)?(?=$|[\s\]>,:@!*/])/g)) {
      let midi = scaleDegreeToMidi(Number(match[1]), scale);
      if (midi === null) continue;
      const accidentals = match[2] ?? '';
      midi += accidentals.startsWith('#') ? accidentals.length : -accidentals.length;
      const from = literal.bodyFrom + match.index!;
      tokens.push({ from, to: from + match[0].length, midi });
    }
  }
  return tokens;
};
