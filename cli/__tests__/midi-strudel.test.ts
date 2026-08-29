import { describe, expect, it } from 'vitest';
import { parseArgs } from '../midi-strudel';

describe('midi-strudel arguments', () => {
  it('parses stable agent-facing conversion flags', () => {
    expect(parseArgs([
      '--format', 'json', '--bpm', '96', '--notation', 'relative',
      '--cycle-unit', 'beat', '--quantize', '--velocity', 'song.midi',
    ])).toEqual({
      input: 'song.midi',
      format: 'json',
      overrides: {
        bpm: 96,
        notationType: 'relative',
        cycleUnit: 'beat',
        isQuantized: true,
        includeVelocity: true,
      },
    });
  });

  it('rejects invalid input and invalid choices', () => {
    expect(() => parseArgs(['song.txt'])).toThrow('.mid or .midi');
    expect(() => parseArgs(['--format', 'xml', 'song.mid'])).toThrow('code, json, url');
  });
});
