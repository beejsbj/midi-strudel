import { describe, it, expect } from 'vitest';
import {
  gcd,
  getCycleDuration,
  getMeasureDuration,
  getMeterBeatDuration,
  formatTrackName,
  buildVisualSuffix,
  formatBpm,
} from '../NotationUtils';
import { DEFAULT_CONFIG } from '../../../types';

describe('gcd', () => {
  it('computes gcd of common values', () => {
    expect(gcd(12, 8)).toBe(4);
    expect(gcd(9, 6)).toBe(3);
    expect(gcd(7, 1)).toBe(1);
  });

  it('returns the number itself when b is 0', () => {
    expect(gcd(5, 0)).toBe(5);
  });
});

describe('meter durations', () => {
  it('uses denominator-aware beat and bar lengths for 6/8', () => {
    const config = {
      ...DEFAULT_CONFIG,
      sourceBpm: 120,
      cycleUnit: 'bar' as const,
      timeSignature: { numerator: 6, denominator: 8 },
    };

    expect(getMeterBeatDuration(config)).toBe(0.25);
    expect(getMeasureDuration(config)).toBe(1.5);
    expect(getCycleDuration(config)).toBe(1.5);
  });

  it('uses denominator-aware beat cycles for non-quarter meters', () => {
    const config = {
      ...DEFAULT_CONFIG,
      sourceBpm: 120,
      cycleUnit: 'beat' as const,
      timeSignature: { numerator: 3, denominator: 2 },
    };

    expect(getMeterBeatDuration(config)).toBe(1);
    expect(getCycleDuration(config)).toBe(1);
  });
});

describe('formatTrackName', () => {
  it('uppercases and replaces special chars with underscores', () => {
    expect(formatTrackName('Piano 1')).toBe('PIANO_1');
    // trailing special chars are converted then stripped
    expect(formatTrackName('drums!')).toBe('DRUMS');
  });

  it('collapses consecutive underscores', () => {
    expect(formatTrackName('my--track')).toBe('MY_TRACK');
  });

  it('strips leading and trailing underscores', () => {
    expect(formatTrackName(' track ')).toBe('TRACK');
  });
});

describe('buildVisualSuffix', () => {
  it('does not inject markcss for editor-only playback coloring', () => {
    const config = {
      ...DEFAULT_CONFIG,
      isNoteColoringEnabled: true,
      isProgressiveFillEnabled: true,
    };

    expect(buildVisualSuffix(config)).not.toContain('markcss');
  });

  it('uses single quotes for track hsl colors', () => {
    const config = {
      ...DEFAULT_CONFIG,
      isTrackColoringEnabled: true,
    };

    const suffix = buildVisualSuffix(config, {
      id: 'track-1',
      name: 'Piano',
      notes: [],
      color: '210',
      isDrum: false,
    });

    expect(suffix).toContain(".color('hsl(210,60%,60%)')");
  });
});

describe('formatBpm', () => {
  it('rounds display tempo to three decimals without touching integer zeros', () => {
    expect(formatBpm(120)).toBe('120');
    expect(formatBpm(100)).toBe('100');
    expect(formatBpm(135.000135000135)).toBe('135');
    expect(formatBpm(123.45602804920958)).toBe('123.456');
    expect(formatBpm(90.5)).toBe('90.5');
  });
});
