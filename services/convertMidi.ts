import {
  DEFAULT_CONFIG,
  type ConversionDiagnostic,
  type StrudelConfig,
  type Track,
} from '../types';
import { detectKey } from './KeyDetector';
import { parseMidiBuffer, type ParsedMidi } from './MidiParser';
import { StrudelNotation } from './StrudelNotation';
import { createStrudelLink } from './strudelLink';

export type ConversionOverrides = Partial<Omit<StrudelConfig,
  'fileName' | 'key' | 'playbackKey' | 'sourceBpm' | 'sourceTimeSignature'
>>;

export interface MidiConversion {
  code: string;
  config: StrudelConfig;
  diagnostics: ConversionDiagnostic[];
  link: string;
  tracks: Track[];
}

export const createMidiProject = (
  parsed: ParsedMidi,
  fileName: string,
  overrides: ConversionOverrides = {},
  keyDetector: typeof detectKey = detectKey,
): { config: StrudelConfig; tracks: Track[] } => {
  const key = keyDetector(parsed.tracks) ?? undefined;
  const baseName = fileName
    .replace(/\.(?:mid|midi)$/i, '')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .trim() || 'MIDI Conversion';
  return {
    tracks: parsed.tracks,
    config: {
      ...DEFAULT_CONFIG,
      ...overrides,
      bpm: overrides.bpm ?? parsed.bpm,
      sourceBpm: parsed.bpm,
      timeSignature: overrides.timeSignature ?? parsed.timeSignature,
      sourceTimeSignature: parsed.timeSignature,
      fileName: baseName,
      key,
      playbackKey: key,
    },
  };
};

export const convertMidi = (
  bytes: ArrayBuffer,
  fileName: string,
  overrides: ConversionOverrides = {},
): MidiConversion => {
  const parsed = parseMidiBuffer(bytes);
  const { config, tracks } = createMidiProject(parsed, fileName, overrides);
  const { code, diagnostics } = new StrudelNotation(config).generateWithDiagnostics(parsed.tracks);

  return {
    code,
    config,
    diagnostics,
    link: createStrudelLink(code),
    tracks,
  };
};
