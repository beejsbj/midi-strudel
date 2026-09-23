import { DEFAULT_CONFIG, KeySignature, StrudelConfig, Track } from '../types';

export const CONFIG_STORAGE_KEY = 'midi-strudel-config';
export const TRACKS_STORAGE_KEY = 'midi-strudel-tracks';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const VALID_DURATION_TAG_STYLES: StrudelConfig['durationTagStyle'][] = [
  'default',
  'sup',
  'normal',
  'ghost',
  'hidden',
  'hover',
];
const VALID_CONTROL_SYNTAXES: StrudelConfig['controlSyntax'][] = [
  'chained',
  'colon',
];
const DEFAULT_CONFIG_SERIALIZED = JSON.stringify(DEFAULT_CONFIG);

function resolveStorage(storage?: StorageLike): StorageLike | undefined {
  if (storage) return storage;
  if (typeof window === 'undefined') return undefined;
  return window.localStorage;
}

function sanitizeWholeNumber(value: unknown, fallback: number, min: number, max?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.round(value);
  const lowerBounded = Math.max(min, rounded);
  return max == null ? lowerBounded : Math.min(max, lowerBounded);
}

function sanitizeNumber(value: unknown, fallback: number, min: number, max?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max ?? Infinity, Math.max(min, value));
}

function sanitizeTimeSignature(
  value: Partial<StrudelConfig['timeSignature']> | undefined,
  fallback: StrudelConfig['timeSignature'],
): StrudelConfig['timeSignature'] {
  // UI input limits are not MIDI-format limits. Imported meters such as 3/64
  // and 33/4 must retain their source span when the project is reloaded.
  const positiveInteger = (candidate: unknown, defaultValue: number): number =>
    typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate > 0
      ? candidate : defaultValue;
  return {
    numerator: positiveInteger(value?.numerator, fallback.numerator),
    denominator: positiveInteger(value?.denominator, fallback.denominator),
  };
}

export function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

export function sanitizeKeySignature(value: unknown): KeySignature | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Partial<KeySignature>;
  if (typeof candidate.root !== 'string') {
    return undefined;
  }

  const type = candidate.type === 'minor' ? 'minor' : candidate.type === 'major' ? 'major' : undefined;
  if (!type) {
    return undefined;
  }

  return {
    root: candidate.root,
    type,
    confidence: normalizeConfidence(candidate.confidence),
    averageOctave: sanitizeWholeNumber(candidate.averageOctave, 3, 0, 8),
  };
}

export function removeRetiredNotationSettings(config: StrudelConfig): StrudelConfig {
  const current = { ...config };
  // Older projects stored rendering choices that are now automatic. Discard
  // only these settings; public conversion must not inherit UI input bounds.
  for (const key of ['renderingMode', 'timingStyle', 'durationPrecision', 'outputStyle']) {
    Reflect.deleteProperty(current, key);
  }
  return current;
}

export function sanitizeConfig(config: Partial<StrudelConfig>): StrudelConfig {
  const merged = removeRetiredNotationSettings({ ...DEFAULT_CONFIG, ...config });
  const defaultSourceTimeSignature =
    DEFAULT_CONFIG.sourceTimeSignature ?? DEFAULT_CONFIG.timeSignature;

  return {
    ...merged,
    bpm: sanitizeNumber(merged.bpm, DEFAULT_CONFIG.bpm, 1),
    sourceBpm: sanitizeNumber(merged.sourceBpm, DEFAULT_CONFIG.sourceBpm, 1),
    timeSignature: sanitizeTimeSignature(merged.timeSignature, DEFAULT_CONFIG.timeSignature),
    sourceTimeSignature: sanitizeTimeSignature(
      merged.sourceTimeSignature,
      defaultSourceTimeSignature,
    ),
    measuresPerLine: sanitizeWholeNumber(
      merged.measuresPerLine,
      DEFAULT_CONFIG.measuresPerLine,
      1,
      64,
    ),
    quantizationThreshold: sanitizeNumber(
      merged.quantizationThreshold,
      DEFAULT_CONFIG.quantizationThreshold,
      0,
      200,
    ),
    quantizationStrength: sanitizeNumber(
      merged.quantizationStrength,
      DEFAULT_CONFIG.quantizationStrength,
      0,
      100,
    ),
    durationTagStyle:
      typeof merged.durationTagStyle === 'string' &&
      VALID_DURATION_TAG_STYLES.includes(merged.durationTagStyle as StrudelConfig['durationTagStyle'])
        ? (merged.durationTagStyle as StrudelConfig['durationTagStyle'])
        : DEFAULT_CONFIG.durationTagStyle,
    controlSyntax:
      typeof merged.controlSyntax === 'string' &&
      VALID_CONTROL_SYNTAXES.includes(merged.controlSyntax as StrudelConfig['controlSyntax'])
        ? (merged.controlSyntax as StrudelConfig['controlSyntax'])
        : DEFAULT_CONFIG.controlSyntax,
    key: sanitizeKeySignature(merged.key),
    playbackKey: sanitizeKeySignature(merged.playbackKey),
  };
}

export function loadConfigFromStorage(storage?: StorageLike): StrudelConfig {
  const resolvedStorage = resolveStorage(storage);

  try {
    const raw = resolvedStorage?.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return sanitizeConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfigToStorage(config: StrudelConfig, storage?: StorageLike): void {
  const resolvedStorage = resolveStorage(storage);

  try {
    if (!resolvedStorage) return;

    const serializedConfig = JSON.stringify(sanitizeConfig(config));
    if (serializedConfig === DEFAULT_CONFIG_SERIALIZED) {
      resolvedStorage.removeItem(CONFIG_STORAGE_KEY);
      return;
    }

    resolvedStorage.setItem(CONFIG_STORAGE_KEY, serializedConfig);
  } catch {
    // Storage quota exceeded or unavailable.
  }
}

export function loadTracksFromStorage(storage?: StorageLike): Track[] {
  const resolvedStorage = resolveStorage(storage);

  try {
    const raw = resolvedStorage?.getItem(TRACKS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Track[]) : [];
  } catch {
    return [];
  }
}

export function saveTracksToStorage(tracks: Track[], storage?: StorageLike): void {
  const resolvedStorage = resolveStorage(storage);

  try {
    if (!resolvedStorage) return;
    if (tracks.length === 0) {
      resolvedStorage.removeItem(TRACKS_STORAGE_KEY);
      return;
    }

    resolvedStorage.setItem(TRACKS_STORAGE_KEY, JSON.stringify(tracks));
  } catch {
    // Storage quota exceeded or unavailable.
  }
}

export function clearProjectStorage(storage?: StorageLike): void {
  const resolvedStorage = resolveStorage(storage);

  try {
    resolvedStorage?.removeItem(CONFIG_STORAGE_KEY);
    resolvedStorage?.removeItem(TRACKS_STORAGE_KEY);
  } catch {
    // Storage unavailable.
  }
}
