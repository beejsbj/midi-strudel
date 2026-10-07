import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { convertMidi } from '../../services/convertMidi';
import { extractDegreeTokens } from '../strudelCodeTokens';
import { extractDegreeTokensSlicing } from './helpers/slicingDegreeTokens';

const expectSame = (code: string) => {
  const expected = extractDegreeTokensSlicing(code);
  expect(extractDegreeTokens(code)).toEqual(expected);
  return expected;
};

describe('extractDegreeTokens matches the slicing implementation', () => {
  it.each<[string, string, number]>([
    ['multiple entries', 'const lead = {\n  a: n(`0 2 4`)\n    .scale("C:major"),\n  b: n(`1 3`)\n    .scale("D:minor"),\n};\n', 5],
    ['several tracks', 'const a = {\n  a: n(`0 1`)\n    .scale("C:major"),\n};\n$: a.a\nconst b = {\n  a: n(`2 3`)\n    .scale("E:minor"),\n};\n$: b.a\n', 4],
    ['n() and colon strings', 'const x = {\n  a: n(`0 1`)\n    .scale("C:major"),\n  b: `0:1 2:3`\n    .as("n:gate").scale("A:minor"),\n};\n', 4],
    ['entries without scale', 'const x = {\n  a: n(`0 1`)\n    .sound("piano"),\n  b: n(`2`)\n    .scale("C:major"),\n  c: n(`3`),\n};\n', 1],
    ['scale between two literals', 'const x = {\n  a: n(`0 1`).scale("C:major").add(n(`2 3`)),\n  b: n(`4`)\n    .scale("D:minor"),\n};\n', 3],
    ['a scale call straddling the entry end', 'const x = {\n  a: n(`0`).scale("C:major\n  b: ").sound("x"),\n  c: n(`1`).scale("D:minor"),\n};\n', 1],
    ['code ending without a boundary', 'a: n(`0 1`) n(`2`) .scale("C:major") n(`3`)', 3],
    ['no boundary and no scale', 'n(`0 1`) n(`2`)', 0],
    ['empty and non-degree literals', 'n(``) `0 1` n(`5`).scale("C:major") .scale("C:major")', 1],
  ])('%s', (_name, code, count) => {
    expect(expectSame(code)).toHaveLength(count);
  });

  it('agrees on generated inputs, including a boundary right at a literal end', () => {
    let seed = 12345;
    const random = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    const scales = ['C:major', 'D:minor', 'nonsense', 'E4:dorian'];
    for (let round = 0; round < 200; round++) {
      let code = '';
      for (let part = random(12) + 1; part > 0; part--) {
        const piece = random(8);
        const degrees = Array.from({ length: random(4) + 1 }, () => random(15) - 7).join(' ');
        if (piece === 0) code += `\n  ${'abc'[random(3)]}: `;
        else if (piece === 1) code += '\n};\n$: x\n';
        else if (piece === 2) code += `n(\`${degrees}\`)`;
        else if (piece === 3) code += `\`${degrees}\`.as("n:gate")`;
        else if (piece === 4) code += `.scale("${scales[random(4)]}")`;
        else if (piece === 5) code += `.scale("${scales[random(4)]}\n  z: ")`;
        else if (piece === 6) code += '\n';
        else code += '.sound("piano")';
      }
      expectSame(code);
    }
  });

  it.each(['colon', 'chained'] as const)('agrees on both bundled songs, %s syntax', async (controlSyntax) => {
    for (const file of ['warrior-of-the-mind-epic-the-musical.mid', 'ruthlessness-epic-the-musical.mid']) {
      const bytes = await readFile(new URL(`../../public/examples/${file}`, import.meta.url));
      const { code } = convertMidi(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        file, { notationType: 'relative', controlSyntax });
      expect(expectSame(code).length).toBeGreaterThan(100);
    }
  });
});
