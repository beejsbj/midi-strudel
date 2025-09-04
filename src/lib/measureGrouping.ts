import { Note } from '@/types/music';

/**
 * Calculate measures based on time signature and tempo
 */
export interface MeasureInfo {
  measureNumber: number;
  startTime: number;
  endTime: number;
  beatsPerMeasure: number;
}

/**
 * Group notes by measures based on time signature
 * @param notes - Array of notes with timing in cycles
 * @param timeSignature - Time signature (e.g., { numerator: 4, denominator: 4 })
 * @param cyclesPerSecond - Cycles per second (e.g., 0.5)
 * @param tempo - BPM (beats per minute)
 */
export function groupNotesByMeasures(
  notes: Note[],
  timeSignature: { numerator: number; denominator: number },
  cyclesPerSecond: number = 0.5,
  tempo: number = 120
): Map<number, Note[]> {
  if (notes.length === 0) return new Map();

  // Calculate cycles per measure
  // In 4/4 time at 120 BPM with 0.5 cps: 
  // - One beat = 0.5 seconds = 0.25 cycles
  // - One measure (4 beats) = 2 seconds = 1 cycle
  const beatsPerMinute = tempo;
  const beatsPerSecond = beatsPerMinute / 60;
  const secondsPerBeat = 1 / beatsPerSecond;
  const cyclesPerBeat = secondsPerBeat * cyclesPerSecond;
  const cyclesPerMeasure = cyclesPerBeat * timeSignature.numerator;

  const measureGroups = new Map<number, Note[]>();

  for (const note of notes) {
    const measureNumber = Math.floor(note.start / cyclesPerMeasure);
    
    if (!measureGroups.has(measureNumber)) {
      measureGroups.set(measureNumber, []);
    }
    measureGroups.get(measureNumber)!.push(note);
  }

  return measureGroups;
}

/**
 * Format grouped measures for display
 * @param measureGroups - Map of measure number to notes
 * @param measuresPerLine - Number of measures to display per line
 */
export function formatMeasuresPerLine(
  measureGroups: Map<number, Note[]>,
  measuresPerLine: number,
  formatNotesFunction: (notes: Note[]) => string
): string {
  const measureNumbers = Array.from(measureGroups.keys()).sort((a, b) => a - b);
  
  if (measureNumbers.length === 0) return "";

  const lines: string[] = [];
  let currentLine: string[] = [];
  let measuresInCurrentLine = 0;

  for (const measureNum of measureNumbers) {
    const notes = measureGroups.get(measureNum) || [];
    if (notes.length === 0) continue;

    const measureNotation = formatNotesFunction(notes);
    if (measureNotation.trim()) {
      currentLine.push(measureNotation);
      measuresInCurrentLine++;

      if (measuresInCurrentLine >= measuresPerLine) {
        lines.push(currentLine.join(' | '));
        currentLine = [];
        measuresInCurrentLine = 0;
      }
    }
  }

  // Add any remaining measures
  if (currentLine.length > 0) {
    lines.push(currentLine.join(' | '));
  }

  return lines.join('\n');
}