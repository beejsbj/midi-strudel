import { Note } from "@/types/music";
import { calculateKeySignature, KeySignature, noteToScaleDegree } from "./musicTheory";

// ============================================================================
// CORE INTERFACES
// ============================================================================

export interface StrudelConfig {
  // Output style
  outputStyle: 'polyphonic' | 'melody+harmony' | 'monophonic';
  
  // Key/Mode settings
  keyModeSource: 'default' | 'calculated';
  key?: string;
  mode?: string;
  
  // Notation type
  notationType: 'absolute' | 'relative'; // note() vs n().scale()
  
  // Duration system
  cycleUnit: 'bar' | 'beat'; // @1 = whole bar vs @1 = one beat
  
  // Formatting
  formatPerLineBy: 'note' | 'measure';
  notesPerLine: number; // max 12, default 8
  measuresPerLine: number; // max 4, default 1
  
  // Velocity
  includeVelocity: boolean;
  
  // Timing style
  timingStyle: 'absoluteDuration' | 'relativeDivision';
  
  // Precision
  durationPrecision: number; // decimal places, default 4
  
  // Quantization
  isQuantized: boolean;
  quantizationThreshold: number; // 0-200ms
  quantizationStrength: number; // 0-100%
  
  // Metadata
  bpm?: number;
  timeSignature?: { numerator: number; denominator: number };
  sound?: string;
}

export interface Track {
  notes: Note[];
  key?: string;
  mode?: string;
  bpm?: number;
  timesig?: string;
  sound?: string;
}

interface SubdivisionGroup {
  notes: Note[];
  totalDuration: number;
}

interface OverlappingGroup {
  notes: Note[];
  start: number;
  end: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: StrudelConfig = {
  outputStyle: 'melody+harmony',
  keyModeSource: 'default',
  key: 'C',
  mode: 'chromatic',
  notationType: 'absolute',
  cycleUnit: 'bar',
  formatPerLineBy: 'note',
  notesPerLine: 8,
  measuresPerLine: 1,
  includeVelocity: false,
  timingStyle: 'absoluteDuration',
  durationPrecision: 4,
  isQuantized: false,
  quantizationThreshold: 50,
  quantizationStrength: 70,
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  sound: 'sine'
};

// ============================================================================
// STRUDEL NOTATION CLASS
// ============================================================================

export class StrudelNotation {
  private config: StrudelConfig;
  private track: Track;
  private keySignature: KeySignature | null = null;
  private cps: number = 0.5;
  private cycleLength: number = 2000; // milliseconds

