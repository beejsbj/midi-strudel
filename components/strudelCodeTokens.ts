import { Interval, Note, Scale } from '@tonaljs/tonal';

/**
 * Text scans over generated Strudel code for editor decoration. They read the
 * code as text, so they work on whatever the user has edited, and they skip
 * anything they cannot read with certainty rather than guess.
 */

/**
 * The MIDI pitch `n(step).scale(scale)` plays: Strudel's own scaleStep
 * (@strudel/tonal 1.2.2), which steps through the scale's intervals from the
 * tonic, default octave 3. Null for a scale Strudel would reject.
 */
export const scaleDegreeToMidi = (step: number, scale: string): number | null => {
  const { intervals, tonic, empty } = Scale.get(scale.replaceAll(':', ' '));
  if (empty || !tonic) return null;
  const { pc, oct = 3 } = Note.get(tonic);
  const octaves = Math.floor(Math.ceil(step) / intervals.length);
  const index = ((Math.ceil(step) % intervals.length) + intervals.length) % intervals.length;
  const interval = Interval.add(intervals[index], `${(octaves <= 0 ? -1 : 1) + octaves * 7}P`);
  return Note.midi(Note.transpose(`${pc}${oct}`, interval ?? '')) ?? null;
};

export type CodeRange = { from: number; to: number };
export type PitchedRange = CodeRange & { midi: number };

type StringLiteral = CodeRange & { body: string; bodyFrom: number };

/** Backtick and double-quoted strings, the two the REPL reads as mini-notation. */
const findStrings = (content: string): StringLiteral[] => {
  const strings: StringLiteral[] = [];
  for (const match of content.matchAll(/`[^`]*`|"(?:[^"\\\n]|\\.)*"/g)) {
    const from = match.index!;
    strings.push({ from, to: from + match[0].length, body: match[0].slice(1, -1), bodyFrom: from + 1 });
  }
  return strings;
};

const ENTRY_BOUNDARY = /\n\s*[a-z]+: |\n\};|\n\$/g;

/**
 * A phrase entry ends at the next object key, closing brace, or track line.
 * Searches the full string from `from` (the pattern has no anchors or
 * lookbehind, so that matches searching the tail). Calls must come with
 * non-decreasing `from`: no boundary starts in `[lastFrom, lastBoundary)`, so a
 * `from` inside that span has the same answer and costs nothing.
 */
const createEntryEnd = (content: string) => {
  let lastFrom = -1;
  let lastEnd = -1;
  return (from: number): number => {
    if (from >= lastFrom && from <= lastEnd) return lastEnd;
    ENTRY_BOUNDARY.lastIndex = from;
    const boundary = ENTRY_BOUNDARY.exec(content);
    lastFrom = from;
    lastEnd = boundary ? boundary.index : content.length;
    return lastEnd;
  };
};

/**
 * Scale degrees in relative phrases, resolved to the MIDI pitch Strudel plays.
 * A degree lane is `n(\`...\`)` or a colon string read with `.as("n...")`;
 * its scale is the first `.scale("...")` before the phrase entry ends.
 */
export const extractDegreeTokens = (content: string): PitchedRange[] => {
  const tokens: PitchedRange[] = [];
  // A score repeats a handful of (degree, scale) pairs; resolve each once.
  const resolved = new Map<string, number | null>();
  const pitchOf = (step: number, scale: string) => {
    const key = `${scale}\0${step}`;
    if (!resolved.has(key)) resolved.set(key, scaleDegreeToMidi(step, scale));
    return resolved.get(key)!;
  };
  const entryEnd = createEntryEnd(content);
  // The first `.scale("...")` at or after the previous literal; reused until a
  // literal passes it, so a long entry of literals is scanned once.
  const scaleCall = /\.scale\("([^"]+)"\)/g;
  let scaleMatch: RegExpExecArray | null = null;
  let scaleFrom = -1;
  const scaleAfter = (from: number) => {
    if (scaleFrom < 0 || from < scaleFrom || (scaleMatch && from > scaleMatch.index)) {
      scaleCall.lastIndex = from;
      scaleMatch = scaleCall.exec(content);
      scaleFrom = from;
    }
    return scaleMatch;
  };
  for (const literal of findStrings(content)) {
    if (!literal.body.length || content[literal.from] !== '`') continue;
    const before = content.slice(Math.max(0, literal.from - 2), literal.from);
    const after = content.slice(literal.to, literal.to + 40);
    if (before !== 'n(' && !/^\s*\.as\("n[:"]/.test(after)) continue;
    const end = entryEnd(literal.to);
    // The call must lie wholly inside the entry; one straddling `end` is not
    // found by searching the entry alone, nor is any later one.
    const call = scaleAfter(literal.to);
    const scale = call && call.index + call[0].length <= end ? call[1] : undefined;
    if (!scale) continue;
    // A degree starts a step or chord member; `:` fields, `@` weights and `!`
    // counts are numbers too, but never follow these characters.
    for (const match of literal.body.matchAll(/(?<=^|[\s[<,])(-?\d+)(#+|b+)?(?=$|[\s\]>,:@!*/])/g)) {
      let midi = pitchOf(Number(match[1]), scale);
      if (midi === null) continue;
      const accidentals = match[2] ?? '';
      midi += accidentals.startsWith('#') ? accidentals.length : -accidentals.length;
      const from = literal.bodyFrom + match.index!;
      tokens.push({ from, to: from + match[0].length, midi });
    }
  }
  return tokens;
};

/** Every `~` rest inside a mini-notation string. */
export const extractRestTokens = (content: string): CodeRange[] => {
  const tokens: CodeRange[] = [];
  for (const literal of findStrings(content)) {
    for (const match of literal.body.matchAll(/~/g)) {
      const from = literal.bodyFrom + match.index!;
      tokens.push({ from, to: from + 1 });
    }
  }
  return tokens;
};

/**
 * Chained method calls (`.sound("gm_piano")`, `.clip(2)`, ...). A call whose
 * arguments hold a backtick pattern dims only its name and parentheses, so the
 * pattern inside keeps its playback highlight.
 */
export const extractChainCallRanges = (content: string): CodeRange[] => {
  const ranges: CodeRange[] = [];
  const strings = findStrings(content);
  // Literals are sorted and disjoint: look them up by start offset, and find
  // the one that could contain an index by binary search.
  const byStart = new Map(strings.map((literal) => [literal.from, literal]));
  const inString = (index: number) => {
    let low = 0;
    let high = strings.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (strings[mid].from < index) low = mid + 1; else high = mid;
    }
    const literal = strings[low - 1];
    return literal !== undefined && index < literal.to - 1;
  };
  for (const match of content.matchAll(/\.[A-Za-z_$][\w$]*\(/g)) {
    const from = match.index!;
    if (inString(from)) continue;
    // Find the matching close paren, stepping over strings.
    let depth = 0;
    let close = -1;
    let hasPattern = false;
    for (let index = from + match[0].length - 1; index < content.length; index++) {
      const literal = byStart.get(index);
      if (literal) {
        if (content[index] === '`') hasPattern = true;
        index = literal.to - 1;
        continue;
      }
      if (content[index] === '(') depth++;
      else if (content[index] === ')' && --depth === 0) { close = index; break; }
    }
    if (close < 0) continue;
    if (hasPattern) {
      ranges.push({ from, to: from + match[0].length }, { from: close, to: close + 1 });
    } else {
      ranges.push({ from, to: close + 1 });
    }
  }
  return ranges.sort((a, b) => a.from - b.from);
};
