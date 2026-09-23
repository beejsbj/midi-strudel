

export interface Note {
  note: string; // "C4", "F#5"
  noteOn: number; // Seconds
  noteOff: number; // Seconds
  velocity: number; // 0-1
  midi: number; // MIDI number 0-127
  /** Immutable location in the uploaded MIDI. Absent for older saved projects. */
  source?: SourceNoteMetadata;
}

export interface SourceNoteMetadata {
  id: string;
  ticks: number;
  durationTicks: number;
}

export interface TempoMapEntry {
  ticks: number;
  bpm: number;
}

export interface TimeSignatureMapEntry {
  ticks: number;
  numerator: number;
  denominator: number;
}

/**
 * Source-level timing is additive so persisted projects made before BJS-441
 * keep using their seconds-only notes.
 */
export interface MidiSourceMetadata {
  ppq: number;
  tempos: TempoMapEntry[];
  timeSignatures: TimeSignatureMapEntry[];
}

export interface Track {
  id: string;
  name: string;
  notes: Note[];
  instrumentFamily?: string;

  // Metadata overrides
  sound?: string;
  hidden?: boolean;
  color?: string; // HSL hue 0-360 as string, e.g. "210"

  // Per-track visual overrides (undefined = use global config)
  trackVisualMethod?: 'none' | 'pianoroll' | 'punchcard' | 'spiral' | 'pitchwheel' | 'spectrum';

  // Drum specific
  isDrum: boolean;
  drumBank?: string;
  sourceTiming?: MidiSourceMetadata;
}

export interface ConversionDiagnostic {
  code: 'unmapped-drum-note' | 'precise-literal-fallback' | 'phrase-analysis-budget';
  severity: 'warning';
  midiNote?: number;
  count?: number;
  message: string;
}

/** Accepted, emitted reuse only; seconds use the effective source-time axis. */
export interface PatternMetadata {
  definitions: Array<{
    id: string;
    name: string;
    trackId: string;
    measureCount: number;
    durationSeconds: number;
    sourceNoteIds: string[];
  }>;
  occurrences: Array<{
    definitionId: string;
    trackId: string;
    sourceStartMeasure: number;
    measureCount: number;
    startSeconds: number;
    endSeconds: number;
    sourceNoteIds: string[];
  }>;
}

export interface KeySignature {
  root: string;
  type: 'major' | 'minor';
  confidence: number; // Normalized 0..1 confidence score
  averageOctave: number;
}

export interface StrudelConfig {
  // Source Analysis
  bpm: number;       // Playback BPM (Output)
  sourceBpm: number; // Original File BPM (Calculation Base)
  
  timeSignature: { numerator: number; denominator: number }; // Playback Time Sig
  sourceTimeSignature?: { numerator: number; denominator: number }; // Original Time Sig
  
  key?: KeySignature; // Detected key (Source) used for interval calculation
  playbackKey?: KeySignature; // Playback key (Output) used for .scale()
  
  // Notation
  notationType: 'absolute' | 'relative';
  // Varying per-note controls: chained `.clip(...)`/`.velocity(...)` patterns,
  // or colon fields on each note via `.as("note:velocity:clip")`.
  controlSyntax: 'chained' | 'colon';
  
  // Duration System
  cycleUnit: 'bar' | 'beat';
  
  // Formatting
  formatPerLineBy: 'measure' | 'note';
  measuresPerLine: number; // items per line (measures or notes depending on formatPerLineBy)
  
  // Sound
  useAutoMapping: boolean;
  globalSound: string;
  
  // Modifiers
  includeVelocity: boolean;
  
  // Quantization
  isQuantized: boolean;
  quantizationThreshold: number; // ms
  quantizationStrength: number; // 0-100%
  
  // Source file metadata
  fileName?: string;

  // Visuals
  durationTagStyle: 'default' | 'sup' | 'normal' | 'ghost' | 'hidden' | 'hover';
  visualMethods: ('pianoroll' | 'punchcard' | 'spiral' | 'pitchwheel' | 'spectrum')[];
  visualScope: 'global' | 'inline';
  isTrackColoringEnabled: boolean;
  isNoteColoringEnabled: boolean;
  isProgressiveFillEnabled: boolean;
  isPatternTextColoringEnabled: boolean;
}

export const DEFAULT_CONFIG: StrudelConfig = {
  bpm: 120,
  sourceBpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  sourceTimeSignature: { numerator: 4, denominator: 4 },
  notationType: 'absolute',
  controlSyntax: 'chained',
  cycleUnit: 'bar',
  formatPerLineBy: 'measure',
  measuresPerLine: 4,
  
  useAutoMapping: true,
  globalSound: 'triangle',
  
  includeVelocity: false,
  isQuantized: false, 
  quantizationThreshold: 50,
  quantizationStrength: 100,

  durationTagStyle: 'sup',
  visualMethods: [],
  visualScope: 'inline',
  isTrackColoringEnabled: true,
  isNoteColoringEnabled: true,
  isProgressiveFillEnabled: true,
  isPatternTextColoringEnabled: true,
};
