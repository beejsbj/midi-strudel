import { describe, expect, it } from 'vitest';
import { detectKey } from '../KeyDetector';
import type { Track } from '../../types';

function melodicTrack(midiNotes: number[]): Track {
  return {
    id: 'track-1',
    name: 'Melody',
    isDrum: false,
    notes: midiNotes.map((midi, index) => ({
      midi,
      note: `N${midi}`,
      noteOn: index * 0.5,
      noteOff: index * 0.5 + 0.5,
      velocity: 0.8,
    })),
  };
}

describe('detectKey', () => {
  it('returns normalized confidence values', () => {
    const detected = detectKey([melodicTrack([60, 64, 67, 72, 76, 79])]);

    expect(detected).not.toBeNull();
    expect(detected?.confidence).toBeGreaterThanOrEqual(0);
    expect(detected?.confidence).toBeLessThanOrEqual(1);
  });

  it('ignores drum-only input', () => {
    const detected = detectKey([
      {
        id: 'drums',
        name: 'Drums',
        isDrum: true,
        notes: [
          { midi: 36, note: 'C2', noteOn: 0, noteOff: 0.25, velocity: 1 },
          { midi: 38, note: 'D2', noteOn: 0.5, noteOff: 0.75, velocity: 1 },
        ],
      },
    ]);

    expect(detected).toBeNull();
  });
});
