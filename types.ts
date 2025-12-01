

export interface Note {
  note: string; // "C4", "F#5"
  noteOn: number; // Seconds
  noteOff: number; // Seconds
  velocity: number; // 0-1
  midi: number; // MIDI number 0-127
}

export interface Track {
  id: string;
  name: string;
  notes: Note[];
  instrumentFamily?: string;
  
  // Metadata overrides
  sound?: string;
  hidden?: boolean;
  
  // Drum specific
  isDrum: boolean;
  drumBank?: string;
}

export interface KeySignature {
  root: string;
  type: 'major' | 'minor';
  confidence: number;
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
  
  // Output Style
  outputStyle: 'melody+harmony'; 
  
  // Notation
  notationType: 'absolute' | 'relative';
  
  // Duration System
  cycleUnit: 'bar' | 'beat';
  
  // Formatting
  formatPerLineBy: 'measure'; // Simplified for this implementation
  measuresPerLine: number;
  
  // Sound
  useAutoMapping: boolean;
  globalSound: string;
  
  // Modifiers
  includeVelocity: boolean;
  timingStyle: 'absoluteDuration' | 'relativeDivision';
  
  // Quantization
  isQuantized: boolean;
  quantizationThreshold: number; // ms
  quantizationStrength: number; // 0-100%
  
  // Precision
  durationPrecision: number;
}

export const DEFAULT_CONFIG: StrudelConfig = {
  bpm: 120,
  sourceBpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  sourceTimeSignature: { numerator: 4, denominator: 4 },
  outputStyle: 'melody+harmony',
  notationType: 'absolute',
  cycleUnit: 'bar',
  formatPerLineBy: 'measure',
  measuresPerLine: 1,
  
  useAutoMapping: false,
  globalSound: 'triangle',
  
  includeVelocity: false,
  timingStyle: 'absoluteDuration',
  isQuantized: false, 
  quantizationThreshold: 50,
  quantizationStrength: 100,
  durationPrecision: 4
};