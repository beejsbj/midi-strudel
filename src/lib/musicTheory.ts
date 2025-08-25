import { Note } from '@/types/music';

// Circle of fifths for major keys
const CIRCLE_OF_FIFTHS = [
  'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'
];

// Major scale intervals (semitones from root)
const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

// Minor scale intervals (natural minor)
const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

// Note names to MIDI number mapping (C4 = 60)
const NOTE_TO_MIDI: { [key: string]: number } = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4,
  'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9,
  'A#': 10, 'Bb': 10, 'B': 11
};

export interface KeySignature {
  key: string; // e.g., "C", "G", "F#"
  mode: 'major' | 'minor';
  confidence: number; // 0-1, how confident we are in this detection
  rootOctave?: number; // The most common octave for the root note
}

/**
 * Extract the note name (without octave) from a full note name
 */
function getNoteName(fullNoteName: string): string {
  // Remove octave number, keeping only the note name and any accidental
  return fullNoteName.replace(/\d+$/, '');
}

/**
 * Get the MIDI pitch class (0-11) from a note name
 */
function getPitchClass(noteName: string): number {
  const noteOnly = getNoteName(noteName);
  return NOTE_TO_MIDI[noteOnly] ?? 0;
}

/**
 * Calculate the most common octave for a given pitch class in the note set
 */
function calculateRootOctave(notes: Note[], rootPitchClass: number): number {
  const rootNotes = notes.filter(note => getPitchClass(note.name) === rootPitchClass);
  
  if (rootNotes.length === 0) {
    // Fallback: find the median octave of all notes
    const allOctaves = notes.map(note => parseInt(note.name.match(/\d+$/)?.[0] || '4', 10));
    allOctaves.sort((a, b) => a - b);
    return allOctaves[Math.floor(allOctaves.length / 2)] || 4;
  }
  
  // Count occurrences of each octave for the root note
  const octaveCounts: { [octave: number]: number } = {};
  rootNotes.forEach(note => {
    const octave = parseInt(note.name.match(/\d+$/)?.[0] || '4', 10);
    const duration = note.release - note.start;
    octaveCounts[octave] = (octaveCounts[octave] || 0) + duration;
  });
  
  // Find the octave with the highest weighted count
  let bestOctave = 4;
  let bestWeight = 0;
  for (const [octave, weight] of Object.entries(octaveCounts)) {
    if (weight > bestWeight) {
      bestWeight = weight;
      bestOctave = parseInt(octave);
    }
  }
  
  return bestOctave;
}

/**
 * Calculate the Krumhansl-Schmuckler key-finding algorithm
 * This analyzes the pitch class distribution to determine the most likely key
 */
export function calculateKeySignature(notes: Note[]): KeySignature | null {
  if (notes.length === 0) {
    return null;
  }

  // Count pitch class occurrences (weighted by duration)
  const pitchClassCounts = new Array(12).fill(0);
  
  notes.forEach(note => {
    const pitchClass = getPitchClass(note.name);
    const duration = note.release - note.start;
    pitchClassCounts[pitchClass] += duration;
  });

  // Normalize to get pitch class distribution
  const total = pitchClassCounts.reduce((sum, count) => sum + count, 0);
  const pitchClassDistribution = pitchClassCounts.map(count => count / total);

  // Krumhansl-Schmuckler major key profile
  const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  
  // Krumhansl-Schmuckler minor key profile  
  const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  let bestKey = 'C';
  let bestMode: 'major' | 'minor' = 'major';
  let bestCorrelation = -1;

  // Test all 12 major keys
  for (let i = 0; i < 12; i++) {
    const correlation = calculateCorrelation(pitchClassDistribution, rotateArray(majorProfile, i));
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestKey = CIRCLE_OF_FIFTHS[i % 12];
      bestMode = 'major';
    }
  }

  // Test all 12 minor keys
  for (let i = 0; i < 12; i++) {
    const correlation = calculateCorrelation(pitchClassDistribution, rotateArray(minorProfile, i));
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestKey = CIRCLE_OF_FIFTHS[i % 12];
      bestMode = 'minor';
    }
  }

  // Convert correlation to confidence (0-1)
  const confidence = Math.max(0, Math.min(1, (bestCorrelation + 1) / 2));

  // Only return if confidence is reasonable
  if (confidence < 0.3) {
    return null;
  }

  // Calculate the most appropriate root octave from the actual notes
  const rootPitchClass = getPitchClass(bestKey);
  const rootOctave = calculateRootOctave(notes, rootPitchClass);

  return {
    key: bestKey,
    mode: bestMode,
    confidence,
    rootOctave // Add the calculated root octave
  };
}

