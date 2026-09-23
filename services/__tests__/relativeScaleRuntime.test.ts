import MidiPackage from '@tonejs/midi';
import { expect, it } from 'vitest';
import { convertMidi } from '../convertMidi';
import { evaluateGeneratedStrudelCode } from './helpers/strudelRuntime';

const { Midi } = MidiPackage;
const numericPitch = (value: unknown): number => {
  if (typeof value === 'number') return value;
  const match = /^([A-Ga-g])([#b]*)(-?\d+)$/.exec(String(value))!;
  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1].toUpperCase()]!;
  return (Number(match[3]) + 1) * 12 + semitone
    + [...match[2]].reduce((sum, char) => sum + (char === '#' ? 1 : -1), 0);
};

it('preserves relative pitches and long gates over a sparse structured score', async () => {
  const midi = new Midi();
  midi.header.setTempo(120);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4], measures: 0 });
  const track = midi.addTrack();
  const pitches = [60, 64, 67, 63, 62, 65, 69, 71, 72, 67, 64, 60];
  for (const bar of [1, 80, 180]) {
    pitches.forEach((pitch, index) => track.addNote({ midi: pitch,
      ticks: bar * 1920 + index * 120, durationTicks: 60 + index * 3, velocity: (80 + index) / 127 }));
  }
  // Explicit unmatched material includes a gate spanning many playback cycles.
  track.addNote({ midi: 48, ticks: 220 * 1920, durationTicks: 20 * 1920 + 120, velocity: 0.6 });
  track.addNote({ midi: 74, ticks: 255 * 1920, durationTicks: 120, velocity: 0.8 });
  const bytes = midi.toArray().buffer;
  const source = new Midi(bytes).tracks[0].notes;
  const result = convertMidi(bytes, 'sparse-relative.mid', {
    notationType: 'relative', includeVelocity: true,
  });
  expect(result.config.key).toBeDefined();
  expect(result.code).toContain('n(');
  expect(result.code).toContain('.scale(');
  expect(result.sharedSpanSeconds).toBe(512);
  expect(result.patterns.definitions).toHaveLength(1);
  expect(result.patterns.occurrences).toHaveLength(3);
  const runtime = await evaluateGeneratedStrudelCode(result.code, { exactBpm: result.config.bpm });
  try {
    const expected = [0, 512].flatMap(offset => source.map(note => ({
      onset: note.time + offset, end: note.time + note.duration + offset,
      pitch: note.midi, velocity: note.velocity,
    })));
    const actual = runtime.querySeconds(0, 1024).sort((a, b) => a.onsetSeconds - b.onsetSeconds);
    expect(actual).toHaveLength(expected.length);
    actual.forEach((event, index) => {
      expect(numericPitch(event.value.note)).toBe(expected[index].pitch);
      expect(event.onsetSeconds).toBeCloseTo(expected[index].onset, 9);
      expect(event.gateEndSeconds).toBeCloseTo(expected[index].end, 9);
      expect(event.value.velocity).toBe(expected[index].velocity);
    });
    for (const boundary of [512, 1024]) {
      expect(runtime.querySeconds(boundary - 1e-6, boundary + 1e-6)).toHaveLength(0);
    }
  } finally { runtime.stop(); }
}, 30000);
