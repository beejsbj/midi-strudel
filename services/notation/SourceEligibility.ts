import type { Track } from '../../types';
import type { EffectiveEvent } from './EffectiveEvents';

/**
 * Reasons a track must remain on the performance-time literal route. Future
 * structured renderers may use this public boundary before attempting source
 * beat analysis; literal rendering remains valid for every reason here.
 */
export type LiteralFallbackReason =
  | 'legacy-seconds-only'
  | 'source-tempo-changes'
  | 'source-meter-changes';

export interface SourceTimingEligibility {
  structured: boolean;
  fallbackReasons: LiteralFallbackReason[];
}

const hasTempoChanges = (track: Track): boolean => {
  const tempos = track.sourceTiming?.tempos ?? [];
  return tempos.slice(1).some((tempo) => tempo.bpm !== tempos[0]?.bpm);
};

const hasMeterChanges = (track: Track): boolean => {
  const meters = track.sourceTiming?.timeSignatures ?? [];
  return meters.slice(1).some((meter) =>
    meter.numerator !== meters[0]?.numerator || meter.denominator !== meters[0]?.denominator);
};

/**
 * Classifies only source-timing suitability. It does not make a musical
 * interpretation and deliberately leaves changing-map material explicit until
 * a renderer can prove a structural spelling for its constant regions.
 */
export const assessSourceTimingEligibility = (
  track: Track,
  events: EffectiveEvent[],
): SourceTimingEligibility => {
  const fallbackReasons: LiteralFallbackReason[] = [];
  const hasCompleteSourceTicks = typeof track.sourceTiming?.ppq === 'number'
    && track.sourceTiming.ppq > 0
    && events.every((event) => Number.isFinite(event.source?.ticks)
      && Number.isFinite(event.source?.durationTicks));

  if (!hasCompleteSourceTicks) {
    fallbackReasons.push('legacy-seconds-only');
  } else {
    if (hasTempoChanges(track)) fallbackReasons.push('source-tempo-changes');
    if (hasMeterChanges(track)) fallbackReasons.push('source-meter-changes');
  }

  return {
    structured: fallbackReasons.length === 0,
    fallbackReasons,
  };
};