  constructor(notes: Note[], config?: Partial<StrudelConfig>) {
    this.track = { notes };
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initialize();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initialize(): void {
    // Calculate CPS and cycle length
    const bpm = this.config.bpm || DEFAULT_CONFIG.bpm!;
    const timeSig = this.config.timeSignature || DEFAULT_CONFIG.timeSignature!;
    
    if (this.config.cycleUnit === 'bar') {
      // @1 = one whole bar
      this.cps = bpm / 60 / timeSig.numerator;
    } else {
      // @1 = one beat
      this.cps = bpm / 60;
    }
    
    this.cycleLength = 1000 / this.cps;

    // Calculate key signature if needed
    if (this.config.keyModeSource === 'calculated') {
      this.keySignature = calculateKeySignature(this.track.notes);
    } else if (this.config.key && this.config.mode) {
      this.keySignature = {
        key: this.config.key,
        mode: this.config.mode as "major" | "minor",
        confidence: 1.0,
        rootOctave: 4
      };
    }
  }

  // ============================================================================
  // CONFIGURATION METHODS
  // ============================================================================

  setConfig(config: Partial<StrudelConfig>): void {
    this.config = { ...this.config, ...config };
    this.initialize();
  }

  getConfig(): StrudelConfig {
    return { ...this.config };
  }

  // ============================================================================
  // MAIN GENERATION METHOD
  // ============================================================================

  generate(): string {
    let processedNotes = [...this.track.notes];

    // Apply quantization if enabled
    if (this.config.isQuantized) {
      processedNotes = this.quantizeNotes(processedNotes);
    }

    // Sort notes by start time
    processedNotes.sort((a, b) => a.start - b.start);

    // Generate based on output style
    switch (this.config.outputStyle) {
      case 'polyphonic':
        return this.toPolyphonic(processedNotes);
      case 'melody+harmony':
        return this.toMelodyHarmony(processedNotes);
      case 'monophonic':
        return this.toMonophonic(processedNotes);
      default:
        return this.toPolyphonic(processedNotes);
    }
  }

  // ============================================================================
  // OUTPUT STYLES
  // ============================================================================

  private toPolyphonic(notes: Note[]): string {
    const notation = this.config.timingStyle === 'absoluteDuration'
      ? this.generateAbsoluteDuration(notes)
      : this.generateRelativeDivision(notes);

    const formatted = this.formatNotation(notation);
    return this.wrapInStrudelSyntax(formatted, this.config.sound);
  }

  private toMelodyHarmony(notes: Note[]): string {
    const { melody, harmony } = this.separateMelodyHarmony(notes);

    const melodyNotation = this.config.timingStyle === 'absoluteDuration'
      ? this.generateAbsoluteDuration(melody)
      : this.generateRelativeDivision(melody);

    const harmonyNotation = this.config.timingStyle === 'absoluteDuration'
      ? this.generateAbsoluteDuration(harmony)
      : this.generateRelativeDivision(harmony);

    const formattedMelody = this.formatNotation(melodyNotation);
    const formattedHarmony = this.formatNotation(harmonyNotation);

    const sound = this.config.sound || 'sine';
    const melodyVar = `$${sound.toUpperCase()}_MELODY`;
    const harmonyVar = `$${sound.toUpperCase()}_HARMONY`;

    let result = '';
    
    if (melody.length > 0) {
      result += `${melodyVar}: ${this.wrapInStrudelSyntax(formattedMelody, sound)}\n\n`;
    }
    
    if (harmony.length > 0) {
      result += `${harmonyVar}: ${this.wrapInStrudelSyntax(formattedHarmony, sound)}\n\n`;
    }

    // Stack them if both exist
    if (melody.length > 0 && harmony.length > 0) {
      result += `stack(${melodyVar}, ${harmonyVar})`;
    } else if (melody.length > 0) {
      result += melodyVar;
    } else if (harmony.length > 0) {
      result += harmonyVar;
    }

    return result;
  }

  private toMonophonic(notes: Note[]): string {
    const streams = this.distributeToStreams(notes);
    const sound = this.config.sound || 'sine';
    
    let result = '';
    const streamVars: string[] = [];

    streams.forEach((streamNotes, index) => {
      const notation = this.config.timingStyle === 'absoluteDuration'
        ? this.generateAbsoluteDuration(streamNotes)
        : this.generateRelativeDivision(streamNotes);

      const formatted = this.formatNotation(notation);
      const varName = `$${sound.toUpperCase()}_${index + 1}`;
      streamVars.push(varName);

      result += `${varName}: ${this.wrapInStrudelSyntax(formatted, sound)}\n\n`;
    });

    // Stack all streams
    if (streamVars.length > 0) {
      result += `stack(${streamVars.join(', ')})`;
    }

    return result;
  }

  // ============================================================================
  // ABSOLUTE DURATION NOTATION
  // ============================================================================

  private generateAbsoluteDuration(notes: Note[]): string {
    if (notes.length === 0) return '';

    const groups = this.groupNotesByTiming(notes);
    const elements: string[] = [];

    for (const group of groups) {
      if (group.notes.length === 1) {
        // Single note
        elements.push(this.formatSingleNote(group.notes[0]));
      } else {
        // Overlapping notes - use bracket notation
        elements.push(this.generateOverlappingBracket(group.notes, group.start, group.end));
      }
    }

    // Fill gaps with rests
    return this.fillGapsWithRests(elements, notes);
  }

  private formatSingleNote(note: Note): string {
    const noteName = this.getNoteName(note);
    const duration = this.calculateNoteDuration(note);
    const velocity = this.config.includeVelocity && note.velocity !== undefined
      ? `:${note.velocity.toFixed(2)}`
      : '';

    if (Math.abs(duration - 1) < 0.0001) {
      return `${noteName}${velocity}`;
    }
    return `${noteName}${this.formatDuration(duration)}${velocity}`;
  }

  private generateOverlappingBracket(notes: Note[], groupStart: number, groupEnd: number): string {
    const bracketDuration = this.timeToStrudelDuration(groupEnd - groupStart);
    const entries: string[] = [];

    notes.forEach(note => {
      const offset = this.timeToStrudelDuration(note.start - groupStart);
      const duration = this.timeToStrudelDuration(note.release - note.start);
      const endPad = bracketDuration - offset - duration;

      let entry = '';
      if (offset > 0.0001) {
        entry += `~${this.formatDuration(offset)} `;
      }

      const noteName = this.getNoteName(note);
      const velocity = this.config.includeVelocity && note.velocity !== undefined
        ? `:${note.velocity.toFixed(2)}`
        : '';

      entry += `${noteName}${this.formatDuration(duration)}${velocity}`;

      if (endPad > 0.0001) {
        entry += ` ~${this.formatDuration(endPad)}`;
      }

      entries.push(entry);
    });

    return `{${entries.join(', ')}}${this.formatDuration(bracketDuration)}`;
  }

  // ============================================================================
  // RELATIVE DIVISION NOTATION (SUBDIVISION)
  // ============================================================================

  private generateRelativeDivision(notes: Note[]): string {
    if (notes.length === 0) return '';

    // Group notes to accumulate to whole measures
    const groups = this.accumulateToWholeMeasure(notes);
    const elements: string[] = [];

    for (const group of groups) {
      const bracket = this.generateSubdivisionBracket(group.notes, group.totalDuration);
      elements.push(bracket);
    }

    return elements.join(' ');
  }

  private generateSubdivisionBracket(notes: Note[], totalDuration: number): string {
    // Check for overlapping notes
    const overlaps = this.findOverlaps(notes);
    
    if (overlaps.length === 0) {
      // Simple sequential subdivision
      return this.generateSimpleSubdivision(notes, totalDuration);
    } else {
      // Complex with overlaps
      return this.generateComplexSubdivision(notes, totalDuration);
    }
  }

  private generateSimpleSubdivision(notes: Note[], totalDuration: number): string {
    const elements: string[] = [];
    let currentTime = notes[0].start;

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      
      // Add rest if gap before this note
      if (note.start > currentTime) {
        const gapCount = Math.round((note.start - currentTime) / ((note.release - note.start) || 1));
        for (let j = 0; j < gapCount; j++) {
          elements.push('~');
        }
      }

      // Add note
      const noteName = this.getNoteName(note);
      const velocity = this.config.includeVelocity && note.velocity !== undefined
        ? `:${note.velocity.toFixed(2)}`
        : '';
      elements.push(`${noteName}${velocity}`);

      // Check if note should sustain
      if (i < notes.length - 1) {
        const nextNote = notes[i + 1];
        const noteDuration = note.release - note.start;
        const timeToNext = nextNote.start - note.start;
        
        if (timeToNext > noteDuration) {
          // Add sustains
          const sustainCount = Math.round((timeToNext - noteDuration) / noteDuration);
          for (let j = 0; j < sustainCount; j++) {
            elements.push('_');
          }
        }
      }

      currentTime = note.release;
    }

    const bracketContent = elements.join(' ');
    const duration = this.timeToStrudelDuration(totalDuration);
    
    if (Math.abs(duration - 1) < 0.0001) {
      return `[${bracketContent}]`;
    }
    return `[${bracketContent}]${this.formatDuration(duration)}`;
  }

