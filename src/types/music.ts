// Duration constants for musical notation
export const WHOLE = 1;
export const HALF = 0.5;
export const QUARTER = 0.25;
export const EIGHTH = 0.125;
export const SIXTEENTH = 0.0625;
export const THIRTY_SECOND = 0.03125;

// Note interface for bracket notation system
export interface Note {
  name: string;    // e.g., "C4", "Eb3", "F#5"
  start: number;   // Start time in cycles (Strudel units)
  release: number; // Release time in cycles (Strudel units)
}

// MIDI Note interface for conversion
export interface MidiNote {
  midi: number;     // MIDI note number (0-127)
  time: number;     // Start time in seconds
  duration: number; // Duration in seconds
  velocity: number; // Note velocity (0-1)
}

// Conversion settings interface
export interface ConversionSettings {
  // Display-only metadata from MIDI (not used for timing conversion)
  beatsPerMinute: number;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
  // Timing conversion for bracket notation: cycles per second (Strudel default is 0.5)
  cyclesPerSecond?: number;
  // Optional quantization to a grid in cycles (e.g., step = 1/32)
  quantize?: boolean;
  quantizeStep?: number; // default 1/32 if quantize is true
  // Strict duration snapping to powers-of-two durations (DOUBLE, WHOLE, HALF, QUARTER, EIGHTH, SIXTEENTH, THIRTY_SECOND)
  quantizeStrict?: boolean;
  allowedDurations?: number[];
  selectedTracks: number[];
  noteRange: {
    min: number;
    max: number;
  };
  velocityThreshold: number;
}

// Timeline visualization data
export interface TimelineData {
  notes: Note[];
  totalDuration: number;
  bracketNotation: string;
  statistics: {
    noteCount: number;
    restCount: number;
    totalDuration: number;
  };
}