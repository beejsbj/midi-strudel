import { describe, expect, it } from 'vitest';
import {
  collectActivePlaybackRanges,
  createPlaybackFrame,
  EMPTY_PLAYBACK_FRAME,
  getVisibleNoteTokens,
  PLAYBACK_PROGRESS_BUCKETS,
} from '../strudelPlaybackHighlight';

describe('strudelPlaybackHighlight', () => {
  it('returns only note tokens that intersect the visible viewport ranges', () => {
    const tokens = [
      { from: 0, to: 2, color: 'red' },
      { from: 10, to: 12, color: 'green' },
      { from: 20, to: 22, color: 'blue' },
      { from: 30, to: 32, color: 'gold' },
    ];

    expect(
      getVisibleNoteTokens(tokens, [
        { from: 9, to: 15 },
        { from: 28, to: 31 },
      ]),
    ).toEqual([
      { from: 10, to: 12, color: 'green' },
      { from: 30, to: 32, color: 'gold' },
    ]);
  });

  it('dedupes visible note tokens across overlapping viewport ranges', () => {
    const tokens = [
      { from: 10, to: 12, color: 'green' },
      { from: 14, to: 16, color: 'blue' },
    ];

    expect(
      getVisibleNoteTokens(tokens, [
        { from: 9, to: 15 },
        { from: 11, to: 18 },
      ]),
    ).toEqual(tokens);
  });

  it('builds an empty playback frame when no ranges are active', () => {
    expect(createPlaybackFrame(0, [], true)).toEqual(EMPTY_PLAYBACK_FRAME);
  });

  it('buckets progressive playback frames so nearby times can share a signature', () => {
    const ranges = collectActivePlaybackRanges([
      {
        context: {
          locations: [{ start: 10, end: 12 }],
        },
        whole: {
          begin: 0,
          duration: 1,
        },
      },
    ]);

    const frameA = createPlaybackFrame(0.1, ranges, true);
    const frameB = createPlaybackFrame(0.101, ranges, true);

    expect(frameA.signature).toBe(frameB.signature);
    expect(frameA.ranges[0].progressBucket).toBe(12);
    expect(frameA.ranges[0].progressDegrees).toBe(
      Math.round((12 / PLAYBACK_PROGRESS_BUCKETS) * 360),
    );
  });

  it('uses a full bucket when progressive fill is disabled', () => {
    const ranges = collectActivePlaybackRanges([
      {
        context: {
          locations: [{ start: 4, end: 6 }],
        },
        whole: {
          begin: 0,
          duration: 2,
        },
      },
    ]);

    const frame = createPlaybackFrame(0.2, ranges, false);

    expect(frame.ranges[0]).toMatchObject({
      start: 4,
      end: 6,
      progressBucket: PLAYBACK_PROGRESS_BUCKETS,
      progressDegrees: 360,
    });
  });
});
