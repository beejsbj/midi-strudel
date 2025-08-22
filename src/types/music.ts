// Duration constants for musical notation
export const WHOLE = 1;
export const HALF = 0.5;
export const QUARTER = 0.25;
export const EIGHTH = 0.125;
export const SIXTEENTH = 0.0625;

// Note interface for bracket notation system
export interface Note {
  name: string;    // e.g., "C4", "Eb3", "F#5"
  start: number;   // Start time in beats
  release: number; // Release time in beats
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
  beatsPerMinute: number;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
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