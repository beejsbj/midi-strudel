import { describe, expect, it } from 'vitest';
import { type StrudelConfig } from '../../types';
import MidiPackage from '@tonejs/midi';
import { convertMidi } from '../convertMidi';
import { evaluateGeneratedStrudelCode } from './helpers/strudelRuntime';
import { getCycleDuration } from '../notation/NotationUtils';

const { Midi } = MidiPackage;

const queryConvertedOnsets = async (code: string, sharedSpanSeconds: number, config: StrudelConfig) => {
  const runtime = await evaluateGeneratedStrudelCode(code, { secondsPerCycle: getCycleDuration(config) });
  try {
    return runtime.queryTwoLoopsAndBoundaryWindows(sharedSpanSeconds).twoLoops
      .map((event) => ({
        pitch: event.value.note,
        onset: event.onsetSeconds,
        gateEnd: event.gateEndSeconds,
        velocity: event.value.velocity,
      }))
      .sort((left, right) => left.onset - right.onset || Number(left.velocity) - Number(right.velocity));
  } finally {
    runtime.stop();
  }
};

describe('sparse public converter runtime', () => {
  it('preserves sparse fractional events across a long shared span and repeated loops', async () => {
    const midi = new Midi();
    midi.header.fromJSON({ ...midi.header.toJSON(), ppq: 960 });
    midi.header.setTempo(120);
    const track = midi.addTrack();
    track.name = 'Sparse performance';
    const velocity = (midiVelocity: number) => midiVelocity / 127;
    track.addNote({ midi: 60, ticks: 240, durationTicks: 120, velocity: velocity(32) });
    track.addNote({ midi: 64, ticks: 1200, durationTicks: 180, velocity: velocity(96) });
    track.addNote({ midi: 60, ticks: 1230, durationTicks: 90, velocity: velocity(48) });
    track.addNote({ midi: 67, ticks: 58080, durationTicks: 240, velocity: velocity(112) });
    track.addNote({ midi: 67, ticks: 58530, durationTicks: 150, velocity: velocity(64) });

    const result = convertMidi(midi.toArray().buffer, 'long-sparse.mid', { includeVelocity: true });
    const observed = await queryConvertedOnsets(result.code, result.sharedSpanSeconds, result.config);

    // At 120 BPM and 960 PPQ, one tick is 1/1920 second. The last event
    // ends before 30.7 seconds, so source-meter rounding gives a 32-second
    // shared span and each source event repeats one span later.
    expect(result.sharedSpanSeconds).toBe(32);
    expect(observed).toEqual([
      { pitch: 'C4', onset: 1 / 8, gateEnd: 3 / 16, velocity: 32 / 127 },
      { pitch: 'E4', onset: 5 / 8, gateEnd: 23 / 32, velocity: 96 / 127 },
      { pitch: 'C4', onset: 41 / 64, gateEnd: 11 / 16, velocity: 48 / 127 },
      { pitch: 'G4', onset: 121 / 4, gateEnd: 243 / 8, velocity: 112 / 127 },
      { pitch: 'G4', onset: 1951 / 64, gateEnd: 1951 / 64 + 5 / 64, velocity: 64 / 127 },
      { pitch: 'C4', onset: 257 / 8, gateEnd: 257 / 8 + 1 / 16, velocity: 32 / 127 },
      { pitch: 'E4', onset: 261 / 8, gateEnd: 261 / 8 + 3 / 32, velocity: 96 / 127 },
      { pitch: 'C4', onset: 2089 / 64, gateEnd: 2092 / 64, velocity: 48 / 127 },
      { pitch: 'G4', onset: 249 / 4, gateEnd: 499 / 8, velocity: 112 / 127 },
      { pitch: 'G4', onset: 3999 / 64, gateEnd: 4004 / 64, velocity: 64 / 127 },
    ]);
  });
});
