import {
  Note,
  WHOLE,
  HALF,
  QUARTER,
  EIGHTH,
  SIXTEENTH,
  THIRTY_SECOND,
} from "@/types/music";
import {
  KeySignature,
  noteToScaleDegree,
  formatScaleForStrudel,
} from "./musicTheory";
import { midiToDrumToken } from "./drumMapping";

// Convert MIDI number to note name
export function midiNumberToNoteName(midi: number): string {
  const noteNames = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  const octave = Math.floor(midi / 12) - 1;
  const note = noteNames[midi % 12];
  return `${note}${octave}`;
}

// Format duration for bracket notation
function formatDuration(duration: number): string {
  if (duration === WHOLE) return "";
  if (duration === HALF) return "@0.5";
  if (duration === QUARTER) return "@0.25";
  if (duration === EIGHTH) return "@0.125";
  if (duration === SIXTEENTH) return "@0.0625";
  if (duration === THIRTY_SECOND) return "@0.03125";

  // Round to 4 decimal places to avoid floating point precision issues
  const rounded = Math.round(duration * 10000) / 10000;
  return `@${rounded}`;
}

// Treat durations that are effectively zero (<= 0 or round to 0 at 4dp) as zero
function isZeroishDuration(duration: number): boolean {
  if (duration <= 0) return true;
  const rounded = Math.round(duration * 10000) / 10000;
  return rounded === 0;
}

// Check if notes overlap (at least 1 unit simultaneous)
function notesOverlap(note1: Note, note2: Note): boolean {
  return (
    Math.max(note1.start, note2.start) < Math.min(note1.release, note2.release)
  );
}

