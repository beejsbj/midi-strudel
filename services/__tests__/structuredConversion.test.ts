import { describe, expect, it } from 'vitest';
import MidiPackage from '@tonejs/midi';
import { convertMidi, createMidiProject } from '../convertMidi';
import { parseMidiBuffer } from '../MidiParser';
import { StrudelNotation } from '../StrudelNotation';
import { evaluateGeneratedStrudelCode, gateTolerance } from './helpers/strudelRuntime';
import { earNotes } from './helpers/earOracle';

/** Round velocity to three decimals, matching the converter's rounding. */
const roundedVelocity = (velocity: number): number => Math.round(velocity * 1000) / 1000;

const { Midi } = MidiPackage;

describe('structured public conversion', () => {
  it.each(['absolute', 'relative'] as const)('preserves weighted irregular beats, overlapping gates and duplicates in %s pitch mode', async (notationType) => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    const notes = [
      { midi: 60, ticks: 0, durationTicks: 2040, velocity: 0.8 },
      { midi: 60, ticks: 0, durationTicks: 120, velocity: 0.6 },
      { midi: 64, ticks: 17, durationTicks: 606, velocity: 0.4 },
      { midi: 67, ticks: 229, durationTicks: 60, velocity: 0.7 },
      ...[0, 160, 320].map((offset) => ({ midi: 62, ticks: 480 + offset, durationTicks: 80, velocity: 0.5 })),
      { midi: 65, ticks: 1980, durationTicks: 90, velocity: 0.3 },
    ];
    notes.forEach((note) => track.addNote(note));
    const bytes = midi.toArray().buffer;
    const result = convertMidi(bytes, 'unfamiliar.mid', { includeVelocity: true, notationType });
    expect(result.diagnostics).toEqual([]);
    expect(result.code).toMatch(/@\d+/);
    expect(result.code).toContain(notationType === 'relative' ? 'n(`' : 'note(`');
    const source = earNotes(new Midi(bytes).tracks[0].notes, 120, 480);
    const runtime = await evaluateGeneratedStrudelCode(result.code, { exactBpm: result.config.bpm });
    try {
      const { twoLoops, firstBoundary, secondBoundary } = runtime.queryTwoLoopsAndBoundaryWindows(4);
      const expected = [0, 4].flatMap((offset) => source.map((note) => ({
        onset: note.time + offset, end: note.time + note.duration + offset, velocity: roundedVelocity(note.velocity), midi: note.midi,
      }))).sort((a, b) => a.onset - b.onset || a.midi - b.midi || a.velocity - b.velocity);
      const pitch = (value: unknown): number => typeof value === 'number' ? value : source.find((note) => note.name === value)?.midi;
      const actual = twoLoops.sort((a, b) => a.onsetSeconds - b.onsetSeconds || pitch(a.value.note) - pitch(b.value.note) || Number(a.value.velocity) - Number(b.value.velocity));
      expect(actual).toHaveLength(expected.length);
      expected.forEach((note, index) => {
        expect(pitch(actual[index].value.note)).toBe(note.midi);
        expect(actual[index].onsetSeconds).toBeCloseTo(note.onset, 9);
        expect(Math.abs(actual[index].gateEndSeconds - note.end)).toBeLessThanOrEqual(gateTolerance(actual[index]));
        expect(actual[index].value.velocity).toBe(note.velocity);
      });
      expect(firstBoundary).toHaveLength(2);
      expect(secondBoundary).toHaveLength(2);
    } finally { runtime.stop(); }
  });

  it('preserves mapped drum controls and the shared source span with beat cycles and another playback meter', async () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    track.channel = 9;
    track.addNote({ midi: 42, ticks: 0, durationTicks: 90, velocity: 0.8 });
    track.addNote({ midi: 36, ticks: 0, durationTicks: 480, velocity: 0.6 });
    track.addNote({ midi: 42, ticks: 240, durationTicks: 90, velocity: 0.4 });
    const result = convertMidi(midi.toArray().buffer, 'kit.mid', {
      bpm: 90, timeSignature: { numerator: 3, denominator: 4 }, includeVelocity: true,
    });
    const runtime = await evaluateGeneratedStrudelCode(result.code, { exactBpm: result.config.bpm });
    try {
      const events = runtime.querySeconds(0, 16 / 3).sort((a, b) => a.onsetSeconds - b.onsetSeconds || String(a.value.s).localeCompare(String(b.value.s)));
      expect(result.sharedSpanSeconds).toBe(2);
      expect(events).toHaveLength(6);
      expect(events.map((event) => event.value.s)).toEqual(['bd', 'hh', 'hh', 'bd', 'hh', 'hh']);
      expect(events.map((event) => event.onsetSeconds)).toEqual([0, 0, 1 / 3, 8 / 3, 8 / 3, 3]);
      // Drum hits are one-shots: no clip, so samples play out whatever their MIDI length.
      expect(result.code).not.toContain('.clip(');
      expect(events.every((event) => event.value.bank === 'RolandTR909')).toBe(true);
    } finally { runtime.stop(); }
  });

  it('snaps inaudible timing to the grid without rewriting provenance', async () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    // 7 ticks (7.3 ms) late snaps to the beat; 17 ticks (17.7 ms) is heard and stays.
    track.addNote({ midi: 60, ticks: 7, durationTicks: 233 });
    track.addNote({ midi: 62, ticks: 480 + 17, durationTicks: 83 });
    const parsed = parseMidiBuffer(midi.toArray().buffer);
    const before = JSON.stringify(parsed.tracks);
    const { config, tracks } = createMidiProject(parsed, 'played.mid');
    const result = new StrudelNotation(config).generateWithDiagnostics(tracks);
    expect(JSON.stringify(parsed.tracks)).toBe(before);
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'snapped-to-ear', severity: 'info', count: 1 })]);
    expect(result.diagnostics[0].message).toContain('7.3 ms');
    const runtime = await evaluateGeneratedStrudelCode(result.code, { exactBpm: config.bpm });
    try {
      const events = runtime.querySeconds(0, 2);
      expect(events.map((event) => event.onsetSeconds)).toEqual([0, (480 + 17) / 960]);
      // 7 + 233 = 240 ticks: the release was already on the half beat.
      expect(events[0].gateEndSeconds).toBe(0.25);
    } finally { runtime.stop(); }
  });

  it.each([
    { notationType: 'absolute' as const, includeVelocity: true },
    { notationType: 'relative' as const, includeVelocity: true },
    { notationType: 'absolute' as const, includeVelocity: false },
    { notationType: 'relative' as const, includeVelocity: false },
  ])('groups matching chord attacks, merging identical doubles and keeping retained velocity: %j', async ({ notationType, includeVelocity }) => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    for (const ticks of [0, 480, 960, 1440]) {
      for (const pitch of [60, 60, 64, 67]) {
        track.addNote({ midi: pitch, ticks, durationTicks: 160, velocity: pitch === 67 ? 0.4 : 0.8 });
      }
    }
    const bytes = midi.toArray().buffer;
    const result = convertMidi(bytes, 'chords.mid', { notationType, includeVelocity });
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'merged-duplicate-notes', count: 4 })]);
    expect(result.code).toContain('.clip(1/3)');
    expect(result.code).not.toContain('.slow(1)');
    expect(result.code).toContain('!4');
    if (notationType === 'absolute') {
      expect(result.code).toContain(includeVelocity ? '[C4,E4]' : '[C4,E4,G4]');
    }
    // Each attack's second C4 is an identical double and merges.
    const source = new Midi(bytes).tracks[0].notes.filter((note, index, notes) =>
      notes.findIndex((other) => other.midi === note.midi && other.ticks === note.ticks) === index);
    const runtime = await evaluateGeneratedStrudelCode(result.code, { exactBpm: result.config.bpm });
    try {
      const pitch = (value: unknown): number => typeof value === 'number' ? value : source.find((note) => note.name === value)!.midi;
      const actual = runtime.querySeconds(0, 4).sort((a, b) => a.onsetSeconds - b.onsetSeconds || pitch(a.value.note) - pitch(b.value.note));
      const expected = [0, 2].flatMap((offset) => source.map((note) => ({ ...note, velocity: roundedVelocity(note.velocity), onset: note.time + offset, end: note.time + note.duration + offset })))
        .sort((a, b) => a.onset - b.onset || a.midi - b.midi);
      expect(actual).toHaveLength(expected.length);
      expected.forEach((note, index) => {
        expect(pitch(actual[index].value.note)).toBe(note.midi);
        expect(actual[index].onsetSeconds).toBeCloseTo(note.onset, 9);
        expect(Math.abs(actual[index].gateEndSeconds - note.end)).toBeLessThanOrEqual(gateTolerance(actual[index]));
        expect(actual[index].value.velocity).toBe(includeVelocity ? note.velocity : undefined);
      });
    } finally { runtime.stop(); }
  });

  it('keeps changing gate patterns numeric without mini-notation division or template interpolation', async () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    [60, 62, 64, 65].forEach((pitch, index) => track.addNote({
      midi: pitch, ticks: index * 480, durationTicks: index < 2 ? 160 : 240, velocity: 0.8,
    }));
    const bytes = midi.toArray().buffer;
    const result = convertMidi(bytes, 'changing-gates.mid', { includeVelocity: true });
    expect(result.code).toContain('0.333!2');
    expect(result.code).not.toContain('${');
    const runtime = await evaluateGeneratedStrudelCode(result.code, { exactBpm: result.config.bpm });
    try {
      const source = new Midi(bytes).tracks[0].notes;
      const actual = runtime.querySeconds(0, 4).sort((a, b) => a.onsetSeconds - b.onsetSeconds);
      expect(actual).toHaveLength(source.length * 2);
      actual.forEach((event, index) => {
        const note = source[index % source.length];
        const offset = Math.floor(index / source.length) * 2;
        const expectedEnd = note.time + note.duration + offset;
        expect(event.value.note).toBe(note.name);
        expect(event.onsetSeconds).toBeCloseTo(note.time + offset, 9);
        expect(Math.abs(event.gateEndSeconds - expectedEnd)).toBeLessThanOrEqual(gateTolerance(event));
        expect(event.value.velocity).toBe(roundedVelocity(note.velocity));
      });
    } finally { runtime.stop(); }
  });
});
