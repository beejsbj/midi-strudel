import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import MidiPackage from '@tonejs/midi';
import { convertMidi } from '../convertMidi';

const { Midi } = MidiPackage;

const fixtureUrl = new URL('../../public/examples/warrior-of-the-mind-epic-the-musical.mid', import.meta.url);

const asArrayBuffer = (bytes: Buffer): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

const makePercussionMidi = (notes: number[]): ArrayBuffer => {
  const midi = new Midi();
  midi.header.setTempo(120);
  const track = midi.addTrack();
  track.name = 'Drums';
  track.channel = 9;
  notes.forEach((note, index) => {
    track.addNote({
      midi: note,
      ticks: index * 120,
      durationTicks: 120,
      velocity: 0.8,
    });
  });
  const bytes = midi.toArray();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

describe('convertMidi', () => {
  it('retains representable GM percussion and aggregates unsupported notes', () => {
    const result = convertMidi(
      makePercussionMidi([36, 43, 48, 52, 31, 31, 31]),
      'percussion.mid',
    );

    expect(result.code).toContain('lt');
    expect(result.code).toContain('ht');
    expect(result.code).toContain('cr');
    expect(result.diagnostics).toEqual([{
      code: 'unmapped-drum-note',
      severity: 'warning',
      midiNote: 31,
      count: 3,
      message: 'Dropped 3 unmapped drum note events for MIDI 31',
    }]);
  });

  it('reports an all-unsupported drum track in deterministic MIDI-note order', () => {
    const result = convertMidi(
      makePercussionMidi([85, 31, 85]),
      'unsupported.mid',
    );

    expect(result.diagnostics).toEqual([
      {
        code: 'unmapped-drum-note',
        severity: 'warning',
        midiNote: 31,
        count: 1,
        message: 'Dropped 1 unmapped drum note event for MIDI 31',
      },
      {
        code: 'unmapped-drum-note',
        severity: 'warning',
        midiNote: 85,
        count: 2,
        message: 'Dropped 2 unmapped drum note events for MIDI 85',
      },
    ]);
  });

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
