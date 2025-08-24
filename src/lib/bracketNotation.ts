import { Note, WHOLE, HALF, QUARTER, EIGHTH, SIXTEENTH, THIRTY_SECOND } from '@/types/music';
import { KeySignature, noteToScaleDegree, formatScaleForStrudel } from './musicTheory';

// Convert MIDI number to note name
export function midiNumberToNoteName(midi: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  const note = noteNames[midi % 12];
  return `${note}${octave}`;
}

// Format duration for bracket notation
function formatDuration(duration: number): string {
  if (duration === WHOLE) return '';
  if (duration === HALF) return '@0.5';
  if (duration === QUARTER) return '@0.25';
  if (duration === EIGHTH) return '@0.125';
  if (duration === SIXTEENTH) return '@0.0625';
  if (duration === THIRTY_SECOND) return '@0.03125';
  
  // Round to 4 decimal places to avoid floating point precision issues
  const rounded = Math.round(duration * 10000) / 10000;
  return `@${rounded}`;
}

// Check if notes overlap (at least 1 unit simultaneous)
function notesOverlap(note1: Note, note2: Note): boolean {
  return Math.max(note1.start, note2.start) < Math.min(note1.release, note2.release);
}

// Group overlapping notes
function groupOverlappingNotes(notes: Note[]): Note[][] {
  const sortedNotes = [...notes].sort((a, b) => a.start - b.start);
  const groups: Note[][] = [];
  
  for (const note of sortedNotes) {
    let addedToGroup = false;
    
    for (const group of groups) {
      if (group.some(groupNote => notesOverlap(note, groupNote))) {
        group.push(note);
        addedToGroup = true;
        break;
      }
    }
    
    if (!addedToGroup) {
      groups.push([note]);
    }
  }
  
  return groups;
}

// Generate bracket notation for a group of notes
function generateGroupNotation(group: Note[]): string {
  if (group.length === 1) {
    const note = group[0];
    const duration = note.release - note.start;
    return `${note.name}${formatDuration(duration)}`;
  }
  
  // Multiple overlapping notes - create bracket notation
  const earliestStart = Math.min(...group.map(n => n.start));
  const latestRelease = Math.max(...group.map(n => n.release));
  const bracketLength = latestRelease - earliestStart;
  
  const entries: string[] = [];
  
  for (const note of group) {
    const offset = note.start - earliestStart;
    const duration = note.release - note.start;
    const pad = bracketLength - offset - duration;
    
    let entry = '';
    if (offset > 0) entry += `~${formatDuration(offset)} `;
    entry += `${note.name}${formatDuration(duration)}`;
    if (pad > 0) entry += ` ~${formatDuration(pad)}`;
    
    entries.push(entry);
  }
  
  return `[${entries.join(', ')}]${formatDuration(bracketLength)}`;
}

// Main function to generate bracket notation
export function generateBracketNotation(notes: Note[]): string {
  if (notes.length === 0) return '';
  
  const groups = groupOverlappingNotes(notes);
  const sortedGroups = groups.sort((a, b) => Math.min(...a.map(n => n.start)) - Math.min(...b.map(n => n.start)));
  
  const parts: string[] = [];
  let lastEnd = 0;
  
  for (const group of sortedGroups) {
    const groupStart = Math.min(...group.map(n => n.start));
    const groupEnd = Math.max(...group.map(n => n.release));
    
    // Add rest if there's a gap
    if (groupStart > lastEnd) {
      const restDuration = groupStart - lastEnd;
      parts.push(`~${formatDuration(restDuration)}`);
    }
    
    parts.push(generateGroupNotation(group));
    lastEnd = groupEnd;
  }
  
  return parts.join(' ');
}

// Format bracket notation with line breaks
export function formatBracketNotation(bracketNotation: string, lineLength: number = 8): string {
  if (!bracketNotation.trim()) return '';
  
  const parts = bracketNotation.split(' ').filter(part => part.trim());
  if (parts.length === 0) return '';
  
  const lines: string[] = [];
  let currentLine: string[] = [];
  let elementCount = 0;
  let bracketCount = 0;
  
  for (const part of parts) {
    const isBracket = part.startsWith('[');
    
    currentLine.push(part);
    elementCount++;
    if (isBracket) bracketCount++;
    
    // Break line if we have reached lineLength elements OR 2 brackets
    const shouldBreak = elementCount >= lineLength || bracketCount >= 2;
    
    if (shouldBreak) {
      lines.push(currentLine.join(' '));
      currentLine = [];
      elementCount = 0;
      bracketCount = 0;
    }
  }
  
  // Add any remaining elements
  if (currentLine.length > 0) {
    lines.push(currentLine.join(' '));
  }
  
  return lines.join('\n');
}

