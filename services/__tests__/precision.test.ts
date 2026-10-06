import MidiPackage from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { convertMidi } from '../convertMidi';
import { trackControlsFor, type RhythmNode, type StructuredEvent } from '../notation/StructuredRenderer';
import type { StrudelConfig } from '../../types';
import { evaluateGeneratedStrudelCode } from './helpers/strudelRuntime';

const { Midi } = MidiPackage;

const buildMidi = (bpm: number, meter: [number, number], notes: Array<{ ticks: number; durationTicks: number }>) => {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: meter, measures: 0 });
  const track = midi.addTrack();
  for (const note of notes) track.addNote({ midi: 60, velocity: 0.8, ...note });
  return midi.toArray().buffer;
};

describe('gate precision', () => {
  // Release errors are measured directly: no slot-scaled tolerance.
  const releaseErrors = async (syntax: 'chained' | 'colon') => {
    const bytes = buildMidi(4, [16, 4], [{ ticks: 0, durationTicks: 7601 }]);
    const result = convertMidi(bytes, 'long-gate.mid', syntax === 'colon' ? { controlSyntax: 'colon' } : undefined);
    const runtime = await evaluateGeneratedStrudelCode(result.code, { exactBpm: result.config.bpm });
    try {
      const events = runtime.querySeconds(0, result.sharedSpanSeconds);
      expect(events).toHaveLength(1);
      return { code: result.code, release: events[0].gateEndSeconds, onset: events[0].onsetSeconds };
    } finally { runtime.stop(); }
  };

  // 7,601 ticks at 4 BPM, PPQ 480
  const exactRelease = 7601 * 60 / 4 / 480;

  it('releases a very long constant gate within 1 ms of the exact release', async () => {
    const { code, release, onset } = await releaseErrors('chained');
    expect(onset).toBeCloseTo(0, 9);
    expect(code).toContain('.clip(');
    expect(Math.abs(release - exactRelease)).toBeLessThanOrEqual(0.001);
  });

  it('does the same through colon clip fields', async () => {
    const { release } = await releaseErrors('colon');
    expect(Math.abs(release - exactRelease)).toBeLessThanOrEqual(0.001);
  });

  it('holds the bound in playback time when the BPM override slows the song', async () => {
    // 120 BPM source played at 20 BPM: a 7,680-tick slot lasts 48 s (9,499 ticks sits off the ear-snap grid), so a source-time error is stretched 6x.
    const bytes = buildMidi(120, [16, 4], [{ ticks: 0, durationTicks: 9499 }]);
    const result = convertMidi(bytes, 'slowed.mid', { bpm: 20 });
    expect(result.config.bpm).toBe(20);
    const runtime = await evaluateGeneratedStrudelCode(result.code, { exactBpm: result.config.bpm });
    try {
      const [event] = runtime.querySeconds(0, result.sharedSpanSeconds);
      const exactRelease = 9499 * 60 / 120 / 480 * 120 / 20;
      expect(Math.abs(event.gateEndSeconds - exactRelease)).toBeLessThanOrEqual(0.001);
    } finally { runtime.stop(); }
  });

  it('keeps three-decimal clips where they are already exact enough', () => {
    const bytes = buildMidi(120, [4, 4], [{ ticks: 0, durationTicks: 289 }, { ticks: 960, durationTicks: 289 }]);
    expect(convertMidi(bytes, 'normal.mid').code).toMatch(/\.clip\(0\.602\)/);
  });
});

describe('playback tempo precision', () => {
  it('does not drift a late note when the BPM is not a short decimal', async () => {
    // 30.00049 BPM parses as 30.000495...; displayed to three decimals that is 30.
    const bytes = buildMidi(30.00049, [4, 4], [{ ticks: 0, durationTicks: 480 }, { ticks: 1_728_000, durationTicks: 480 }]);
    const result = convertMidi(bytes, 'slow.mid');
    // No exactBpm/secondsPerCycle correction: the emitted code alone sets the tempo.
    const runtime = await evaluateGeneratedStrudelCode(result.code);
    try {
      const exactOnset = 1_728_000 * 60 / result.config.bpm / 480;
      const late = runtime.querySeconds(exactOnset - 1, exactOnset + 1);
      expect(late).toHaveLength(1);
      expect(Math.abs(late[0].onsetSeconds - exactOnset)).toBeLessThanOrEqual(0.001);
    } finally { runtime.stop(); }
  });

  it('measures drift over the playback-length loop when the BPM override slows the song', async () => {
    // Source 120 BPM, loop of 450 measures = 900 s; at 30.00049 BPM it lasts 3,600 s, so the drift is 4x the source-time estimate.
    const bytes = buildMidi(120, [4, 4], [{ ticks: 0, durationTicks: 480 }, { ticks: 864_000 - 480, durationTicks: 480 }]);
    const result = convertMidi(bytes, 'slowed-loop.mid', { bpm: 30.00049 });
    const emitted = Number(/const BPM = ([\d.]+);/.exec(result.code)![1]);
    const playbackSpan = result.sharedSpanSeconds * 120 / result.config.bpm;
    expect(Math.abs(emitted - result.config.bpm) / result.config.bpm * playbackSpan).toBeLessThanOrEqual(0.001);
  });

  it('keeps the short BPM for ordinary songs', () => {
    const bytes = buildMidi(125, [4, 4], [{ ticks: 0, durationTicks: 480 }, { ticks: 1920, durationTicks: 480 }]);
    expect(convertMidi(bytes, 'normal.mid').code).toContain('const BPM = 125;');
  });
});

describe('large structured tracks', () => {
  it('chooses a constant gate across 150,000 notes without overflowing the argument limit', () => {
    // A full end-to-end conversion of this size takes minutes; the spread lived in the control scan.
    const source = { event: { velocity: 0.8 } } as unknown as StructuredEvent;
    const children: RhythmNode[] = Array.from({ length: 150_000 }, () => (
      { kind: 'event', ticks: 120, gateTicks: 91, sources: [source], sourceGateTicks: [91], secondsPerTick: 0.001 }));
    const rhythm: RhythmNode = { kind: 'sequence', ticks: 120 * 150_000, grouping: 'song', children };
    const controls = trackControlsFor([rhythm], 'note', { includeVelocity: false } as StrudelConfig);
    expect(controls.clip).toBe('0.758');
  });
});
