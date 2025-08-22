import { Note, WHOLE, HALF, QUARTER, EIGHTH, SIXTEENTH, THIRTY_SECOND } from '@/types/music';

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