  private generateComplexSubdivision(notes: Note[], totalDuration: number): string {
    // For now, fall back to duration-based notation for complex overlaps
    // TODO: Implement full nested subdivision logic
    return this.generateAbsoluteDuration(notes);
  }

  // ============================================================================
  // HELPER METHODS - TIMING & DURATION
  // ============================================================================

  private calculateNoteDuration(note: Note): number {
    const durationMs = note.release - note.start;
    return this.timeToStrudelDuration(durationMs);
  }

  private timeToStrudelDuration(timeMs: number): number {
    const duration = timeMs / this.cycleLength;
    const precision = this.config.durationPrecision;
    return Math.round(duration * Math.pow(10, precision)) / Math.pow(10, precision);
  }

  private formatDuration(duration: number): string {
    if (Math.abs(duration - 1) < 0.0001) return '';
    const rounded = Math.round(duration * Math.pow(10, this.config.durationPrecision)) 
      / Math.pow(10, this.config.durationPrecision);
    return `@${rounded}`;
  }

  // ============================================================================
  // HELPER METHODS - NOTE NAMING
  // ============================================================================

  private getNoteName(note: Note): string {
    if (this.config.notationType === 'relative' && this.keySignature) {
      const scaleDegree = noteToScaleDegree(note.name, this.keySignature);
      return `${scaleDegree.degree}`;
    }
    return note.name;
  }
  
