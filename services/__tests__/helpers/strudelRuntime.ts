import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import * as tonal from '@strudel/tonal';
import { transpiler } from '@strudel/transpiler';

export interface RuntimeEvent {
  onsetSeconds: number;
  gateEndSeconds: number;
  value: Record<string, unknown>;
}

export interface EvaluatedStrudelCode {
  cps: number;
  querySeconds: (startSeconds: number, endSeconds: number) => RuntimeEvent[];
  queryTwoLoopsAndBoundaryWindows: (sharedSpanSeconds: number, boundaryWindowSeconds?: number) => {
    twoLoops: RuntimeEvent[];
    firstBoundary: RuntimeEvent[];
    secondBoundary: RuntimeEvent[];
  };
  stop: () => void;
}

/**
 * Evaluates complete generated code through Strudel's installed REPL. This is
 * deliberately not a RHS extractor: labels, setcps, and REPL pattern stacking
 * are part of the converter's public runtime contract.
 */
export const evaluateGeneratedStrudelCode = async (code: string): Promise<EvaluatedStrudelCode> => {
  await core.evalScope(core, mini, tonal);
  const engine = core.repl({
    getTime: () => 0,
    defaultOutput: () => undefined,
    transpiler,
  });
  const pattern = await engine.evaluate(code, false);
  if (!pattern || engine.state.evalError) {
    engine.stop();
    throw engine.state.evalError ?? new Error('Strudel REPL did not return a pattern');
  }
  const cps = engine.scheduler.cps;
  const querySeconds = (startSeconds: number, endSeconds: number): RuntimeEvent[] =>
    pattern.queryArc(startSeconds * cps, endSeconds * cps)
      .filter((event) => event.hasOnset())
      .map((event) => {
        const onsetSeconds = Number(event.whole.begin) / cps;
        return {
          onsetSeconds,
          gateEndSeconds: onsetSeconds + Number(event.duration) / cps,
          value: event.value as Record<string, unknown>,
        };
      });
  return {
    cps,
    querySeconds,
    queryTwoLoopsAndBoundaryWindows: (sharedSpanSeconds, boundaryWindowSeconds = 0.001) => ({
      twoLoops: querySeconds(0, sharedSpanSeconds * 2),
      firstBoundary: querySeconds(sharedSpanSeconds - boundaryWindowSeconds, sharedSpanSeconds + boundaryWindowSeconds),
      secondBoundary: querySeconds((sharedSpanSeconds * 2) - boundaryWindowSeconds, (sharedSpanSeconds * 2) + boundaryWindowSeconds),
    }),
    stop: () => engine.stop(),
  };
};