// Group overlapping notes
function groupOverlappingNotes(notes: Note[]): Note[][] {
  const sortedNotes = [...notes].sort((a, b) => a.start - b.start);
  const groups: Note[][] = [];

  for (const note of sortedNotes) {
    let addedToGroup = false;

    for (const group of groups) {
      if (group.some((groupNote) => notesOverlap(note, groupNote))) {
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
    if (isZeroishDuration(duration)) return "";
    return `${note.name}${formatDuration(duration)}`;
  }

  // Multiple overlapping notes - create bracket notation
  const earliestStart = Math.min(...group.map((n) => n.start));
  const latestRelease = Math.max(...group.map((n) => n.release));
  const bracketLength = latestRelease - earliestStart;
  if (isZeroishDuration(bracketLength)) return "";

  const entries: string[] = [];

  for (const note of group) {
    const offset = note.start - earliestStart;
    const duration = note.release - note.start;
    if (isZeroishDuration(duration)) continue;
    const pad = bracketLength - offset - duration;

    let entry = "";
    if (!isZeroishDuration(offset)) entry += `~${formatDuration(offset)} `;
    entry += `${note.name}${formatDuration(duration)}`;
    if (!isZeroishDuration(pad)) entry += ` ~${formatDuration(pad)}`;

    entries.push(entry);
  }

  if (entries.length === 0) return "";
  return `{${entries.join(", ")}}${formatDuration(bracketLength)}`;
}

// Main function to generate bracket notation
export function generateBracketNotation(notes: Note[]): string {
  if (notes.length === 0) return "";

  const groups = groupOverlappingNotes(notes);
  const sortedGroups = groups.sort(
    (a, b) =>
      Math.min(...a.map((n) => n.start)) - Math.min(...b.map((n) => n.start))
  );

  const parts: string[] = [];
  let lastEnd = 0;

  for (const group of sortedGroups) {
    const groupStart = Math.min(...group.map((n) => n.start));
    const groupEnd = Math.max(...group.map((n) => n.release));

    const groupStr = generateGroupNotation(group);
    if (!groupStr || !groupStr.trim()) {
      continue;
    }

    // Add rest if there's a gap before this non-empty group
    const restDuration = groupStart - lastEnd;
    if (!isZeroishDuration(restDuration)) {
      parts.push(`~${formatDuration(restDuration)}`);
    }

    parts.push(groupStr);
    lastEnd = groupEnd;
  }

  return parts.join(" ");
}

// Generate drum bracket notation using MIDI numbers to map to drum tokens
export function generateDrumBracketNotation(notes: Note[]): string {
  if (notes.length === 0) return "";

  const groups = groupOverlappingNotes(notes);
  const sortedGroups = groups.sort(
    (a, b) =>
      Math.min(...a.map((n) => n.start)) - Math.min(...b.map((n) => n.start))
  );

  const parts: string[] = [];
  let lastEnd = 0;

  for (const group of sortedGroups) {
    const groupStart = Math.min(...group.map((n) => n.start));
    const groupEnd = Math.max(...group.map((n) => n.release));

    // Convert notes to drum tokens using midiNumber
    const drumGroup = group.map((note) => ({
      ...note,
      name: note.midiNumber ? midiToDrumToken(note.midiNumber) : note.name,
    }));

    const groupStr = generateGroupNotation(drumGroup);
    if (!groupStr || !groupStr.trim()) continue;

    const restDuration = groupStart - lastEnd;
    if (!isZeroishDuration(restDuration)) {
      parts.push(`~${formatDuration(restDuration)}`);
    }

    parts.push(groupStr);
    lastEnd = groupEnd;
  }

  return parts.join(" ");
}

// Format bracket notation with line breaks
export function formatBracketNotation(
  bracketNotation: string,
  lineLength: number = 8
): string {
  if (!bracketNotation.trim()) return "";

  const parts = bracketNotation.split(" ").filter((part) => part.trim());
  if (parts.length === 0) return "";

  const lines: string[] = [];
  let currentLine: string[] = [];
  let elementCount = 0;
  let bracketCount = 0;

  for (const part of parts) {
    const isBracket = part.startsWith("{");

    currentLine.push(part);
    elementCount++;
    if (isBracket) bracketCount++;

    // Break line if we have reached lineLength elements OR 2 brackets
    const shouldBreak = elementCount >= lineLength || bracketCount >= 2;

    if (shouldBreak) {
      lines.push(currentLine.join(" "));
      currentLine = [];
      elementCount = 0;
      bracketCount = 0;
    }
  }

  // Add any remaining elements
  if (currentLine.length > 0) {
    lines.push(currentLine.join(" "));
  }

  return lines.join("\n");
}

// Format drum bracket notation with line breaks (same logic as regular bracket notation)
export function formatDrumBracketNotation(
  bracketNotation: string,
  lineLength: number = 8
): string {
  // Use the same formatting logic as formatBracketNotation
  // since drum tokens follow the same structure as note names
  return formatBracketNotation(bracketNotation, lineLength);
}

// Convert notes to scale degree representation
function convertNotesToScaleDegrees(
  notes: Note[],
  keySignature: KeySignature
): Array<{ degree: number; start: number; release: number }> {
  return notes.map((note) => {
    const { degree } = noteToScaleDegree(note.name, keySignature);
    return {
      degree,
      start: note.start,
      release: note.release,
    };
  });
}

// Generate bracket notation for scale degrees
function generateScaleDegreeNotation(
  scaleDegrees: Array<{ degree: number; start: number; release: number }>
): string {
  if (scaleDegrees.length === 0) return "";

  // Group overlapping scale degrees (similar logic to note grouping)
  const groups = groupOverlappingScaleDegrees(scaleDegrees);
  const sortedGroups = groups.sort(
    (a, b) =>
      Math.min(...a.map((n) => n.start)) - Math.min(...b.map((n) => n.start))
  );

  const parts: string[] = [];
  let lastEnd = 0;

  for (const group of sortedGroups) {
    const groupStart = Math.min(...group.map((n) => n.start));
    const groupEnd = Math.max(...group.map((n) => n.release));

    const groupStr = generateScaleDegreeGroupNotation(group);
    if (!groupStr || !groupStr.trim()) {
      continue;
    }

    // Add rest if there's a gap
    const restDuration = groupStart - lastEnd;
    if (!isZeroishDuration(restDuration)) {
      parts.push(`~${formatDuration(restDuration)}`);
    }

    parts.push(groupStr);
    lastEnd = groupEnd;
  }

  return parts.join(" ");
}

// Group overlapping scale degrees
function groupOverlappingScaleDegrees(
  scaleDegrees: Array<{ degree: number; start: number; release: number }>
): Array<Array<{ degree: number; start: number; release: number }>> {
  const sortedDegrees = [...scaleDegrees].sort((a, b) => a.start - b.start);
  const groups: Array<
    Array<{ degree: number; start: number; release: number }>
  > = [];

  for (const degree of sortedDegrees) {
    let addedToGroup = false;

    for (const group of groups) {
      if (
        group.some((groupDegree) => scaleDegreesOverlap(degree, groupDegree))
      ) {
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
function scaleDegreesOverlap(
  degree1: { start: number; release: number },
  degree2: { start: number; release: number }
): boolean {
  return (
    Math.max(degree1.start, degree2.start) <
    Math.min(degree1.release, degree2.release)
  );
}

// Generate bracket notation for a group of scale degrees
function generateScaleDegreeGroupNotation(
  group: Array<{ degree: number; start: number; release: number }>
): string {
  if (group.length === 1) {
    const degree = group[0];
    const duration = degree.release - degree.start;
    if (isZeroishDuration(duration)) return "";
    return `${degree.degree}${formatDuration(duration)}`;
  }

  // Multiple overlapping scale degrees - create bracket notation
  const earliestStart = Math.min(...group.map((n) => n.start));
  const latestRelease = Math.max(...group.map((n) => n.release));
  const bracketLength = latestRelease - earliestStart;
  if (isZeroishDuration(bracketLength)) return "";

  const entries: string[] = [];

  for (const degree of group) {
    const offset = degree.start - earliestStart;
    const duration = degree.release - degree.start;
    if (isZeroishDuration(duration)) continue;
    const pad = bracketLength - offset - duration;

    let entry = "";
    if (!isZeroishDuration(offset)) entry += `~${formatDuration(offset)} `;
    entry += `${degree.degree}${formatDuration(duration)}`;
    if (!isZeroishDuration(pad)) entry += ` ~${formatDuration(pad)}`;

    entries.push(entry);
  }

  if (entries.length === 0) return "";
  return `{${entries.join(", ")}}${formatDuration(bracketLength)}`;
}

// Main function to generate formatted bracket notation
export function generateFormattedBracketNotation(
  notes: Note[],
  lineLength: number = 8,
  keySignature?: KeySignature,
  useScaleMode: boolean = false
): string {
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
export function generateStrudelCode(
  bracketNotation: string,
  keySignature?: KeySignature,
  useScaleMode: boolean = false,
  sound: string = "triangle",
  velocityPattern?: string,
  includeVelocity: boolean = false
): string {
  let baseCode: string;

  if (useScaleMode && keySignature) {
    const scaleString = formatScaleForStrudel(keySignature);
    baseCode = `n(\`<${bracketNotation}>\`).scale("${scaleString}").sound("${sound}")`;
  } else {
    baseCode = `note(\`<${bracketNotation}>\`).sound("${sound}")`;
  }

  // Add velocity if requested and available
  if (includeVelocity && velocityPattern && velocityPattern.trim()) {
    baseCode += `.velocity(\`<${velocityPattern}>\`)`;
  }

  return baseCode;
}

/**
 * Extract velocity pattern from notes that matches the note structure
 */
export function extractVelocityPattern(notes: Note[]): string {
  if (notes.length === 0) return "";

  const groups = groupOverlappingNotes(notes);
  const sortedGroups = groups.sort(
    (a, b) =>
      Math.min(...a.map((n) => n.start)) - Math.min(...b.map((n) => n.start))
  );

  const parts: string[] = [];
  let lastEnd = 0;

  for (const group of sortedGroups) {
    const groupStart = Math.min(...group.map((n) => n.start));
    const groupEnd = Math.max(...group.map((n) => n.release));

    const groupStr = generateVelocityGroupNotation(group);
    if (!groupStr || !groupStr.trim()) {
      continue;
    }

    // Add rest if there's a gap
    const restDuration = groupStart - lastEnd;
    if (!isZeroishDuration(restDuration)) {
      parts.push(`~${formatDuration(restDuration)}`);
    }

    parts.push(groupStr);
    lastEnd = groupEnd;
  }

  return parts.join(" ");
}

/**
 * Generate velocity notation for a group of notes
 */
function generateVelocityGroupNotation(group: Note[]): string {
  if (group.length === 1) {
    const note = group[0];
    const duration = note.release - note.start;
    if (isZeroishDuration(duration)) return "";
    const velocity = note.velocity ?? 0.7; // Default velocity if not specified
    return `${velocity.toFixed(2)}${formatDuration(duration)}`;
  }

  // Multiple overlapping notes - create bracket notation for velocities
  const earliestStart = Math.min(...group.map((n) => n.start));
  const latestRelease = Math.max(...group.map((n) => n.release));
  const bracketLength = latestRelease - earliestStart;
  if (isZeroishDuration(bracketLength)) return "";

  const entries: string[] = [];

  for (const note of group) {
    const offset = note.start - earliestStart;
    const duration = note.release - note.start;
    if (isZeroishDuration(duration)) continue;
    const pad = bracketLength - offset - duration;
    const velocity = note.velocity ?? 0.7;

    let entry = "";
    if (!isZeroishDuration(offset)) entry += `~${formatDuration(offset)} `;
    entry += `${velocity.toFixed(2)}${formatDuration(duration)}`;
    if (!isZeroishDuration(pad)) entry += ` ~${formatDuration(pad)}`;

    entries.push(entry);
  }

  if (entries.length === 0) return "";
  return `{${entries.join(", ")}}${formatDuration(bracketLength)}`;
}

/**
 * Extract velocity pattern that matches note structure, handling both regular and scale degree modes
 */
export function extractFormattedVelocityPattern(
  notes: Note[],
  lineLength: number = 8,
  keySignature?: KeySignature,
  useScaleMode: boolean = false
): string {
  if (useScaleMode && keySignature) {
    const scaleDegrees = convertNotesToScaleDegrees(notes, keySignature);
    const velocityPattern = extractScaleDegreeVelocityPattern(
      scaleDegrees,
      notes
    );
    return formatVelocityPattern(velocityPattern, lineLength);
  } else {
    const velocityPattern = extractVelocityPattern(notes);
    return formatVelocityPattern(velocityPattern, lineLength);
  }
}

/**
 * Extract velocity pattern for scale degrees
 */
function extractScaleDegreeVelocityPattern(
  scaleDegrees: Array<{ degree: number; start: number; release: number }>,
  notes: Note[]
): string {
  if (scaleDegrees.length === 0) return "";

  // Group overlapping scale degrees (similar logic to note grouping)
  const groups = groupOverlappingScaleDegrees(scaleDegrees);
  const sortedGroups = groups.sort(
    (a, b) =>
      Math.min(...a.map((n) => n.start)) - Math.min(...b.map((n) => n.start))
  );

  const parts: string[] = [];
  let lastEnd = 0;

  for (const group of sortedGroups) {
    const groupStart = Math.min(...group.map((n) => n.start));
    const groupEnd = Math.max(...group.map((n) => n.release));

    const groupStr = generateScaleDegreeVelocityGroupNotation(group, notes);
    if (!groupStr || !groupStr.trim()) {
      continue;
    }

    // Add rest if there's a gap
    const restDuration = groupStart - lastEnd;
    if (!isZeroishDuration(restDuration)) {
      parts.push(`~${formatDuration(restDuration)}`);
    }

    parts.push(groupStr);
    lastEnd = groupEnd;
  }

  return parts.join(" ");
}

/**
 * Generate velocity notation for a group of scale degrees
 */
function generateScaleDegreeVelocityGroupNotation(
  group: Array<{ degree: number; start: number; release: number }>,
  notes: Note[]
): string {
  if (group.length === 1) {
    const degree = group[0];
    const duration = degree.release - degree.start;
    if (isZeroishDuration(duration)) return "";
    // Find the corresponding note to get its velocity
    const correspondingNote = notes.find(
      (n) =>
        Math.abs(n.start - degree.start) < 0.001 &&
        Math.abs(n.release - degree.release) < 0.001
    );
    const velocity = correspondingNote?.velocity ?? 0.7;
    return `${velocity.toFixed(2)}${formatDuration(duration)}`;
  }

  // Multiple overlapping scale degrees - create bracket notation for velocities
  const earliestStart = Math.min(...group.map((n) => n.start));
  const latestRelease = Math.max(...group.map((n) => n.release));
  const bracketLength = latestRelease - earliestStart;
  if (isZeroishDuration(bracketLength)) return "";

  const entries: string[] = [];

  for (const degree of group) {
    const offset = degree.start - earliestStart;
    const duration = degree.release - degree.start;
    if (isZeroishDuration(duration)) continue;
    const pad = bracketLength - offset - duration;
    // Find the corresponding note to get its velocity
    const correspondingNote = notes.find(
      (n) =>
        Math.abs(n.start - degree.start) < 0.001 &&
        Math.abs(n.release - degree.release) < 0.001
    );
    const velocity = correspondingNote?.velocity ?? 0.7;

    let entry = "";
    if (!isZeroishDuration(offset)) entry += `~${formatDuration(offset)} `;
    entry += `${velocity.toFixed(2)}${formatDuration(duration)}`;
    if (!isZeroishDuration(pad)) entry += ` ~${formatDuration(pad)}`;

    entries.push(entry);
  }

  if (entries.length === 0) return "";
  return `{${entries.join(", ")}}${formatDuration(bracketLength)}`;
}

/**
 * Format velocity pattern with line breaks
 */
export function formatVelocityPattern(
  velocityPattern: string,
  lineLength: number = 8
): string {
  if (!velocityPattern.trim()) return "";

  const parts = velocityPattern.split(" ").filter((part) => part.trim());
  if (parts.length === 0) return "";

  const lines: string[] = [];
  let currentLine: string[] = [];
  let elementCount = 0;
  let bracketCount = 0;

  for (const part of parts) {
    const isBracket = part.startsWith("{");

    currentLine.push(part);
    elementCount++;
    if (isBracket) bracketCount++;

    // Break line if we have reached lineLength elements OR 2 brackets
    const shouldBreak = elementCount >= lineLength || bracketCount >= 2;

    if (shouldBreak) {
      lines.push(currentLine.join(" "));
      currentLine = [];
      elementCount = 0;
      bracketCount = 0;
    }
  }

  // Add any remaining elements
  if (currentLine.length > 0) {
    lines.push(currentLine.join(" "));
  }

  return lines.join("\n");
}

// Generate bar-based bracket notation
export function generateBarBracketNotation(
  notes: Note[],
  barsPerLine: number = 4,
  timeSignature: { numerator: number; denominator: number } = {
    numerator: 4,
    denominator: 4,
  },
  keySignature?: KeySignature,
  useScaleMode: boolean = false
): string {
  if (notes.length === 0) return "";

  // Sort notes by start time
  const sortedNotes = [...notes].sort((a, b) => a.start - b.start);

  // Group notes into bars (1 cycle = 1 bar)
  const bars: Array<{ barNumber: number; notes: Note[] }> = [];
  let currentBar = 0;

  for (const note of sortedNotes) {
    const barStart = Math.floor(note.start);

    // Find or create the bar
    let bar = bars.find((b) => b.barNumber === barStart);
    if (!bar) {
      bar = { barNumber: barStart, notes: [] };
      bars.push(bar);
    }

    bar.notes.push(note);
  }

  // Sort bars by bar number
  bars.sort((a, b) => a.barNumber - b.barNumber);

  // Generate notation for each bar
  const result: string[] = [];
  let lastBarEnd = 0;

  for (const bar of bars) {
    // Add empty bars if there's a gap
    while (lastBarEnd < bar.barNumber) {
      result.push("[~ ~ ~ ~]"); // Rest bar
      lastBarEnd++;
    }

    // Process notes in this bar
    const barNotation = generateSingleBarNotation(
      bar.notes,
      bar.barNumber,
      timeSignature,
      keySignature,
      useScaleMode
    );
    result.push(barNotation);
    lastBarEnd = bar.barNumber + 1;
  }

  // Format with line breaks
  const lines: string[] = [];
  for (let i = 0; i < result.length; i += barsPerLine) {
    lines.push(result.slice(i, i + barsPerLine).join(" "));
  }

  return lines.join("\n");
}

// Generate notation for a single bar
function generateSingleBarNotation(
  barNotes: Note[],
  barNumber: number,
  timeSignature: { numerator: number; denominator: number },
  keySignature?: KeySignature,
  useScaleMode: boolean = false
): string {
  const barStart = barNumber;
  const barEnd = barNumber + 1;

  // Sort notes by start time within the bar
  const sortedNotes = [...barNotes].sort((a, b) => a.start - b.start);

  // Get all unique start times (events) in the bar
  const events: Array<{ time: number; notes: Note[] }> = [];
  const eventTimes = new Set<number>();

  for (const note of sortedNotes) {
    eventTimes.add(note.start);
  }

  // Group notes by their start time
  for (const time of Array.from(eventTimes).sort((a, b) => a - b)) {
    const notesAtTime = sortedNotes.filter(
      (n) => Math.abs(n.start - time) < 0.001
    );
    events.push({ time, notes: notesAtTime });
  }

  // Build bar content - each event gets equal time
  const content: string[] = [];

  if (events.length === 0) {
    // Empty bar - just rests
    return "[~ ~ ~ ~]";
  }

  // Add the events
  for (const event of events) {
    if (event.notes.length === 1) {
      // Single note
      const noteName =
        useScaleMode && keySignature
          ? noteToScaleDegree(
              event.notes[0].name,
              keySignature
            ).degree.toString()
          : event.notes[0].name;
      content.push(noteName);
    } else {
      // Chord
      const chordNotes = event.notes.map((n) => {
        const noteName =
          useScaleMode && keySignature
            ? noteToScaleDegree(n.name, keySignature).degree.toString()
            : n.name;
        return noteName;
      });
      content.push(`{${chordNotes.join(", ")}}`);
    }
  }

  // Simply output the content - sustains are handled differently in bar syntax
  // Each note/chord starts at its event time, and if it sustains longer,
  // that's represented by the note's natural duration in the equal division
  const processedContent = [...content];

  // Handle notes extending beyond this bar
  const overflowingNotes = sortedNotes.filter((note) => note.release > barEnd);
  if (overflowingNotes.length > 0) {
    // Find the longest overflow duration
    const maxOverflow = Math.max(
      ...overflowingNotes.map((note) => note.release - barEnd)
    );
    const continuation = ` _${formatDuration(maxOverflow)}`;
    return `[${processedContent.join(" ")}]${continuation}`;
  }

  return `[${processedContent.join(" ")}]`;
}

// Calculate statistics for a set of notes
export function calculateStatistics(notes: Note[], bracketNotation: string) {
  const totalDuration =
    notes.length > 0 ? Math.max(...notes.map((n) => n.release)) : 0;
  const restCount = (bracketNotation.match(/~/g) || []).length;

  return {
    noteCount: notes.length,
    restCount,
    totalDuration,
  };
}
