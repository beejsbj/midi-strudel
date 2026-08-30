import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const fixture = 'public/examples/ruthlessness-epic-the-musical.mid';

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
    const result = runCli(fixture, '--format', 'json');

    expect(result.status).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      input: 'ruthlessness-epic-the-musical.mid',
      code: expect.stringContaining('setcps('),
      url: expect.stringMatching(/^https:\/\/strudel\.cc\/#/),
    });
    expect(result.stderr).toContain('Unmapped MIDI drum note dropped');
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
});
