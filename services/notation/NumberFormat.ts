const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;

/** Short arithmetic for JavaScript arguments, never mini-notation division. */
export const ratioExpression = (numerator: number, denominator: number): string => {
  const value = numerator / denominator;
  const decimal = String(value);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator === 0) {
    return numberExpression(value);
  }
  const divisor = gcd(Math.abs(numerator), Math.abs(denominator));
  const top = numerator / divisor * Math.sign(denominator);
  const bottom = Math.abs(denominator / divisor);
  const fraction = bottom === 1 ? String(top) : `${top}/${bottom}`;
  return top / bottom === value && fraction.length < decimal.length ? fraction : decimal;
};

/** Recover only small fractions that evaluate to the identical stored number. */
export const numberExpression = (value: number): string => {
  let shortest = String(value);
  if (!Number.isFinite(value) || Number.isInteger(value)) return shortest;
  for (let denominator = 2; denominator <= 128; denominator += 1) {
    const numerator = Math.round(value * denominator);
    if (!Number.isSafeInteger(numerator) || numerator / denominator !== value) continue;
    const fraction = `${numerator}/${denominator}`;
    if (fraction.length < shortest.length) shortest = fraction;
  }
  return shortest;
};

/**
 * Readable control values: at most three decimals, no trailing zeros. Values
 * under 0.1 keep three significant digits instead, so a tiny gate alone in a
 * long slot (slow tempo, staccato) is not shortened by up to a fifth.
 */
export const roundedDecimal = (value: number): string => (value !== 0 && Math.abs(value) < 0.1
  ? String(Number(value.toPrecision(3)))
  : String(Math.round(value * 1000) / 1000));

/** A gate release may differ from the exact one by this much (well under the ear's 10 ms). */
export const GATE_TOLERANCE_SECONDS = 0.001;

/**
 * A gate ratio (clip) for a slot of `slotSeconds`. Keeps the readable
 * `roundedDecimal` while its release stays within a millisecond of the exact
 * one; a long slot (slow tempo, long note) earns extra decimals until it does.
 */
export const gateDecimal = (ratio: number, slotSeconds: number): string => {
  const within = (text: string) => Math.abs(Number(text) - ratio) * slotSeconds <= GATE_TOLERANCE_SECONDS * 0.99;
  const short = roundedDecimal(ratio);
  if (within(short)) return short;
  for (let decimals = 4; decimals <= 15; decimals += 1) {
    const text = String(Number(ratio.toFixed(decimals)));
    if (within(text)) return text;
  }
  return String(ratio);
};

/**
 * A cycle ratio derived through float seconds (60 / bpm / ppq ...) can land a
 * few ulps off an exact small fraction. Snap to it: `1.0000000000000002` is 1.
 */
export const snappedRatio = (value: number): number => {
  for (let denominator = 1; denominator <= 128; denominator += 1) {
    const numerator = Math.round(value * denominator);
    if (numerator > 0 && Math.abs(value - numerator / denominator) <= 1e-9 * Math.max(1, value)) return numerator / denominator;
  }
  return value;
};
