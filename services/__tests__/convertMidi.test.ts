import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import MidiPackage from '@tonejs/midi';
import { convertMidi, createMidiProject } from '../convertMidi';
import { parseMidiBuffer } from '../MidiParser';
import { StrudelNotation } from '../StrudelNotation';
import { DEFAULT_CONFIG, type StrudelConfig } from '../../types';
import { evaluateGeneratedStrudelCode } from './helpers/strudelRuntime';
import { getCycleDuration } from '../notation/NotationUtils';

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

const queryConvertedOnsets = async (code: string, sharedSpanSeconds: number, config: StrudelConfig) => {
  const runtime = await evaluateGeneratedStrudelCode(code, { secondsPerCycle: getCycleDuration(config) });
  try {
    const { twoLoops, firstBoundary, secondBoundary } = runtime.queryTwoLoopsAndBoundaryWindows(sharedSpanSeconds);
    return {
      cps: runtime.cps,
      events: twoLoops.map((event) => ({
        pitch: event.value.note ?? event.value.n ?? event.value.s,
        onset: event.onsetSeconds,
        gateEnd: event.gateEndSeconds,
        velocity: event.value.velocity,
      })).sort((left, right) => left.onset - right.onset || String(left.pitch).localeCompare(String(right.pitch)) || Number(left.velocity ?? 0) - Number(right.velocity ?? 0)),
      boundary: [...firstBoundary, ...secondBoundary],
    };
  } finally {
    runtime.stop();
  }
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

  it('ignores retired output choices from untyped callers without changing the music', () => {
    const bytes = makePercussionMidi([36, 42, 38, 42]);
    const current = convertMidi(bytes, 'old-options.mid');
    const legacy = convertMidi(bytes, 'old-options.mid', JSON.parse(JSON.stringify({
      renderingMode: 'expanded', timingStyle: 'relativeDivision',
      durationPrecision: 1, outputStyle: 'melody+harmony',
    })));

    expect(legacy).toEqual(current);
    for (const key of ['renderingMode', 'timingStyle', 'durationPrecision', 'outputStyle']) {
      expect(legacy.config).not.toHaveProperty(key);
    }
  });

  it('keeps filename line breaks out of generated title metadata', async () => {
    const bytes = await readFile(fileURLToPath(fixtureUrl));
    const result = convertMidi(asArrayBuffer(bytes), 'safe\nsetcps(999)\u2028title.mid');

    expect(result.config.fileName).toBe('safe setcps(999) title');
    expect(result.code.split('\n')[0]).toBe('// @title safe setcps(999) title');
  });

  it('uses one exact shared loop for delayed attacks across two passes', async () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    track.addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.7 });
    track.addNote({ midi: 64, ticks: 480, durationTicks: 240, velocity: 0.6 });

    const result = convertMidi(midi.toArray().buffer, 'delayed.mid', { includeVelocity: true });
    const observed = await queryConvertedOnsets(result.code, result.sharedSpanSeconds, result.config);

    // Independently worked out from 120 BPM/4-4: the two-second source bar
    // is one Strudel cycle, and every event must recur one cycle later.
    expect(result.sharedSpanSeconds).toBe(2);
    expect(observed.cps).toBe(0.5);
    expect(observed.boundary.map(({ onsetSeconds }) => onsetSeconds)).toEqual([2, 4]);
    expect(observed.events).toEqual([
      { pitch: 'C4', onset: 0, gateEnd: 0.5, velocity: 88 / 127 },
      { pitch: 'E4', onset: 0.5, gateEnd: 0.75, velocity: 76 / 127 },
      { pitch: 'C4', onset: 2, gateEnd: 2.5, velocity: 88 / 127 },
      { pitch: 'E4', onset: 2.5, gateEnd: 2.75, velocity: 76 / 127 },
    ]);
  });

  it('does not snap simultaneous duplicates, quintuplets, or septuplets in structured output', async () => {
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
      includeVelocity: true,
    });
    const observed = await queryConvertedOnsets(result.code, result.sharedSpanSeconds, result.config);
    const firstLoop = observed.events.filter(({ onset }) => onset < 2);

    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({ code: 'precise-literal-fallback' }));
    expect(firstLoop.filter(({ pitch, onset }) => pitch === 'C4' && onset === 0)).toHaveLength(2);
    expect(firstLoop.filter(({ pitch }) => pitch === 'D4').map(({ onset }) => onset))
      .toEqual([0.5, 0.6, 0.7, 0.8, 0.9]);
    expect(firstLoop.filter(({ pitch }) => pitch === 'E4').map(({ onset }) => onset))
      .toEqual([1, 8 / 7, 9 / 7, 10 / 7, 11 / 7, 12 / 7, 13 / 7]);
    expect(observed.events.filter(({ pitch, onset }) => pitch === 'D4' && onset >= 2).map(({ onset }) => onset))
      .toEqual([2.5, 2.6, 2.7, 2.8, 2.9]);
  });

  it('uses the literal fallback for tempo and meter changes while preserving cross-transition gates', async () => {
    const midi = new Midi();
    midi.header.fromJSON({ ...midi.header.toJSON(), ppq: 480 });
    midi.header.tempos = [{ ticks: 0, bpm: 123.5 }, { ticks: 480, bpm: 100 }];
    midi.header.timeSignatures = [
      { ticks: 0, timeSignature: [4, 4], measures: 0 },
      { ticks: 960, timeSignature: [3, 4], measures: 1 },
    ];
    const track = midi.addTrack();
    track.addNote({ midi: 60, ticks: 240, durationTicks: 720, velocity: 0.7 });
    track.addNote({ midi: 64, ticks: 960, durationTicks: 240, velocity: 0.6 });

    const result = convertMidi(midi.toArray().buffer, 'changing-map.mid', { includeVelocity: true });
    const observed = await queryConvertedOnsets(result.code, result.sharedSpanSeconds, result.config);

    // Calculated from the retained source map, not the renderer: tick 480
    // changes from 123.5 to 100 BPM. C4 crosses that boundary; E4 begins at
    // the meter transition.
    const firstLoop = observed.events.filter(({ onset }) => onset < result.sharedSpanSeconds);
    const sourceSecondsAtTick = (ticks: number) => {
      const tempos = result.source.tempos;
      let seconds = 0;
      let previousTick = 0;
      let bpm = tempos[0].bpm;
      tempos.slice(1).filter((tempo) => tempo.ticks < ticks).forEach((tempo) => {
        seconds += ((tempo.ticks - previousTick) / result.source.ppq) * (60 / bpm);
        previousTick = tempo.ticks;
        bpm = tempo.bpm;
      });
      return seconds + ((ticks - previousTick) / result.source.ppq) * (60 / bpm);
    };
    const c4Onset = sourceSecondsAtTick(240);
    const c4Release = sourceSecondsAtTick(960);
    const e4Onset = sourceSecondsAtTick(960);
    const e4Release = sourceSecondsAtTick(1200);
    expect(result.source.tempos).toEqual([
      { ticks: 0, bpm: expect.closeTo(123.5, 3) },
      { ticks: 480, bpm: 100 },
    ]);
    expect(result.source.timeSignatures).toEqual([
      { ticks: 0, numerator: 4, denominator: 4 },
      { ticks: 960, numerator: 3, denominator: 4 },
    ]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'precise-literal-fallback',
      message: expect.stringContaining('tempo and meter changes'),
    }));
    expect(result.sharedSpanSeconds).toBe(60 / result.config.sourceBpm * 4);
    expect(firstLoop).toHaveLength(2);
    expect(firstLoop[0]).toMatchObject({ pitch: 'C4', velocity: 88 / 127 });
    expect(Math.abs(firstLoop[0].onset - c4Onset)).toBeLessThanOrEqual(0.000001);
    expect(Math.abs(firstLoop[0].gateEnd - c4Release)).toBeLessThanOrEqual(0.000001);
    expect(firstLoop[1]).toMatchObject({ pitch: 'E4', velocity: 76 / 127 });
    expect(Math.abs(firstLoop[1].onset - e4Onset)).toBeLessThanOrEqual(0.000001);
    expect(Math.abs(firstLoop[1].gateEnd - e4Release)).toBeLessThanOrEqual(0.000001);
    const secondLoop = observed.events.filter(({ onset }) => onset >= result.sharedSpanSeconds);
    expect(secondLoop).toHaveLength(2);
    expect(Math.abs(secondLoop[0].onset - (c4Onset + result.sharedSpanSeconds))).toBeLessThanOrEqual(0.000001);
    expect(Math.abs(secondLoop[0].gateEnd - (c4Release + result.sharedSpanSeconds))).toBeLessThanOrEqual(0.000001);
    expect(Math.abs(secondLoop[1].onset - (e4Onset + result.sharedSpanSeconds))).toBeLessThanOrEqual(0.000001);
    expect(Math.abs(secondLoop[1].gateEnd - (e4Release + result.sharedSpanSeconds))).toBeLessThanOrEqual(0.000001);
  });

  it('keeps legacy seconds-only tracks playable through the literal route without inventing source ticks', async () => {
    const legacyTracks = [{
      id: 'legacy-piano',
      name: 'Legacy Piano',
      isDrum: false,
      notes: [
        { note: 'C4', midi: 60, noteOn: 0.125, noteOff: 0.375, velocity: 0.8 },
        { note: 'E4', midi: 64, noteOn: 1.5, noteOff: 1.75, velocity: 0.6 },
      ],
    }];

    const result = new StrudelNotation(DEFAULT_CONFIG).generateWithDiagnostics(legacyTracks);
    const observed = await queryConvertedOnsets(result.code, result.sharedSpanSeconds, DEFAULT_CONFIG);

    expect(legacyTracks[0].notes.every((note) => !Object.hasOwn(note, 'source'))).toBe(true);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'precise-literal-fallback',
      message: expect.stringContaining('saved notes lack source ticks'),
    }));
    expect(observed.events).toEqual([
      { pitch: 'C4', onset: 0.125, gateEnd: 0.375, velocity: undefined },
      { pitch: 'E4', onset: 1.5, gateEnd: 1.75, velocity: undefined },
      { pitch: 'C4', onset: 2.125, gateEnd: 2.375, velocity: undefined },
      { pitch: 'E4', onset: 3.5, gateEnd: 3.75, velocity: undefined },
    ]);
  });

  it('renders local tuplet beat groups and independent gates in structured mode over two loops', async () => {
    const midi = new Midi();
    midi.header.fromJSON({ ...midi.header.toJSON(), ppq: 3360 });
    midi.header.setTempo(120);
    const track = midi.addTrack();
    track.name = 'Structured piano';
    // Two simultaneous pitches deliberately have unlike releases. The next
    // beats are exact quintuplet and septuplet groups, not display rounding.
    track.addNote({ midi: 60, ticks: 0, durationTicks: 3360, velocity: 0.8 });
    track.addNote({ midi: 67, ticks: 0, durationTicks: 1680, velocity: 0.6 });
    for (let index = 0; index < 5; index += 1) {
      track.addNote({ midi: 62, ticks: 3360 + index * 672, durationTicks: 336, velocity: 0.5 });
    }
    for (let index = 0; index < 7; index += 1) {
      track.addNote({ midi: 64, ticks: 6720 + index * 480, durationTicks: 480, velocity: 0.4 });
    }

    const result = convertMidi(midi.toArray().buffer, 'structured-tuplets.mid', {
      includeVelocity: true,
    });
    const observed = await queryConvertedOnsets(result.code, result.sharedSpanSeconds, result.config);

    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({ code: 'precise-literal-fallback' }));
    expect(result.code).toContain('[D4!5]');
    expect(result.code).toContain('[E4!7]');
    expect(result.code).toContain('.clip(');
    const expected = [
      { pitch: 'C4', onset: 0, gateEnd: 0.5, velocity: 101 / 127 },
      { pitch: 'G4', onset: 0, gateEnd: 0.25, velocity: 76 / 127 },
      ...Array.from({ length: 5 }, (_, index) => ({
        pitch: 'D4', onset: 0.5 + index / 10, gateEnd: 0.55 + index / 10, velocity: 63 / 127,
      })),
      ...Array.from({ length: 7 }, (_, index) => ({
        pitch: 'E4', onset: 1 + index / 14, gateEnd: 1 + (index + 1) / 14, velocity: 50 / 127,
      })),
      { pitch: 'C4', onset: 2, gateEnd: 2.5, velocity: 101 / 127 },
      { pitch: 'G4', onset: 2, gateEnd: 2.25, velocity: 76 / 127 },
      ...Array.from({ length: 5 }, (_, index) => ({
        pitch: 'D4', onset: 2.5 + index / 10, gateEnd: 2.55 + index / 10, velocity: 63 / 127,
      })),
      ...Array.from({ length: 7 }, (_, index) => ({
        pitch: 'E4', onset: 3 + index / 14, gateEnd: 3 + (index + 1) / 14, velocity: 50 / 127,
      })),
    ];
    expect(observed.events).toHaveLength(expected.length);
    expected.forEach((event, index) => {
      expect(observed.events[index].pitch).toBe(event.pitch);
      expect(observed.events[index].velocity).toBe(event.velocity);
      expect(observed.events[index].onset).toBeCloseTo(event.onset, 9);
      expect(observed.events[index].gateEnd).toBeCloseTo(event.gateEnd, 9);
    });
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

  it('keeps same-named active tracks distinct in the full Strudel REPL pattern', async () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    for (const pitch of [60, 64]) {
      const track = midi.addTrack();
      track.name = 'Piano';
      track.addNote({ midi: pitch, ticks: 0, durationTicks: 240 });
    }

    const result = convertMidi(midi.toArray().buffer, 'duplicate-names.mid');
    const observed = await queryConvertedOnsets(result.code, result.sharedSpanSeconds, result.config);

    expect(observed.events.filter(({ onset }) => onset === 0).map(({ pitch }) => pitch)).toEqual(['C4', 'E4']);
  });

  it('rounds the shared span to the source meter when playback meter differs', () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    track.addNote({ midi: 60, ticks: 600, durationTicks: 120 });

    const result = convertMidi(midi.toArray().buffer, 'source-meter.mid', {
      timeSignature: { numerator: 3, denominator: 4 },
    });

    expect(result.config.sourceTimeSignature).toEqual({ numerator: 4, denominator: 4 });
    expect(result.sharedSpanSeconds).toBe(2);
  });

  it('preserves imported meter values outside the sidebar input bounds', async () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 64], measures: 0 });
    midi.addTrack().addNote({ midi: 60, ticks: 0, durationTicks: 45 });

    const result = convertMidi(midi.toArray().buffer, 'small-meter.mid');
    const observed = await queryConvertedOnsets(result.code, result.sharedSpanSeconds, result.config);

    expect(result.config.timeSignature).toEqual({ numerator: 3, denominator: 64 });
    expect(result.config.sourceTimeSignature).toEqual({ numerator: 3, denominator: 64 });
    expect(result.sharedSpanSeconds).toBe(3 / 32);
    expect(observed.events.map(({ onset }) => onset)).toEqual([0, 3 / 32]);
    expect(observed.events.map(({ gateEnd }) => gateEnd)).toEqual([3 / 64, 9 / 64]);
  });

  it('does not impose sidebar limits on explicit public quantization requests', async () => {
    const midi = new Midi();
    midi.header.setTempo(30);
    midi.addTrack().addNote({ midi: 60, ticks: 60, durationTicks: 120 });

    const result = convertMidi(midi.toArray().buffer, 'wide-threshold.mid', {
      isQuantized: true, quantizationThreshold: 300, quantizationStrength: 100,
    });
    const observed = await queryConvertedOnsets(result.code, result.sharedSpanSeconds, result.config);

    expect(result.config.quantizationThreshold).toBe(300);
    expect(observed.events[0].onset).toBe(0.5);
  });

  it('uses absolute pitch control when relative mode has no detected key', async () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    midi.addTrack().addNote({ midi: 61, ticks: 0, durationTicks: 120 });

    const parsed = parseMidiBuffer(midi.toArray().buffer);
    const { config, tracks } = createMidiProject(parsed, 'keyless-relative.mid', {
      notationType: 'relative',
    }, () => null);
    const result = new StrudelNotation(config).generateWithDiagnostics(tracks);
    const observed = await queryConvertedOnsets(result.code, result.sharedSpanSeconds, config);

    expect(config.key).toBeUndefined();
    expect(result.code).toContain('note(');
    expect(result.code).not.toContain('.scale(');
    expect(observed.events[0].pitch).toBe('C#4');
  });

  it('preserves a one-tick gate and gap rather than applying legacy epsilon merging', async () => {
    const midi = new Midi();
    midi.header.fromJSON({ ...midi.header.toJSON(), ppq: 960 });
    midi.header.setTempo(120);
    const track = midi.addTrack();
    track.addNote({ midi: 60, ticks: 0, durationTicks: 1 });
    track.addNote({ midi: 62, ticks: 2, durationTicks: 1 });

    const result = convertMidi(midi.toArray().buffer, 'one-tick-gap.mid');
    const observed = await queryConvertedOnsets(result.code, result.sharedSpanSeconds, result.config);
    const tickSeconds = 0.5 / 960;

    expect(observed.events).toEqual([
      { pitch: 'C4', onset: 0, gateEnd: tickSeconds, velocity: undefined },
      { pitch: 'D4', onset: tickSeconds * 2, gateEnd: tickSeconds * 3, velocity: undefined },
      { pitch: 'C4', onset: 2, gateEnd: 2 + tickSeconds, velocity: undefined },
      { pitch: 'D4', onset: 2 + (tickSeconds * 2), gateEnd: 2 + (tickSeconds * 3), velocity: undefined },
    ]);
  });

  it('does not clip a real event infinitesimally after a source bar boundary', () => {
    const result = new StrudelNotation(DEFAULT_CONFIG).generateWithDiagnostics([{
      id: 'late', name: 'Late', isDrum: false,
      notes: [{ note: 'C4', midi: 60, noteOn: 2, noteOff: 2 + 1e-12, velocity: 0.8 }],
    }]);

    expect(result.sharedSpanSeconds).toBe(4);
  });

  it('gives punctuation-only names a deterministic safe active label', async () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    track.name = '!!!';
    track.addNote({ midi: 60, ticks: 0, durationTicks: 120 });

    const result = convertMidi(midi.toArray().buffer, 'punctuation-name.mid');
    const observed = await queryConvertedOnsets(result.code, result.sharedSpanSeconds, result.config);

    expect(result.code).toMatch(/\$[A-Za-z_][A-Za-z_0-9]*:/);
    expect(result.code).not.toMatch(/_MELODY:|_HARMONY:/);
    expect(observed.events[0].pitch).toBe('C4');
  });
});
