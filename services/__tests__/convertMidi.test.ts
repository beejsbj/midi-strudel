import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import MidiPackage from '@tonejs/midi';
import { evalScope } from '@strudel/core';
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import * as tonal from '@strudel/tonal';
import { evaluate } from '@strudel/transpiler';
import { convertMidi } from '../convertMidi';
import { StrudelNotation } from '../StrudelNotation';
import { DEFAULT_CONFIG } from '../../types';

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

const queryConvertedOnsets = async (code: string) => {
  await evalScope(Promise.resolve(core), Promise.resolve(mini), Promise.resolve(tonal));
  (globalThis as typeof globalThis & { setcps?: (value: unknown) => void }).setcps = () => undefined;
  const expressions = [...code.matchAll(/^\$[^:]+:\s([\s\S]*?);$/gm)].map((match) => match[1]);
  const patterns = await Promise.all(expressions.map(async (expression) => (await evaluate(expression)).pattern));
  return patterns.flatMap((pattern) => pattern.queryArc(0, 2).filter((event) => event.hasOnset()).map((event) => ({
    pitch: event.value.note,
    onset: event.whole.begin.valueOf(),
    gateEnd: event.whole.begin.valueOf() + event.duration.valueOf(),
    velocity: event.value.velocity,
  }))).sort((left, right) => left.onset - right.onset || left.pitch.localeCompare(right.pitch) || (left.velocity ?? 0) - (right.velocity ?? 0));
};

describe('convertMidi', () => {
  it('retains source tick identity and complete timing maps alongside compatible seconds', () => {
    const midi = new Midi();
    midi.header.fromJSON({ ...midi.header.toJSON(), ppq: 960 });
    midi.header.tempos = [{ ticks: 0, bpm: 123.5 }, { ticks: 1920, bpm: 91.25 }];
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [7, 8], measures: 0 });
    const track = midi.addTrack();
    track.addNote({ midi: 60, ticks: 240, durationTicks: 360, velocity: 0.7 });

    const result = convertMidi(
      midi.toArray().buffer,
      'source-metadata.mid',
    );

    expect(result.source.ppq).toBe(960);
    expect(result.source.tempos.map(({ ticks }) => ticks)).toEqual([0, 1920]);
    expect(result.source.tempos.map(({ bpm }) => bpm)).toEqual([
      expect.closeTo(123.5, 3),
      expect.closeTo(91.25, 3),
    ]);
    expect(result.source.timeSignatures).toEqual([{ ticks: 0, numerator: 7, denominator: 8 }]);
    expect(result.tracks[0].notes[0]).toMatchObject({
      noteOn: expect.any(Number),
      noteOff: expect.any(Number),
      source: { id: 'track-0:note-0:240', ticks: 240, durationTicks: 360 },
    });
    expect(result.tracks[0].sourceTiming).toEqual(result.source);
  });

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

  it('uses one exact shared literal loop for delayed attacks across two passes', async () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    track.addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.7 });
    track.addNote({ midi: 64, ticks: 480, durationTicks: 240, velocity: 0.6 });

    const result = convertMidi(midi.toArray().buffer, 'delayed.mid', { includeVelocity: true });
    const observed = await queryConvertedOnsets(result.code);

    // Independently worked out from 120 BPM/4-4: the two-second source bar
    // is one Strudel cycle, and every event must recur one cycle later.
    expect(result.sharedSpanSeconds).toBe(2);
    expect(observed).toEqual([
      { pitch: 'C4', onset: 0, gateEnd: 0.25, velocity: 88 / 127 },
      { pitch: 'E4', onset: 0.25, gateEnd: 0.375, velocity: 76 / 127 },
      { pitch: 'C4', onset: 1, gateEnd: 1.25, velocity: 88 / 127 },
      { pitch: 'E4', onset: 1.25, gateEnd: 1.375, velocity: 76 / 127 },
    ]);
  });

  it('does not snap simultaneous duplicates, quintuplets, or septuplets in literal fallback', async () => {
    const midi = new Midi();
    midi.header.fromJSON({ ...midi.header.toJSON(), ppq: 3360 });
    midi.header.setTempo(120);
    const track = midi.addTrack();
    track.addNote({ midi: 60, ticks: 0, durationTicks: 672, velocity: 0.8 });
    track.addNote({ midi: 60, ticks: 0, durationTicks: 672, velocity: 0.4 });
    for (let index = 0; index < 5; index++) {
      track.addNote({ midi: 62, ticks: 3360 + index * 672, durationTicks: 672, velocity: 0.5 });
    }
    for (let index = 0; index < 7; index++) {
      track.addNote({ midi: 64, ticks: 6720 + index * 960, durationTicks: 960, velocity: 0.5 });
    }

    const result = convertMidi(midi.toArray().buffer, 'tuplets.mid', {
      timingStyle: 'relativeDivision',
      includeVelocity: true,
    });
    const observed = await queryConvertedOnsets(result.code);
    const firstLoop = observed.filter(({ onset }) => onset < 1);

    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'precise-literal-fallback' }));
    expect(firstLoop.filter(({ pitch, onset }) => pitch === 'C4' && onset === 0)).toHaveLength(2);
    expect(firstLoop.filter(({ pitch }) => pitch === 'D4').map(({ onset }) => onset))
      .toEqual([0.25, 0.3, 0.35, 0.4, 0.45]);
    expect(firstLoop.filter(({ pitch }) => pitch === 'E4').map(({ onset }) => onset))
      .toEqual([0.5, 4 / 7, 9 / 14, 5 / 7, 11 / 14, 6 / 7, 13 / 14]);
    expect(observed.filter(({ pitch, onset }) => pitch === 'D4' && onset >= 1).map(({ onset }) => onset))
      .toEqual([1.25, 1.3, 1.35, 1.4, 1.45]);
  });

  it('keeps a hidden loaded track in the source-origin shared span', () => {
    const result = new StrudelNotation(DEFAULT_CONFIG).generateWithDiagnostics([
      {
        id: 'visible', name: 'Visible', isDrum: false,
        notes: [{ note: 'C4', midi: 60, noteOn: 0, noteOff: 0.5, velocity: 0.8 }],
      },
      {
        id: 'hidden-late', name: 'Hidden late', hidden: true, isDrum: false,
        notes: [{ note: 'D4', midi: 62, noteOn: 2.1, noteOff: 2.2, velocity: 0.8 }],
      },
    ]);

    // 2.2 seconds rounds to the next 4/4 source measure (four seconds), and
    // the emitted visible voice therefore repeats every two Strudel cycles.
    expect(result.sharedSpanSeconds).toBe(4);
    expect(result.code).toContain('.slow(2)');
    expect(result.code).not.toContain('HIDDEN_LATE');
  });
});