/**
 * Calculate Pearson correlation coefficient between two arrays
 */
function calculateCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n !== y.length || n === 0) return 0;

  const meanX = x.reduce((sum, val) => sum + val, 0) / n;
  const meanY = y.reduce((sum, val) => sum + val, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    numerator += diffX * diffY;
    denomX += diffX * diffX;
    denomY += diffY * diffY;
  }

  const denominator = Math.sqrt(denomX * denomY);
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Rotate an array by n positions
 */
function rotateArray<T>(arr: T[], n: number): T[] {
  const len = arr.length;
  n = ((n % len) + len) % len; // Ensure positive rotation
  return [...arr.slice(n), ...arr.slice(0, n)];
}

/**
 * Convert a note name to scale degree relative to a key signature
 * Returns the scale degree (0 = root, 1 = second, etc.) and octave offset
 */
export function noteToScaleDegree(noteName: string, keySignature: KeySignature): { degree: number; octave: number } {
  const noteOnly = getNoteName(noteName);
  const octave = parseInt(noteName.match(/\d+$/)?.[0] || '4', 10);
  
  const notePitchClass = getPitchClass(noteOnly);
  const rootPitchClass = getPitchClass(keySignature.key);
  
  const scaleIntervals = keySignature.mode === 'major' ? MAJOR_SCALE_INTERVALS : MINOR_SCALE_INTERVALS;
  
  // Calculate semitone distance from root
  let semitoneDistance = notePitchClass - rootPitchClass;
  if (semitoneDistance < 0) {
    semitoneDistance += 12;
  }
  
  // Find the closest scale degree
  let closestDegree = 0;
  let closestDistance = Math.abs(semitoneDistance - scaleIntervals[0]);
  
  for (let i = 1; i < scaleIntervals.length; i++) {
    const distance = Math.abs(semitoneDistance - scaleIntervals[i]);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestDegree = i;
    }
  }
  
  // Calculate octave offset based on the actual note octave and calculated root octave
  const rootOctave = keySignature.rootOctave ?? 4; // Use calculated root octave, fallback to 4
  let octaveOffset = octave - rootOctave;
  
  // Adjust for scale degree position within octave
  if (closestDegree > 0 && semitoneDistance < scaleIntervals[closestDegree]) {
    // Note is actually in the previous octave for this scale degree
    octaveOffset -= 1;
  }
  
  return {
    degree: closestDegree + (octaveOffset * 7), // 7 scale degrees per octave
    octave: octaveOffset
  };
}

/**
 * Format key signature for display
 */
export function formatKeySignature(keySignature: KeySignature): string {
  return `${keySignature.key}${keySignature.mode === 'minor' ? ' minor' : ' major'}`;
}

/**
 * Format key signature for Strudel scale function
 */
export function formatScaleForStrudel(keySignature: KeySignature): string {
  const rootOctave = keySignature.rootOctave ?? 4; // Use calculated root octave, fallback to 4
  const rootNote = `${keySignature.key}${rootOctave}`;
  const scaleType = keySignature.mode === 'major' ? 'major' : 'minor';
  return `${rootNote}:${scaleType}`;
}