  private extractNoteNameOnly(fullNoteName: string): string {
    return fullNoteName.replace(/\d+$/, '');
  }

  // ============================================================================
  // HELPER METHODS - GROUPING & SEPARATION
  // ============================================================================

  private groupNotesByTiming(notes: Note[]): OverlappingGroup[] {
    if (notes.length === 0) return [];

    const groups: OverlappingGroup[] = [];
    let currentGroup: Note[] = [notes[0]];
    let currentStart = notes[0].start;
    let currentEnd = notes[0].release;

    for (let i = 1; i < notes.length; i++) {
      const note = notes[i];
      
      // Check if this note overlaps with current group
      if (note.start < currentEnd) {
        currentGroup.push(note);
        currentEnd = Math.max(currentEnd, note.release);
      } else {
        // Finalize current group
        groups.push({
          notes: currentGroup,
          start: currentStart,
          end: currentEnd
        });
        
        // Start new group
        currentGroup = [note];
        currentStart = note.start;
        currentEnd = note.release;
      }
    }

    // Add final group
    if (currentGroup.length > 0) {
      groups.push({
        notes: currentGroup,
        start: currentStart,
        end: currentEnd
      });
    }

    return groups;
  }

  private separateMelodyHarmony(notes: Note[]): { melody: Note[]; harmony: Note[] } {
    const melody: Note[] = [];
    const harmony: Note[] = [];
    
    const groups = this.groupNotesByTiming(notes);
    
    for (const group of groups) {
      if (group.notes.length === 1) {
        melody.push(group.notes[0]);
      } else {
        harmony.push(...group.notes);
      }
    }

    return { melody, harmony };
  }

  private distributeToStreams(notes: Note[]): Note[][] {
    const sorted = [...notes].sort((a, b) => a.start - b.start);
    const streams: Note[][] = [];
    const streamEndTimes: number[] = [];

    for (const note of sorted) {
      // Find first available stream
      let assignedStream = -1;
      
      for (let i = 0; i < streamEndTimes.length; i++) {
        if (note.start >= streamEndTimes[i]) {
          assignedStream = i;
          break;
        }
      }

      if (assignedStream === -1) {
        // Create new stream
        streams.push([note]);
        streamEndTimes.push(note.release);
      } else {
        // Add to existing stream
        streams[assignedStream].push(note);
        streamEndTimes[assignedStream] = note.release;
      }
    }

    return streams;
  }

  private accumulateToWholeMeasure(notes: Note[]): SubdivisionGroup[] {
    const groups: SubdivisionGroup[] = [];
    let currentGroup: Note[] = [];
    let accumulatedDuration = 0;
    let groupStartTime = notes[0]?.start || 0;

    for (const note of notes) {
      const noteDuration = this.timeToStrudelDuration(note.release - note.start);
      currentGroup.push(note);
      accumulatedDuration += noteDuration;

      // Check if accumulated duration is close to a whole number
      const remainder = accumulatedDuration - Math.round(accumulatedDuration);
      
      if (Math.abs(remainder) < 0.01) {
        groups.push({
          notes: currentGroup,
          totalDuration: note.release - groupStartTime
        });
        currentGroup = [];
        accumulatedDuration = 0;
        groupStartTime = note.release;
      }
    }

    // Handle remaining notes
    if (currentGroup.length > 0) {
      groups.push({
        notes: currentGroup,
        totalDuration: currentGroup[currentGroup.length - 1].release - groupStartTime
      });
    }

    return groups;
  }

