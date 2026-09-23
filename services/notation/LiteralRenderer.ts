/** The minimal renderer boundary used for exact performance-time fallback. */
export interface EffectivePerformanceEvent {
  id: string;
  value: string | number;
  onsetSeconds: number;
  releaseSeconds: number;
  velocity?: number;
}

export interface SharedLiteralSpan {
  durationSeconds: number;
  cycleDurationSeconds: number;
}

export interface PreciseLiteralOptions {
  control: 'note' | 'n' | 's';
  includeVelocity: boolean;
  formatting?: {
    by: 'note' | 'measure';
    itemsPerLine: number;
    measureSeconds: number;
  };
}

const numberLiteral = (value: number): string => {
  if (!Number.isFinite(value)) throw new Error('Cannot render a non-finite literal timing value');
  // ECMAScript's shortest round-trippable decimal does not introduce a
  // formatter-selected fixed grid or cumulative loop drift.
  return value.toString();
};

/**
 * Renders independent event patterns under one shared period. `late` places
 * attacks, while `clip` sets each gate relative to the slow shared span.
 * Events intentionally carry no MIDI tick requirement: this is also the
 * compatible route for older seconds-only saved projects.
 */
export const renderPreciseLiteral = (
  events: EffectivePerformanceEvent[],
  span: SharedLiteralSpan,
  options: PreciseLiteralOptions,
): string => {
  if (span.durationSeconds <= 0 || span.cycleDurationSeconds <= 0) {
    throw new Error('Literal rendering requires a positive shared span and cycle duration');
  }
  const spanCycles = span.durationSeconds / span.cycleDurationSeconds;
  const lines = events.map((event) => {
    const gate = Math.max(0, event.releaseSeconds - event.onsetSeconds);
    const call = `${options.control}(${JSON.stringify(String(event.value))})`;
    const velocity = options.includeVelocity && event.velocity !== undefined
      ? `.velocity(${numberLiteral(event.velocity)})`
      : '';
    return `${call}.late(${numberLiteral(event.onsetSeconds / span.durationSeconds)}).clip(${numberLiteral(gate / span.durationSeconds)})${velocity}`;
  });
  const formatting = options.formatting;
  const itemsPerLine = Math.max(1, formatting?.itemsPerLine ?? 1);
  const lineGroup = (index: number): number => formatting?.by === 'measure'
    ? Math.floor(events[index].onsetSeconds / formatting.measureSeconds / itemsPerLine)
    : Math.floor(index / itemsPerLine);
  const body = lines.map((line, index) => {
    if (!index) return line;
    return `${lineGroup(index) === lineGroup(index - 1) ? ', ' : ',\n    '}${line}`;
  }).join('');
  const pattern = lines.length === 1 ? lines[0] : `stack(\n    ${body}\n  )`;
  return `${pattern}.slow(${numberLiteral(spanCycles)})`;
};
