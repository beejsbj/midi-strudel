import MidiPackage from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { convertMidi } from '../convertMidi';
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

  it('keeps three-decimal clips where they are already exact enough', () => {
    const bytes = buildMidi(120, [4, 4], [{ ticks: 0, durationTicks: 289 }, { ticks: 960, durationTicks: 289 }]);
    expect(convertMidi(bytes, 'normal.mid').code).toMatch(/\.clip\(0\.602\)/);
  });
});