  private findOverlaps(notes: Note[]): number[][] {
    const overlaps: number[][] = [];
    
    for (let i = 0; i < notes.length; i++) {
      for (let j = i + 1; j < notes.length; j++) {
        const a = notes[i];
        const b = notes[j];
        
        if (a.start < b.release && b.start < a.release) {
          overlaps.push([i, j]);
        }
      }
    }

    return overlaps;
  }

  private fillGapsWithRests(elements: string[], notes: Note[]): string {
    // For simplicity, return elements joined
    // TODO: Implement proper gap detection and rest insertion
    return elements.join(' ');
  }

  // ============================================================================
  // QUANTIZATION
  // ============================================================================

  private quantizeNotes(notes: Note[]): Note[] {
    const thresholdMs = this.config.quantizationThreshold;
    const thresholdCycles = thresholdMs / this.cycleLength;
    const strength = this.config.quantizationStrength / 100;
    
    return notes.map(note => {
      const nearestGridStart = this.findNearestGridPoint(note.start);
      const offsetStart = Math.abs(note.start - nearestGridStart);
      
      let newStart = note.start;
      let newRelease = note.release;
      
      // Only quantize if offset exceeds threshold (in cycle units)
      if (offsetStart > thresholdCycles) {
        const correction = (nearestGridStart - note.start) * strength;
        newStart = note.start + correction;
        newRelease = note.release + correction;
      }

      return {
        ...note,
        start: newStart,
        release: newRelease
      };
    });
  }

  private findNearestGridPoint(time: number): number {
    const gridSize = this.cycleLength / 16; // 16th note grid
    return Math.round(time / gridSize) * gridSize;
  }

  // ============================================================================
  // FORMATTING
  // ============================================================================

  private formatNotation(notation: string): string {
    if (this.config.formatPerLineBy === 'measure') {
      return this.formatByMeasures(notation);
    } else {
      return this.formatByNotes(notation);
    }
  }

  private formatByNotes(notation: string): string {
    const tokens = notation.split(/\s+/);
    const lines: string[] = [];
    let currentLine: string[] = [];
    let noteCount = 0;

    for (const token of tokens) {
      currentLine.push(token);
      
      // Count as a note if it's not a rest and doesn't start with special chars
      if (!token.startsWith('~') && !token.startsWith('{')) {
        noteCount++;
      }

      if (noteCount >= this.config.notesPerLine) {
        lines.push(currentLine.join(' '));
        currentLine = [];
        noteCount = 0;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine.join(' '));
    }

    return lines.join('\n');
  }

  private formatByMeasures(notation: string): string {
    // TODO: Implement measure-based formatting
    // For now, fall back to note-based formatting
    return this.formatByNotes(notation);
  }

  // ============================================================================
  // STRUDEL SYNTAX WRAPPING
  // ============================================================================

  private wrapInStrudelSyntax(notation: string, sound?: string): string {
    const lines = notation.split('\n');
    const indented = lines.map(line => line.trim() ? `  ${line}` : line).join('\n');
    
    let result = `<\n${indented}\n>`;
    
    if (this.config.notationType === 'relative' && this.keySignature) {
      const scaleStr = `${this.keySignature.key}${this.keySignature.rootOctave}:${this.keySignature.mode}`;
      result += `.as("${this.config.includeVelocity ? 'n:velocity' : 'n'}").scale("${scaleStr}")`;
    } else {
      result += `.as("${this.config.includeVelocity ? 'note:velocity' : 'note'}")`;
    }
    
    if (sound) {
      result += `.sound("${sound}")`;
    }

    return result;
  }
}
