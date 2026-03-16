import { describe, it, expect } from 'vitest';
import {
  gcd,
  lcm,
  isRest,
  getRestDuration,
  getCycleDuration,
  getMeasureDuration,
  getMeterBeatDuration,
  round,
  formatTrackName,
  buildVisualSuffix,
} from '../NotationUtils';
import { DEFAULT_CONFIG } from '../../../types';
import { createRestToken, createRestTokenCycles } from '../NotationUtils';

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

describe('lcm', () => {
  it('computes lcm of common values', () => {
    expect(lcm(4, 6)).toBe(12);
    expect(lcm(3, 4)).toBe(12);
    expect(lcm(2, 8)).toBe(8);
  });

  it('returns 0 when either argument is 0', () => {
    expect(lcm(0, 5)).toBe(0);
    expect(lcm(5, 0)).toBe(0);
  });
});

describe('round', () => {
  it('rounds to given precision', () => {
    expect(round(1.23456, 2)).toBe(1.23);
    expect(round(0.999999, 4)).toBe(1);
    expect(round(0.5, 0)).toBe(1);
  });
});

describe('isRest', () => {
  it('identifies bare rest tokens', () => {
    expect(isRest('~')).toBe(true);
    expect(isRest('[~]')).toBe(true);
  });

  it('identifies rest tokens with duration suffix', () => {
    expect(isRest('~@0.5')).toBe(true);
    expect(isRest('[~]@2')).toBe(true);
    expect(isRest('[~]@0.25')).toBe(true);
  });

  it('does NOT classify note tokens as rests', () => {
    expect(isRest('C4')).toBe(false);
    expect(isRest('bd')).toBe(false);
    expect(isRest('sd')).toBe(false);
    expect(isRest('hh')).toBe(false);
    expect(isRest('0')).toBe(false);
  });

  it('does NOT classify complex drum group tokens as rests', () => {
    expect(isRest('[bd sd]')).toBe(false);
    expect(isRest('{bd, hh}')).toBe(false);
  });
});

describe('getRestDuration', () => {
  it('returns 1 for bare rest', () => {
    expect(getRestDuration('~')).toBe(1);
  });

  it('parses the duration from @suffix', () => {
    expect(getRestDuration('~@0.5')).toBe(0.5);
    expect(getRestDuration('[~]@2')).toBe(2);
  });
});

describe('createRestToken', () => {
  const config = { ...DEFAULT_CONFIG, timingStyle: 'absoluteDuration' as const, durationPrecision: 4 };

  it('creates a bare rest when duration equals one cycle', () => {
    // sourceBpm=120, cycleUnit=bar, numerator=4 => cycleDur = 0.5s * 4 = 2s
    const cycleDur = (60 / 120) * 4; // 2
    const token = createRestToken(cycleDur, cycleDur, config);
    expect(token).toBe('~');
  });

  it('creates a suffixed rest for fractional cycles', () => {
    const cycleDur = 2;
    const token = createRestToken(1, cycleDur, config); // 0.5 cycles
    expect(token).toBe('~@0.5');
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

describe('createRestTokenCycles', () => {
  it('uses [~] in relativeDivision mode', () => {
    const config = { ...DEFAULT_CONFIG, timingStyle: 'relativeDivision' as const, durationPrecision: 4 };
    expect(createRestTokenCycles(1, config)).toBe('[~]');
    expect(createRestTokenCycles(2, config)).toBe('[~]@2');
  });

  it('uses ~ in absoluteDuration mode', () => {
    const config = { ...DEFAULT_CONFIG, timingStyle: 'absoluteDuration' as const, durationPrecision: 4 };
    expect(createRestTokenCycles(1, config)).toBe('~');
    expect(createRestTokenCycles(3, config)).toBe('~@3');
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
