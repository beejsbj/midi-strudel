import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { convertMidi } from '../convertMidi';

const fixtureUrl = new URL('../../public/examples/warrior-of-the-mind-epic-the-musical.mid', import.meta.url);

const asArrayBuffer = (bytes: Buffer): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

describe('convertMidi', () => {
  it('converts a representative MIDI deterministically and creates a decodable Strudel link', async () => {
    const bytes = await readFile(fileURLToPath(fixtureUrl));
    const first = convertMidi(asArrayBuffer(bytes), 'example.mid');
    const second = convertMidi(asArrayBuffer(bytes), 'example.mid');

    expect(first).toEqual(second);
    expect(first.code).toContain('// @title example');
    expect(first.tracks.length).toBeGreaterThan(0);
    expect(first.link).toMatch(/^https:\/\/strudel\.cc\/#/);

    const payload = first.link.split('#')[1];
    expect(new TextDecoder().decode(Uint8Array.from(atob(payload), (char) => char.charCodeAt(0))))
      .toBe(first.code);
  });

  it('rejects invalid MIDI bytes', () => {
    expect(() => convertMidi(new TextEncoder().encode('not midi').buffer, 'invalid.mid'))
      .toThrow('Failed to parse MIDI file');
  });

  it('keeps filename line breaks out of generated title metadata', async () => {
    const bytes = await readFile(fileURLToPath(fixtureUrl));
    const result = convertMidi(asArrayBuffer(bytes), 'safe\nsetcps(999)\u2028title.mid');

    expect(result.config.fileName).toBe('safe setcps(999) title');
    expect(result.code.split('\n')[0]).toBe('// @title safe setcps(999) title');
  });
});