// Convert notes to scale degree representation
function convertNotesToScaleDegrees(notes: Note[], keySignature: KeySignature): Array<{ degree: number; start: number; release: number }> {
  return notes.map(note => {
    const { degree } = noteToScaleDegree(note.name, keySignature);
    return {
      degree,
      start: note.start,
      release: note.release
    };
  });
}

// Generate bracket notation for scale degrees
function generateScaleDegreeNotation(scaleDegrees: Array<{ degree: number; start: number; release: number }>): string {
  if (scaleDegrees.length === 0) return '';
  
  // Group overlapping scale degrees (similar logic to note grouping)
  const groups = groupOverlappingScaleDegrees(scaleDegrees);
  const sortedGroups = groups.sort((a, b) => Math.min(...a.map(n => n.start)) - Math.min(...b.map(n => n.start)));
  
  const parts: string[] = [];
  let lastEnd = 0;
  
  for (const group of sortedGroups) {
    const groupStart = Math.min(...group.map(n => n.start));
    const groupEnd = Math.max(...group.map(n => n.release));
    
    // Add rest if there's a gap
    if (groupStart > lastEnd) {
      const restDuration = groupStart - lastEnd;
      parts.push(`~${formatDuration(restDuration)}`);
    }
    
    parts.push(generateScaleDegreeGroupNotation(group));
    lastEnd = groupEnd;
  }
  
  return parts.join(' ');
}

// Group overlapping scale degrees
function groupOverlappingScaleDegrees(scaleDegrees: Array<{ degree: number; start: number; release: number }>): Array<Array<{ degree: number; start: number; release: number }>> {
  const sortedDegrees = [...scaleDegrees].sort((a, b) => a.start - b.start);
  const groups: Array<Array<{ degree: number; start: number; release: number }>> = [];
  
  for (const degree of sortedDegrees) {
    let addedToGroup = false;
    
    for (const group of groups) {
      if (group.some(groupDegree => scaleDegreesOverlap(degree, groupDegree))) {
        group.push(degree);
        addedToGroup = true;
        break;
      }
    }
    
    if (!addedToGroup) {
      groups.push([degree]);
    }
  }
  
  return groups;
}

// Check if scale degrees overlap
function scaleDegreesOverlap(degree1: { start: number; release: number }, degree2: { start: number; release: number }): boolean {
  return Math.max(degree1.start, degree2.start) < Math.min(degree1.release, degree2.release);
}

// Generate bracket notation for a group of scale degrees
function generateScaleDegreeGroupNotation(group: Array<{ degree: number; start: number; release: number }>): string {
  if (group.length === 1) {
    const degree = group[0];
    const duration = degree.release - degree.start;
    return `${degree.degree}${formatDuration(duration)}`;
  }
  
  // Multiple overlapping scale degrees - create bracket notation
  const earliestStart = Math.min(...group.map(n => n.start));
  const latestRelease = Math.max(...group.map(n => n.release));
  const bracketLength = latestRelease - earliestStart;
  
  const entries: string[] = [];
  
  for (const degree of group) {
    const offset = degree.start - earliestStart;
    const duration = degree.release - degree.start;
    const pad = bracketLength - offset - duration;
    
    let entry = '';
    if (offset > 0) entry += `~${formatDuration(offset)} `;
    entry += `${degree.degree}${formatDuration(duration)}`;
    if (pad > 0) entry += ` ~${formatDuration(pad)}`;
    
    entries.push(entry);
  }
  
  return `[${entries.join(', ')}]${formatDuration(bracketLength)}`;
}

// Main function to generate formatted bracket notation
export function generateFormattedBracketNotation(notes: Note[], lineLength: number = 8, keySignature?: KeySignature, useScaleMode: boolean = false): string {
  if (useScaleMode && keySignature) {
    const scaleDegrees = convertNotesToScaleDegrees(notes, keySignature);
    const notation = generateScaleDegreeNotation(scaleDegrees);
    return formatBracketNotation(notation, lineLength);
  } else {
    const notation = generateBracketNotation(notes);
    return formatBracketNotation(notation, lineLength);
  }
}

// Generate Strudel code with appropriate syntax
export function generateStrudelCode(bracketNotation: string, keySignature?: KeySignature, useScaleMode: boolean = false, sound: string = "triangle"): string {
  if (useScaleMode && keySignature) {
    const scaleString = formatScaleForStrudel(keySignature);
    return `n(\`<${bracketNotation}>\`).scale("${scaleString}").sound("${sound}")`;
  } else {
    return `note(\`<${bracketNotation}>\`).sound("${sound}")`;
  }
}

// Calculate statistics for a set of notes
export function calculateStatistics(notes: Note[], bracketNotation: string) {
  const totalDuration = notes.length > 0 ? Math.max(...notes.map(n => n.release)) : 0;
  const restCount = (bracketNotation.match(/~/g) || []).length;
  
  return {
    noteCount: notes.length,
    restCount,
    totalDuration
  };
}