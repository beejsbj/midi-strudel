import MidiPackage from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { convertMidi } from '../convertMidi';
import { evaluateGeneratedStrudelCode, gateTolerance } from './helpers/strudelRuntime';
import { snapToEar } from '../notation/EarTiming';
import type { Track } from '../../types';

const { Midi } = MidiPackage;

it('keeps timing 10.4 ms off the grid, and its 1-tick gates, exactly as played', async () => {
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
  const result = convertMidi(bytes, 'short-gates.mid');
  expect(result.diagnostics).toEqual([]);
  expect(result.patterns.definitions).toHaveLength(1);
  expect(result.patterns.occurrences).toHaveLength(3);
  const runtime = await evaluateGeneratedStrudelCode(result.code, { exactBpm: result.config.bpm });
  try {
    const expected = [0, result.sharedSpanSeconds].flatMap(offset =>
      source.tracks[0].notes.map(note => ({ onset: note.time + offset, gate: note.duration })));
    const actual = runtime.querySeconds(0, result.sharedSpanSeconds * 2)
      .sort((a, b) => a.onsetSeconds - b.onsetSeconds);
    expect(actual).toHaveLength(expected.length);
    actual.forEach((event, index) => {
      expect(event.onsetSeconds).toBeCloseTo(expected[index].onset, 9);
      const actualGate = event.gateEndSeconds - event.onsetSeconds;
      expect(Math.abs(actualGate - expected[index].gate)).toBeLessThanOrEqual(gateTolerance(event));
    });
  } finally { runtime.stop(); }
});

describe('snapToEar', () => {
  const track = (ticks: Array<[number, number]>, bpm = 120, ppq = 480): Track => ({
    id: 't', name: 't', isDrum: false,
    sourceTiming: { ppq, tempos: [{ ticks: 0, bpm }], timeSignatures: [] },
    notes: ticks.map(([start, length], index) => ({
      note: 'C4', midi: 60, velocity: 0.8,
      noteOn: start * 60 / bpm / ppq, noteOff: (start + length) * 60 / bpm / ppq,
      source: { id: String(index), ticks: start, durationTicks: length },
    })),
  });
  const snapped = (input: Track) => snapToEar(input, 120).notes.map(({ source }) => [source!.ticks, source!.durationTicks]);

  it('pulls played jitter onto the simplest grid and reports the largest move', () => {
    // 9 ticks (9.4 ms) late on a sixteenth; 5 ticks early on a triplet.
    const result = snapToEar(track([[129, 111], [155, 100]]), 120);
    expect(result.notes.map(({ source }) => [source!.ticks, source!.durationTicks])).toEqual([[120, 120], [160, 95]]);
    expect(result.moved).toBe(2);
    expect(result.maxShiftSeconds).toBeCloseTo(9 / 960, 12);
  });

  it('keeps exact quintuplets and septuplets rather than pulling them to a finer grid', () => {
    const quintuplets = [0, 96, 192, 288, 384].map((start): [number, number] => [start, 96]);
    const septuplets = [0, 69, 137, 206, 274, 343, 411].map((start, index, all): [number, number] =>
      [start, (all[index + 1] ?? 480) - start]);
    expect(snapped(track(quintuplets))).toEqual(quintuplets);
    expect(snapped(track(septuplets))).toEqual(septuplets);
  });

  it('lets a fine grid claim only an eighth of its step', () => {
    // 64ths are 30 ticks apart: 3 ticks off snaps, 4 ticks off stays as played.
    expect(snapped(track([[483 + 30, 60], [484 + 30, 60]]))).toEqual([[510, 60], [514, 60]]);
  });

  it('never silences a note: a gate shorter than the tolerance keeps its length', () => {
    expect(snapped(track([[0, 1], [482, 3]]))).toEqual([[0, 1], [480, 3]]);
  });

  it('leaves audible offsets and tempo-changing tracks exactly as played', () => {
    expect(snapped(track([[17, 83]]))).toEqual([[17, 83]]);
    const changing = track([[5, 115]]);
    changing.sourceTiming!.tempos.push({ ticks: 960, bpm: 90 });
    expect(snapToEar(changing, 120)).toMatchObject({ moved: 0 });
  });
});
