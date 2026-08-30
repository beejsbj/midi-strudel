import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseArgs } from '../midi-strudel';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const fixture = 'public/examples/ruthlessness-epic-the-musical.mid';
const denseFixture = 'public/examples/warrior-of-the-mind-epic-the-musical.mid';
let temporaryDirectory: string;
let midiFixture: string;

beforeAll(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'midi-strudel-cli-'));
  midiFixture = join(temporaryDirectory, 'ruthlessness-epic-the-musical.midi');
  copyFileSync(join(repoRoot, fixture), midiFixture);
});

afterAll(() => {
  rmSync(temporaryDirectory, { force: true, recursive: true });
});

const results = new Map<string, SpawnSyncReturns<string>>();
const runCli = (...args: string[]): SpawnSyncReturns<string> => {
  const key = JSON.stringify(args);
  const cached = results.get(key);
  if (cached) return cached;

  const result = spawnSync(
    'npm',
    ['run', '--silent', 'convert', '--', ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 20_000,
    },
  );
  results.set(key, result);
  return result;
};

describe('midi-strudel CLI', () => {
  it('emits Strudel code on stdout for a real MIDI file', () => {
    const result = runCli(fixture, '--format', 'code');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('// @title ruthlessness-epic-the-musical');
    expect(result.stdout).toContain('setcps(');
  });

  it('emits schema-versioned JSON while keeping diagnostics on stderr', () => {
    const result = runCli(denseFixture, '--format', 'json');
    const parsed = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(parsed).toMatchObject({
      schemaVersion: 1,
      input: 'warrior-of-the-mind-epic-the-musical.mid',
      code: expect.stringContaining('setcps('),
      url: expect.stringMatching(/^https:\/\/strudel\.cc\/#/),
      diagnostics: [
        { code: 'unmapped-drum-note', midiNote: 31, count: 85 },
        { code: 'unmapped-drum-note', midiNote: 74, count: 1 },
        { code: 'unmapped-drum-note', midiNote: 78, count: 1 },
        { code: 'unmapped-drum-note', midiNote: 83, count: 47 },
        { code: 'unmapped-drum-note', midiNote: 85, count: 159 },
      ],
    });
    expect(result.stderr.trim().split('\n')).toHaveLength(5);
    expect(result.stderr).toContain('Dropped 85 unmapped drum note events for MIDI 31');
    expect(result.stderr).toContain('Dropped 159 unmapped drum note events for MIDI 85');
  });

  it('emits a Strudel URL whose base64 fragment decodes to the emitted code', () => {
    const codeResult = runCli(fixture, '--format', 'code');
    const urlResult = runCli(fixture, '--format', 'url');
    const url = new URL(urlResult.stdout.trim());

    expect(codeResult.status).toBe(0);
    expect(urlResult.status).toBe(0);
    expect(Buffer.from(url.hash.slice(1), 'base64').toString('utf8'))
      .toBe(codeResult.stdout);
  });

  it.each(['code', 'url'] as const)(
    'keeps dense %s stdout clean while reporting bounded diagnostics',
    (format) => {
      const result = runCli(denseFixture, '--format', format);

      expect(result.status).toBe(0);
      expect(result.stderr.trim().split('\n')).toHaveLength(5);
      expect(result.stdout).not.toContain('midi-strudel: warning');
      if (format === 'code') {
        expect(result.stdout).toMatch(/^\/\/ @title warrior-of-the-mind-epic-the-musical/);
      } else {
        expect(result.stdout.trim()).toMatch(/^https:\/\/strudel\.cc\/#/);
        expect(result.stdout.trim().split('\n')).toHaveLength(1);
      }
    },
  );

  it('returns a meaningful nonzero exit when the input is missing', () => {
    const result = runCli('--format', 'code');

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('a .mid or .midi input file is required');
  });

  it('returns a meaningful nonzero exit when the MIDI path does not exist', () => {
    const result = runCli('missing.mid');

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('missing.mid');
  });

  it('accepts a real MIDI file with the .midi extension', () => {
    const result = runCli(midiFixture, '--format', 'code');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('setcps(');
  });
});

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
    expect(() => parseArgs(['--duration-precision', '9', 'song.mid']))
      .toThrow('--duration-precision must be <= 8');
  });
});
