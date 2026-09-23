import { describe, expect, it } from 'vitest';
import MidiPackage from '@tonejs/midi';
import { convertMidi, createMidiProject } from '../convertMidi';
import { parseMidiBuffer } from '../MidiParser';
import { StrudelNotation } from '../StrudelNotation';
import { evaluateGeneratedStrudelCode } from './helpers/strudelRuntime';
import { DRUM_MAP } from '../../constants';

const { Midi } = MidiPackage;

describe('structured public conversion', () => {
  it.each(['absolute', 'relative'] as const)('preserves weighted irregular beats, overlapping gates and duplicates in %s pitch mode', async (notationType) => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    const notes = [
      { midi: 60, ticks: 0, durationTicks: 2040, velocity: 0.8 },
      { midi: 60, ticks: 0, durationTicks: 120, velocity: 0.6 },
      { midi: 64, ticks: 17, durationTicks: 620, velocity: 0.4 },
      { midi: 67, ticks: 239, durationTicks: 50, velocity: 0.7 },
      ...[0, 160, 320].map((offset) => ({ midi: 62, ticks: 480 + offset, durationTicks: 80, velocity: 0.5 })),
      { midi: 65, ticks: 1980, durationTicks: 90, velocity: 0.3 },
    ];
    notes.forEach((note) => track.addNote(note));
    const bytes = midi.toArray().buffer;
    const result = convertMidi(bytes, 'unfamiliar.mid', { renderingMode: 'structured', includeVelocity: true, notationType, isQuantized: false });
    expect(result.diagnostics).toEqual([]);
    expect(result.code).toMatch(/@\d+/);
    expect(result.code).toContain(notationType === 'relative' ? 'n(`' : 'note(`');
    const source = new Midi(bytes).tracks[0].notes;
    const runtime = await evaluateGeneratedStrudelCode(result.code);
    try {
      const { twoLoops, firstBoundary, secondBoundary } = runtime.queryTwoLoopsAndBoundaryWindows(4);
      const expected = [0, 4].flatMap((offset) => source.map((note) => ({
        onset: note.time + offset, end: note.time + note.duration + offset, velocity: note.velocity, midi: note.midi,
      }))).sort((a, b) => a.onset - b.onset || a.midi - b.midi || a.velocity - b.velocity);
      const pitch = (value: unknown): number => typeof value === 'number' ? value : source.find((note) => note.name === value)?.midi;
      const actual = twoLoops.sort((a, b) => a.onsetSeconds - b.onsetSeconds || pitch(a.value.note) - pitch(b.value.note) || Number(a.value.velocity) - Number(b.value.velocity));
      expect(actual).toHaveLength(expected.length);
      expected.forEach((note, index) => {
        expect(pitch(actual[index].value.note)).toBe(note.midi);
        expect(actual[index].onsetSeconds).toBeCloseTo(note.onset, 9);
        expect(actual[index].gateEndSeconds).toBeCloseTo(note.end, 9);
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
      renderingMode: 'structured', cycleUnit: 'beat', bpm: 90, timeSignature: { numerator: 3, denominator: 4 }, includeVelocity: true,
    });
    const runtime = await evaluateGeneratedStrudelCode(result.code);
    try {
      const events = runtime.querySeconds(0, 16 / 3).sort((a, b) => a.onsetSeconds - b.onsetSeconds || String(a.value.s).localeCompare(String(b.value.s)));
      expect(result.sharedSpanSeconds).toBe(2);
      expect(events).toHaveLength(6);
      expect(events.map((event) => event.value.s)).toEqual([DRUM_MAP[36], DRUM_MAP[42], DRUM_MAP[42], DRUM_MAP[36], DRUM_MAP[42], DRUM_MAP[42]]);
      expect(events.map((event) => event.onsetSeconds)).toEqual([0, 0, 1 / 3, 8 / 3, 8 / 3, 3]);
      expect(events[1].gateEndSeconds).toBeCloseTo(0.125, 9);
      expect(events[2].gateEndSeconds).toBeCloseTo(11 / 24, 9);
      expect(events.every((event) => event.value.bank === 'RolandTR909')).toBe(true);
    } finally { runtime.stop(); }
  });

  it('retains requested quantization through an explicit literal fallback without rewriting provenance', async () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    midi.addTrack().addNote({ midi: 60, ticks: 17, durationTicks: 100 });
    const parsed = parseMidiBuffer(midi.toArray().buffer);
    const before = JSON.stringify(parsed.tracks);
    const { config, tracks } = createMidiProject(parsed, 'quantized.mid', {
      renderingMode: 'structured', isQuantized: true, quantizationThreshold: 100, quantizationStrength: 100,
    });
    const result = new StrudelNotation(config).generateWithDiagnostics(tracks);
    expect(JSON.stringify(parsed.tracks)).toBe(before);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'precise-literal-fallback' }));
    const runtime = await evaluateGeneratedStrudelCode(result.code);
    try {
      const events = runtime.querySeconds(0, 4);
      expect(events.map((event) => event.onsetSeconds)).toEqual([0, 2]);
      expect(events[0].gateEndSeconds).toBe(0.125);
    } finally { runtime.stop(); }
  });
});
