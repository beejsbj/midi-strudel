import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import MidiPackage from '@tonejs/midi';
import { convertMidi, createMidiProject } from '../convertMidi';
import { parseMidiBuffer } from '../MidiParser';
import { StrudelNotation } from '../StrudelNotation';
import { drumSample } from '../drums/DrumKits';
import { DEFAULT_CONFIG, type StrudelConfig } from '../../types';
import { evaluateGeneratedStrudelCode, gateTolerance } from './helpers/strudelRuntime';

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
  const runtime = await evaluateGeneratedStrudelCode(code, { exactBpm: config.bpm });
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
  it.each([
    { name: 'Steel Drums', program: 114, pitches: [60], isDrum: false },
    { name: 'Drums', program: 0, pitches: [35, 38, 57], isDrum: true },
    { name: 'Drums', program: 0, pitches: [35, 88], isDrum: false },
    { name: 'Percussion', program: 0, pitches: [26, 38], isDrum: false },
    { name: 'Steel Drums', program: 0, pitches: [60, 64, 67], isDrum: false },
    { name: 'Percussive Organ', program: 0, pitches: [60, 64], isDrum: false },
    { name: 'Percussive Organ', program: 17, pitches: [60, 64], isDrum: false },
    { name: 'Drum & Bass', program: 0, pitches: [36, 37, 38, 39, 40, 41, 42, 43], isDrum: false },
    { name: 'Drum and Bass', program: 0, pitches: [36, 38, 40], isDrum: false },
    { name: 'Drums', program: 0, pitches: [36, 38, 42], isDrum: true },
    { name: 'Drums', program: 0, pitches: [36, 38, 42], channel: 3, isDrum: true },
    { name: 'Bass Drum', program: 0, pitches: [36, 35], isDrum: true },
    { name: 'Bass Drum / Bass Drum 2', program: 0, pitches: [36, 35], isDrum: true },
    { name: 'Bassdrum', program: 0, pitches: [36, 35], isDrum: true },
    { name: 'Synth Drums', program: 0, pitches: [36, 38, 42], isDrum: true },
    { name: 'DnB Drums', program: 0, pitches: [36, 38, 42], isDrum: true },
    { name: 'Drum Pad', program: 0, pitches: [36, 38, 42], isDrum: true },
    { name: 'Organic Percussion', program: 0, pitches: [36, 38, 42], isDrum: true },
    { name: 'Latin Percussion', program: 0, pitches: [60, 62, 64, 70], isDrum: true },
    { name: 'Drums', program: 0, pitches: [36, 38, 42, 46, 60, 62], isDrum: true },
    { name: 'Drums', program: 0, pitches: [36, 60], isDrum: true },
    { name: 'Drums', program: 0, pitches: [36, 60, 62], isDrum: false },
    { name: 'Drums', program: 0, pitches: [60, 64, 67], isDrum: false },
    { name: 'Piano', program: 0, pitches: [60, 64, 67], channel: 9, isDrum: true },
    { name: 'Steel Drums', program: 0, pitches: [60, 64, 67], channel: 9, isDrum: true },
  ])('uses program and note range before treating a pitched $name track as drums', async ({ name, program, pitches, isDrum, channel = 0 }) => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    track.name = name;
    track.channel = channel;
    track.instrument.number = program;
    pitches.forEach((pitch, index) => track.addNote({ midi: pitch, ticks: index * 480, durationTicks: 480 }));

    const result = convertMidi(midi.toArray().buffer, 'named-instrument.mid');
    expect(result.tracks[0].isDrum).toBe(isDrum);
    expect(Boolean(result.tracks[0].drumBank)).toBe(isDrum);
    const observed = await queryConvertedOnsets(result.code, result.sharedSpanSeconds, result.config);
    expect(observed.events).toHaveLength(pitches.length * 2);
    if (!isDrum) {
      expect(observed.events.slice(0, pitches.length).map(({ pitch }) => pitch)).toEqual(track.notes.map((note) => note.name));
    }
  });

  it('treats an empty drum-named track as a hidden kit', () => {
    const midi = new Midi();
    midi.addTrack().name = 'Drums';
    const [track] = parseMidiBuffer(midi.toArray().buffer).tracks;
    expect(track).toMatchObject({ isDrum: true, hidden: true });
  });

  it('plays the implicit 120 BPM before a delayed first tempo event', async () => {
    const midi = new Midi();
    midi.header.fromJSON({ ...midi.header.toJSON(), ppq: 480 });
    midi.header.tempos = [{ ticks: 960, bpm: 60 }];
    const track = midi.addTrack();
    [0, 480, 960, 1440].forEach((ticks) => track.addNote({ midi: 60, ticks, durationTicks: 480, velocity: 0.7 }));
    const bytes = midi.toArray().buffer;
    const parsed = parseMidiBuffer(bytes);
    const result = convertMidi(bytes, 'delayed-tempo.mid', { includeVelocity: true });
    const observed = await queryConvertedOnsets(result.code, result.sharedSpanSeconds, result.config);

    expect(observed.events.map(({ onset }) => onset)).toEqual([0, 0.5, 1, 2, 4, 4.5, 5, 6]);
    expect(observed.events.map(({ gateEnd }) => gateEnd)).toEqual([0.5, 1, 2, 3, 4.5, 5, 6, 7]);
    expect(observed.events.every(({ pitch, velocity }) => pitch === 'C4' && velocity === 88 / 127)).toBe(true);
    expect(parsed.tracks[0].notes.map(({ noteOn }) => noteOn)).toEqual([0, 0.5, 1, 2]);
    expect(parsed.bpm).toBe(120);
    expect(result.sharedSpanSeconds).toBe(4);
    expect(result.source.tempos).toEqual([{ ticks: 0, bpm: 120 }, { ticks: 960, bpm: 60 }]);
    expect(result.tracks[0].sourceTiming).toEqual(result.source);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'precise-literal-fallback', message: expect.stringContaining('source has tempo changes'),
    }));
  });

  const makeDelayedTempoMidi = (tempos: { ticks: number; bpm: number }[], noteTicks: number[], durationTicks = 480): ArrayBuffer => {
    const midi = new Midi();
    midi.header.fromJSON({ ...midi.header.toJSON(), ppq: 480 });
    midi.header.tempos = tempos.map((tempo) => ({ ...tempo }));
    const track = midi.addTrack();
    noteTicks.forEach((ticks) => track.addNote({ midi: 60, ticks, durationTicks }));
    return midi.toArray().buffer;
  };

  it.each([1, 10])('snaps a tempo event at tick %i to tick 0 when no note starts before it', (tempoTick) => {
    const bytes = makeDelayedTempoMidi(
      [{ ticks: tempoTick, bpm: 90 }],
      Array.from({ length: 32 }, (_, index) => index * 480),
    );
    const result = convertMidi(bytes, 'daw-tempo.mid');

    expect(result.source.tempos.map(({ ticks }) => ticks)).toEqual([0]);
    expect(result.source.tempos[0].bpm).toBeCloseTo(90, 3);
    expect(result.config.sourceBpm).toBeCloseTo(90, 3);
    expect(result.sharedSpanSeconds).toBeCloseTo(21.333, 3);
    expect(result.diagnostics.map(({ code }) => code)).not.toContain('precise-literal-fallback');
    expect(result.code).toMatch(/\$\w+: /);
    expect(result.code).toContain('const ');
  });

  it('uses the latest tempo at or before the first onset when several precede it', () => {
    const bytes = makeDelayedTempoMidi(
      [{ ticks: 1, bpm: 100 }, { ticks: 5, bpm: 90 }],
      [0, 480, 960],
    );
    const parsed = parseMidiBuffer(bytes);
    expect(parsed.source?.tempos.map(({ ticks }) => ticks)).toEqual([0]);
    expect(parsed.bpm).toBeCloseTo(90, 3);
    parsed.tracks[0].notes.map(({ noteOn }) => noteOn).forEach((onset, index) => expect(onset).toBeCloseTo(index * 60 / 90, 4));
  });

  it('keeps the first tempo for a file with no notes', () => {
    const parsed = parseMidiBuffer(makeDelayedTempoMidi([{ ticks: 10, bpm: 90 }], []));
    expect(parsed.source?.tempos.map(({ ticks }) => ticks)).toEqual([0]);
    expect(parsed.bpm).toBeCloseTo(90, 3);
  });

  it.each([{ label: 'absent', noteTicks: [] as number[] }, { label: 'all at tick 0', noteTicks: [0] }])('keeps the first tempo and later changes when notes are $label', ({ noteTicks }) => {
    const parsed = parseMidiBuffer(makeDelayedTempoMidi([{ ticks: 10, bpm: 90 }, { ticks: 5000, bpm: 140 }], noteTicks));
    expect(parsed.source?.tempos.map(({ ticks }) => ticks)).toEqual([0, 5000]);
    expect(parsed.bpm).toBeCloseTo(90, 3);
  });

  it.each(['chained', 'colon'] as const)('shares the final zero-length drum hit\'s bar with every track in %s syntax', async (controlSyntax) => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const drums = midi.addTrack();
    drums.name = 'Drums';
    drums.channel = 9;
    drums.addNote({ midi: 36, ticks: 0, durationTicks: 120 });
    drums.addNote({ midi: 38, ticks: 1920, durationTicks: 0 });
    const piano = midi.addTrack();
    piano.name = 'Piano';
    piano.addNote({ midi: 60, ticks: 0, durationTicks: 480 });

    const result = convertMidi(midi.toArray().buffer, 'final-drum-hit.mid', { controlSyntax });
    const observed = await queryConvertedOnsets(result.code, 4, result.config);
    expect(observed.events.map(({ pitch, onset }) => ({ pitch, onset }))).toEqual([
      { pitch: 'bd', onset: 0 }, { pitch: 'C4', onset: 0 }, { pitch: 'sd', onset: 2 },
      { pitch: 'bd', onset: 4 }, { pitch: 'C4', onset: 4 }, { pitch: 'sd', onset: 6 },
    ]);
    expect(result.sharedSpanSeconds).toBe(4);
    expect(result.code).toContain('$piano: "<a ~>"');
    expect(observed.boundary.map(({ onsetSeconds }) => onsetSeconds)).toEqual([4, 4, 8, 8]);
  });

  it('includes a zero-length bar-line hit despite floating-point seconds rounding', async () => {
    const midi = new Midi();
    midi.header.setTempo(97);
    const drums = midi.addTrack();
    drums.channel = 9;
    drums.addNote({ midi: 36, ticks: 0, durationTicks: 120 });
    drums.addNote({ midi: 38, ticks: 27 * 1920, durationTicks: 0 });
    const piano = midi.addTrack();
    piano.addNote({ midi: 60, ticks: 0, durationTicks: 480 });
    const result = convertMidi(midi.toArray().buffer, 'rounded-bar-line.mid');
    const measureSeconds = 240 / result.config.sourceBpm;
    const expectedSpan = 28 * measureSeconds;
    const observed = await queryConvertedOnsets(result.code, expectedSpan, result.config);

    expect(result.sharedSpanSeconds).toBe(expectedSpan);
    expect(observed.events).toHaveLength(6);
    const hits = observed.events.filter(({ pitch }) => pitch === 'sd');
    expect(hits).toHaveLength(2);
    expect(hits[0].onset).toBeCloseTo(27 * measureSeconds, 9);
    expect(hits[1].onset).toBeCloseTo(55 * measureSeconds, 9);
  });

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

  it('picks the kit that has the part\'s sounds and plays every GM percussion note', async () => {
    // Sticks are rare: only a few kits have them, so they decide the kit.
    const result = convertMidi(makePercussionMidi([36, 43, 48, 31, 31, 31]), 'percussion.mid');
    const kit = result.tracks[0].drumBank!;
    expect(kit).not.toBe('RolandTR909');
    expect(drumSample(31, kit)).toEqual({ token: expect.any(String) });
    expect(result.code).toContain(`.bank("${kit}")`);
    expect(result.diagnostics.filter(({ code }) => code === 'unmapped-drum-note')).toEqual([]);
    const runtime = await evaluateGeneratedStrudelCode(result.code, { exactBpm: result.config.bpm });
    try {
      expect(runtime.querySeconds(0, result.sharedSpanSeconds)).toHaveLength(6);
    } finally { runtime.stop(); }
  });

  it('plays a sound the kit lacks as its nearest stand-in and drops only notes outside GM percussion', () => {
    const project = createMidiProject(parseMidiBuffer(makePercussionMidi([85, 31, 85, 20])), 'unsupported.mid');
    // The TR-909 has no castanets, sticks, claves or woodblock: both become its rimshot.
    const tracks = project.tracks.map((track) => ({ ...track, drumBank: 'RolandTR909' }));
    const result = new StrudelNotation(project.config).generateWithDiagnostics(tracks);
    expect(result.code).toContain('.bank("RolandTR909")');
    expect(result.diagnostics).toEqual([
      { code: 'unmapped-drum-note', severity: 'warning', midiNote: 20, count: 1,
        message: 'Dropped 1 unmapped drum note event for MIDI 20' },
      { code: 'substituted-drum-note', severity: 'info', midiNote: 31, count: 1,
        message: 'Played 1 Sticks hit (MIDI 31) as Side Stick: RolandTR909 has no sticks' },
      { code: 'substituted-drum-note', severity: 'info', midiNote: 85, count: 2,
        message: 'Played 2 Castanets hits (MIDI 85) as Side Stick: RolandTR909 has no castanets' },
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
      { pitch: 'C4', onset: 0, gateEnd: 0.5, velocity: 0.693 },
      { pitch: 'E4', onset: 0.5, gateEnd: 0.75, velocity: 0.598 },
      { pitch: 'C4', onset: 2, gateEnd: 2.5, velocity: 0.693 },
      { pitch: 'E4', onset: 2.5, gateEnd: 2.75, velocity: 0.598 },
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
      { pitch: 'C4', onset: 0, gateEnd: 0.5, velocity: 0.795 },
      { pitch: 'G4', onset: 0, gateEnd: 0.25, velocity: 0.598 },
      ...Array.from({ length: 5 }, (_, index) => ({
        pitch: 'D4', onset: 0.5 + index / 10, gateEnd: 0.55 + index / 10, velocity: 0.496,
      })),
      ...Array.from({ length: 7 }, (_, index) => ({
        pitch: 'E4', onset: 1 + index / 14, gateEnd: 1 + (index + 1) / 14, velocity: 0.394,
      })),
      { pitch: 'C4', onset: 2, gateEnd: 2.5, velocity: 0.795 },
      { pitch: 'G4', onset: 2, gateEnd: 2.25, velocity: 0.598 },
      ...Array.from({ length: 5 }, (_, index) => ({
        pitch: 'D4', onset: 2.5 + index / 10, gateEnd: 2.55 + index / 10, velocity: 0.496,
      })),
      ...Array.from({ length: 7 }, (_, index) => ({
        pitch: 'E4', onset: 3 + index / 14, gateEnd: 3 + (index + 1) / 14, velocity: 0.394,
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
    midi.addTrack().addNote({ midi: 60, ticks: 0, durationTicks: 60 });

    const result = convertMidi(midi.toArray().buffer, 'small-meter.mid');
    const observed = await queryConvertedOnsets(result.code, result.sharedSpanSeconds, result.config);

    expect(result.config.timeSignature).toEqual({ numerator: 3, denominator: 64 });
    expect(result.config.sourceTimeSignature).toEqual({ numerator: 3, denominator: 64 });
    expect(result.sharedSpanSeconds).toBe(3 / 32);
    expect(observed.events.map(({ onset }) => onset)).toEqual([0, 3 / 32]);
    expect(observed.events.map(({ gateEnd }) => gateEnd)).toEqual([1 / 16, 3 / 32 + 1 / 16]);
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

  it('preserves one-tick gates and an audible 20 ms gap rather than merging them', async () => {
    const midi = new Midi();
    midi.header.fromJSON({ ...midi.header.toJSON(), ppq: 960 });
    midi.header.setTempo(120);
    const track = midi.addTrack();
    track.addNote({ midi: 60, ticks: 0, durationTicks: 1 });
    track.addNote({ midi: 62, ticks: 40, durationTicks: 1 });

    const result = convertMidi(midi.toArray().buffer, 'one-tick-gap.mid');
    const tickSeconds = 0.5 / 960;
    const expected = [
      { pitch: 'C4', onset: 0, gateEnd: tickSeconds },
      { pitch: 'D4', onset: tickSeconds * 40, gateEnd: tickSeconds * 41 },
      { pitch: 'C4', onset: 2, gateEnd: 2 + tickSeconds },
      { pitch: 'D4', onset: 2 + (tickSeconds * 40), gateEnd: 2 + (tickSeconds * 41) },
    ];
    const runtime = await evaluateGeneratedStrudelCode(result.code, { exactBpm: result.config.bpm });
    try {
      const events = runtime.querySeconds(0, result.sharedSpanSeconds * 2).sort((a, b) => a.onsetSeconds - b.onsetSeconds);
      expect(events).toHaveLength(expected.length);
      events.forEach((event, index) => {
        expect(event.value.note).toBe(expected[index].pitch);
        expect(event.onsetSeconds).toBe(expected[index].onset);
        expect(event.value.velocity).toBeUndefined();
        // Distinct one-tick gate and gap survive; the gate is within 0.0005 of its slot.
        expect(Math.abs(event.gateEndSeconds - expected[index].gateEnd)).toBeLessThanOrEqual(gateTolerance(event));
        expect(event.gateEndSeconds).toBeLessThan(expected[index].onset + tickSeconds * 2);
      });
    } finally { runtime.stop(); }
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

describe('emitted tempo', () => {
  it('emits a display-rounded BPM within 0.0005 of the exact tempo', async () => {
    const midi = new Midi();
    midi.header.setTempo(135);
    midi.addTrack().addNote({ midi: 60, ticks: 0, durationTicks: 480 });
    const result = convertMidi(midi.toArray().buffer, 'tempo.mid');
    const emitted = Number(/const BPM = ([^;]+);/.exec(result.code)![1]);
    expect(result.config.bpm).not.toBe(135);
    expect(emitted).toBe(135);
    expect(Math.abs(emitted - result.config.bpm)).toBeLessThanOrEqual(0.0005);
    expect(result.code).toContain('// @details BPM: 135 |');
  });
});
