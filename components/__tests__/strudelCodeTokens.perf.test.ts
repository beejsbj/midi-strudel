import MidiPackage from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { convertMidi } from '../../services/convertMidi';
import { extractDegreeTokensSlicing } from './helpers/slicingDegreeTokens';
import { extractChainCallRanges, extractDegreeTokens, extractRestTokens } from '../strudelCodeTokens';

const { Midi } = MidiPackage;

/** Generous: the linear scans take tens of milliseconds; the quadratic ones took 10+ seconds. */
const BUDGET_MS = 1000;

const timed = <T>(scan: () => T) => {
  const start = performance.now();
  const result = scan();
  return { result, ms: performance.now() - start };
};

describe('editor token scans on large scores', () => {
  // A tempo-changing 10,000-note song is converted as precise literals: one
  // string and several chained calls per note, the worst case for the scans.
  const literalScore = () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    midi.header.tempos.push({ ticks: 480 * 4, bpm: 140 } as never);
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4], measures: 0 });
    const track = midi.addTrack();
    for (let index = 0; index < 10_000; index++) {
      track.addNote({ midi: 48 + (index * 7) % 30, ticks: index * 120 + (index % 3) * 7,
        durationTicks: 100 + (index % 5) * 13, velocity: 0.5 + (index % 4) / 10 });
    }
    return convertMidi(midi.toArray().buffer, 'big.mid').code;
  };

  it('scans chained calls and rests in linear time', () => {
    const code = literalScore();
    const calls = timed(() => extractChainCallRanges(code));
    const rests = timed(() => extractRestTokens(code));
    expect(code.length).toBeGreaterThan(500_000);
    expect(calls.result.length).toBeGreaterThan(10_000);
    expect(calls.ms).toBeLessThan(BUDGET_MS);
    expect(rests.ms).toBeLessThan(BUDGET_MS);
  });

  it('scans relative-degree phrases in linear time', () => {
    // Phrase keys are letters (a, b, ... aa, ab), as the converter writes them.
    const key = (index: number) => index.toString(26).replace(/./g, (digit) => String.fromCharCode(97 + parseInt(digit, 26)));
    const entries = Array.from({ length: 10_000 }, (_, index) =>
      `  ${key(index)}: n(\`0 2 4 ${index % 7} ~ 3\`)\n    .scale("C:major"),`);
    const code = `const lead = {\n${entries.join('\n')}\n};\n`;
    const degrees = timed(() => extractDegreeTokens(code));
    expect(degrees.result.length).toBeGreaterThanOrEqual(50_000);
    expect(degrees.ms).toBeLessThan(BUDGET_MS);
  });

  it('scans one entry of thousands of degree literals in linear time', () => {
    const entry = (literals: number) => `const lead = {\n  a: ${Array.from({ length: literals },
      (_, index) => `n(\`${index % 7} 2\`)`).join('.add(')}\n    .scale("C:major"),\n};\n`;
    const small = entry(1_250);
    const large = entry(5_000);
    const oldSmall = timed(() => extractDegreeTokensSlicing(small));
    const oldLarge = timed(() => extractDegreeTokensSlicing(large));
    const fast = timed(() => extractDegreeTokens(large));
    expect(fast.result).toEqual(oldLarge.result);
    expect(fast.result).toHaveLength(10_000);
    console.log(`degree scan, 5,000 literals: old ${oldLarge.ms.toFixed(0)}ms (1,250: ${oldSmall.ms.toFixed(0)}ms), new ${fast.ms.toFixed(0)}ms`);
    expect(fast.ms).toBeLessThan(BUDGET_MS);
    // The slicing scan grows faster than the literal count (its copies are cheap, so the
    // margin is modest and left unasserted); the new scan must beat it by a wide margin.
    expect(fast.ms).toBeLessThan(oldLarge.ms / 5);
  });
});
