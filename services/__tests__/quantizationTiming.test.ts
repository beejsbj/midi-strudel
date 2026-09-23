import MidiPackage from '@tonejs/midi';
import { expect, it } from 'vitest';
import { convertMidi } from '../convertMidi';
import { evaluateGeneratedStrudelCode } from './helpers/strudelRuntime';

const { Midi } = MidiPackage;

it('preserves the minimum gate with zero quantization strength and rejected grid snapping', async () => {
  const midi = new Midi();
  midi.header.setTempo(120);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4], measures: 0 });
  const track = midi.addTrack();
  for (const start of [0, 3840, 7680]) {
    for (let index = 0; index < 12; index++) {
      track.addNote({ midi: 60 + index % 7, ticks: start + index * 120 + 10,
        durationTicks: 1, velocity: 0.7 });
    }
  }
  const bytes = midi.toArray().buffer;
  const source = new Midi(bytes);
  const result = convertMidi(bytes, 'short-gates.mid', {
    renderingMode: 'structured', isQuantized: true,
    quantizationStrength: 0, quantizationThreshold: 0,
  });
  expect(result.patterns.definitions).toHaveLength(1);
  expect(result.patterns.occurrences).toHaveLength(3);
  const runtime = await evaluateGeneratedStrudelCode(result.code);
  try {
    const expected = [0, result.sharedSpanSeconds].flatMap(offset =>
      source.tracks[0].notes.map(note => ({ onset: note.time + offset, gate: 0.125 })));
    const actual = runtime.querySeconds(0, result.sharedSpanSeconds * 2)
      .sort((a, b) => a.onsetSeconds - b.onsetSeconds);
    expect(actual).toHaveLength(expected.length);
    actual.forEach((event, index) => {
      expect(event.onsetSeconds).toBeCloseTo(expected[index].onset, 9);
      expect(event.gateEndSeconds - event.onsetSeconds).toBeCloseTo(expected[index].gate, 9);
    });
  } finally { runtime.stop(); }
});
