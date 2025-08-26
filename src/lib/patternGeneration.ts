import { Note } from '@/types/music';
import { DetectedPattern, PatternInstance } from './patternDetection';
import { 
  generateFormattedBracketNotation, 
  extractFormattedVelocityPattern,
  generateStrudelCode 
} from './bracketNotation';
import { KeySignature } from './musicTheory';

/**
 * Normalize pattern notes to start at time 0
 */
function normalizePatternTiming(notes: Note[]): Note[] {
  if (notes.length === 0) return [];
  
  const minStart = Math.min(...notes.map(n => n.start));
  
  return notes.map(note => ({
    ...note,
    start: note.start - minStart,
    release: note.release - minStart
  }));
}

export interface ArrangeSequenceItem {
  repetitions: number;
  content: string; // Either pattern name or "rest"
}

export interface PatternPhrase {
  name: string;
  bracketNotation: string;
  velocityPattern?: string;
  notes: Note[];
}

export interface PatternizedCodeOptions {
  keySignature?: KeySignature;
  useScaleMode?: boolean;
  includeVelocity?: boolean;
  lineLength?: number;
  sound?: string;
}

/**
 * Main function to generate patternized Strudel code using arrange() syntax
 */
export function generatePatternizedCode(
  patterns: DetectedPattern[],
  allNotes: Note[],
  options: PatternizedCodeOptions = {}
): string {
  const {
    keySignature,
    useScaleMode = false,
    includeVelocity = false,
    lineLength = 8,
    sound = "triangle"
  } = options;

  if (patterns.length === 0) {
    // Fallback to regular notation if no patterns found
    const notation = generateFormattedBracketNotation(allNotes, lineLength, keySignature, useScaleMode);
    return generateStrudelCode(notation, keySignature, useScaleMode, sound);
  }

  // Create pattern phrases
  const phrases = createPatternPhrases(patterns, keySignature, useScaleMode, includeVelocity, lineLength);
  
  // Build the arrange sequence
  const arrangeSequence = buildArrangeSequence(patterns, allNotes);
  
  // Generate the final code
  return formatPatternizedCode(phrases, arrangeSequence, sound, includeVelocity);
}

/**
 * Convert detected patterns to named pattern phrases
 */
export function createPatternPhrases(
  patterns: DetectedPattern[],
  keySignature?: KeySignature,
  useScaleMode: boolean = false,
  includeVelocity: boolean = false,
  lineLength: number = 8
): PatternPhrase[] {
  console.log('Creating pattern phrases for', patterns.length, 'patterns');
  
  return patterns.map((pattern, index) => {
    const phraseName = generatePhraseName(pattern, index);
    console.log(`Pattern ${index}: ${phraseName} with ${pattern.notes.length} notes`);
    console.log('Pattern notes:', pattern.notes.map(n => `${n.name}@${n.start}-${n.release}`));
    
    // Normalize pattern notes to start at time 0 for proper bracket notation
    const normalizedNotes = normalizePatternTiming(pattern.notes);
    
    // Generate bracket notation for this pattern
    const bracketNotation = generateFormattedBracketNotation(
      normalizedNotes, 
      lineLength, 
      keySignature, 
      useScaleMode
    );
    
    console.log(`Generated bracket notation for ${phraseName}:`, bracketNotation);

    // Generate velocity pattern if requested
    let velocityPattern: string | undefined;
    if (includeVelocity) {
      velocityPattern = extractFormattedVelocityPattern(
        normalizedNotes, 
        lineLength, 
        keySignature, 
        useScaleMode
      );
    }

    return {
      name: phraseName,
      bracketNotation,
      velocityPattern,
      notes: pattern.notes
    };
  });
}

/**
 * Generate a meaningful name for a pattern phrase
 */
function generatePhraseName(pattern: DetectedPattern, index: number): string {
  // Try to infer the type of pattern based on note characteristics
  const notes = pattern.notes;
  if (notes.length === 0) return `phrase${index + 1}`;

  // First check if it's actually drums (has drum token names)
  const isDrumPattern = notes.some(note => 
    /^(bd|sd|hh|sh|rd|cr|tom|kick|snare|hat|ride|crash)/i.test(note.name)
  );

  if (isDrumPattern) {
    return `drumPhrase${index + 1}`;
  }
  
  // For non-drum patterns, check pitch range using midiNumber if available
  let avgPitch = 60; // Default to middle C
  if (notes[0].midiNumber) {
    avgPitch = notes.reduce((sum, note) => sum + (note.midiNumber || 60), 0) / notes.length;
  } else {
    // Fall back to parsing note names
    avgPitch = notes.reduce((sum, note) => {
      const match = note.name.match(/([A-G]#?)(\d+)/);
      if (match) {
        const pitchClass = match[1];
        const octave = parseInt(match[2]);
        const pitchClasses: { [key: string]: number } = {
          'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
          'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
        };
        return sum + (octave * 12) + (pitchClasses[pitchClass] || 0);
      }
      return sum + 60; // Default if parse fails
    }, 0) / notes.length;
  }

  if (avgPitch < 48) { // Below C3
    return `bassPhrase${index + 1}`;
  } else if (avgPitch >= 72) { // C5 and above
    return `treblePhrase${index + 1}`;
  } else {
    return `pianoPhrase${index + 1}`; // Middle range
  }
}

/**
 * Build the arrange sequence from detected patterns
 */
export function buildArrangeSequence(
  patterns: DetectedPattern[],
  allNotes: Note[]
): ArrangeSequenceItem[] {
  if (patterns.length === 0) return [];

  // Get the total timeline
  const startTime = Math.min(...allNotes.map(n => n.start));
  const endTime = Math.max(...allNotes.map(n => n.release));
  
  // Create a timeline of pattern occurrences
  const timeline: Array<{ time: number; patternId: string; isStart: boolean }> = [];
  
  patterns.forEach(pattern => {
    pattern.instances.forEach(instance => {
      timeline.push({ time: instance.startTime, patternId: pattern.id, isStart: true });
      timeline.push({ time: instance.endTime, patternId: pattern.id, isStart: false });
    });
  });
  
  // Sort timeline by time
  timeline.sort((a, b) => a.time - b.time || (a.isStart ? -1 : 1));
  
  // Build arrange sequence by analyzing the timeline
  const sequence: ArrangeSequenceItem[] = [];
  let currentTime = startTime;
  const activePatterns = new Set<string>();
  
  for (const event of timeline) {
    // Add rest if there's a gap
    if (event.time > currentTime) {
      const restDuration = event.time - currentTime;
      const restCycles = Math.round(restDuration * 4) / 4; // Round to quarter cycles
      if (restCycles > 0) {
        sequence.push({ repetitions: restCycles, content: "rest" });
      }
    }
    
    if (event.isStart) {
      activePatterns.add(event.patternId);
    } else {
      activePatterns.delete(event.patternId);
    }
    
    currentTime = event.time;
  }
  
  // Simplify the sequence by counting repetitions of patterns
  return simplifyArrangeSequence(patterns, sequence);
}

/**
 * Simplify arrange sequence by counting consecutive pattern repetitions
 */
function simplifyArrangeSequence(
  patterns: DetectedPattern[],
  rawSequence: ArrangeSequenceItem[]
): ArrangeSequenceItem[] {
  // For now, use a simplified approach: just count how many times each pattern appears
  const patternCounts = new Map<string, number>();
  
  patterns.forEach(pattern => {
    patternCounts.set(pattern.id, pattern.repetitions);
  });
  
  const sequence: ArrangeSequenceItem[] = [];
  
  // Add rests at the beginning if needed
  const hasRests = patterns.some(p => p.instances[0]?.startTime > 0);
  if (hasRests) {
    sequence.push({ repetitions: 2, content: "rest" });
  }
  
  // Add patterns in order of their first appearance
  patterns.sort((a, b) => {
    const aFirstTime = Math.min(...a.instances.map(i => i.startTime));
    const bFirstTime = Math.min(...b.instances.map(i => i.startTime));
    return aFirstTime - bFirstTime;
  });
  
  patterns.forEach(pattern => {
    const repetitions = patternCounts.get(pattern.id) || 1;
    const phraseName = generatePhraseName(pattern, patterns.indexOf(pattern));
    sequence.push({ repetitions, content: phraseName });
  });
  
  return sequence;
}

/**
 * Format a single pattern phrase with proper bracket notation
 */
export function formatPatternPhrase(phrase: PatternPhrase): string {
  if (!phrase.bracketNotation || !phrase.bracketNotation.trim()) {
    return "<~>";
  }
  
  // Keep everything on a single line - no newlines
  const lines = phrase.bracketNotation.split('\n');
  const singleLine = lines.map(line => line.trim()).filter(line => line).join(' ');
  
  // If it doesn't already have brackets, add them
  if (!singleLine.startsWith('<')) {
    return `<${singleLine}>`;
  }
  return singleLine;
}

/**
 * Format the complete patternized code using objects approach
 */
function formatPatternizedCode(
  phrases: PatternPhrase[],
  arrangeSequence: ArrangeSequenceItem[],
  sound: string,
  includeVelocity: boolean
): string {
  const lines: string[] = [];
  
  // Add rest constant
  lines.push('const rest = "~";');
  lines.push('');
  
  // Group phrases by type (piano, drum, bass, treble)
  const phraseGroups: { [key: string]: PatternPhrase[] } = {};
  phrases.forEach(phrase => {
    const type = phrase.name.replace(/[0-9]+$/, '').replace('Phrase', '');
    if (!phraseGroups[type]) {
      phraseGroups[type] = [];
    }
    phraseGroups[type].push(phrase);
  });
  
  // Create pattern objects grouped by type
  Object.entries(phraseGroups).forEach(([type, typePhrases]) => {
    lines.push(`const ${type} = {`);
    typePhrases.forEach((phrase, index) => {
      const formattedPhrase = formatPatternPhrase(phrase);
      const phraseNum = phrase.name.match(/\d+$/)?.[0] || (index + 1);
      const comma = index < typePhrases.length - 1 ? ',' : '';
      // Escape any double quotes in the pattern
      const escaped = formattedPhrase.replace(/"/g, '\\"');
      lines.push(`  phrase${phraseNum}: "${escaped}"${comma}`);
    });
    lines.push('};');
    lines.push('');
  });
  
  // Build arrange sequence array
  const arrangeItems: string[] = [];
  arrangeSequence.forEach(item => {
    if (item.content === "rest") {
      arrangeItems.push(`  [${item.repetitions}, rest]`);
    } else {
      // Convert phraseName to object reference (e.g., pianoPhrase1 -> piano.phrase1)
      const match = item.content.match(/^(\w+?)Phrase(\d+)$/);
      if (match) {
        const [, type, num] = match;
        arrangeItems.push(`  [${item.repetitions}, ${type}.phrase${num}]`);
      } else {
        // Fallback for unexpected naming
        arrangeItems.push(`  [${item.repetitions}, ${item.content}]`);
      }
    }
  });
  
  // Build the final arrange() call
  let arrangeCall = `arrange(\n${arrangeItems.join(',\n')}\n)`;
  
  // Add note() and sound() methods
  if (sound === "piano") {
    arrangeCall += `.note().sound("piano")`;
  } else if (sound === "triangle") {
    arrangeCall += `.note().sound("triangle")`;
  } else {
    arrangeCall += `.note().sound("${sound}")`;
  }
  
  // Add velocity if enabled and we have velocity patterns
  if (includeVelocity) {
    const hasVelocityPatterns = phrases.some(p => p.velocityPattern && p.velocityPattern.trim());
    if (hasVelocityPatterns) {
      const firstVelocityPattern = phrases.find(p => p.velocityPattern && p.velocityPattern.trim());
      if (firstVelocityPattern) {
        const velocityFormatted = firstVelocityPattern.velocityPattern.replace(/"/g, '\\"');
        arrangeCall += `.velocity("<${velocityFormatted}>")`;
      }
    }
  }
  
  lines.push(arrangeCall);
  
  return lines.join('\n');
}

/**
 * Generate multi-stream pattern code for different instruments
 */
export function generateMultiStreamPatternCode(
  trackPatterns: Map<number, DetectedPattern[]>,
  trackNotes: Map<number, Note[]>,
  trackInfo: Array<{ name?: string; instrument?: string; isPercussion?: boolean }>,
  options: PatternizedCodeOptions = {}
): string {
  const lines: string[] = [];
  
  // Add rest constant
  lines.push('const rest = "~";');
  lines.push('');
  
  // Collect all pattern objects by type across all tracks
  const globalPatternObjects: { [type: string]: { [phraseKey: string]: string } } = {};
  const arrangeCallsPerTrack: { trackId: number; type: string; instrument?: string; call: string }[] = [];
  const patternIndex: { [type: string]: { [trackId: number]: string[] } } = {};
  
  trackPatterns.forEach((patterns, trackId) => {
    const track = trackInfo[trackId];
    const notes = trackNotes.get(trackId) || [];
    
    if (patterns.length === 0 || notes.length === 0) return;
    
    // Determine sound for this track - use actual instrument if provided in options
    let sound = options.sound || "triangle";
    const useInstrumentSamples = !options.sound || options.sound === undefined;
    
    if (track?.isPercussion) {
      // Percussion tracks should be handled differently
      sound = "drums"; // Special marker for drum handling
    } else if (useInstrumentSamples && track?.instrument) {
      // Use the actual instrument name for sample mapping
      sound = track.instrument;
    }
    
    // Generate code for this track
    const trackCode = generatePatternizedCode(patterns, notes, {
      ...options,
      sound
    });
    
    // Parse the generated code to extract patterns and arrange call
    const codeLines = trackCode.split('\n');
    let currentType = '';
    let arrangeCall = '';
    
    codeLines.forEach(line => {
      if (line.startsWith('const ') && line.includes(' = {')) {
        // Extract pattern type (e.g., piano, drum, bass, treble)
        const match = line.match(/const (\w+) = \{/);
        if (match) {
          currentType = match[1];
          if (!globalPatternObjects[currentType]) {
            globalPatternObjects[currentType] = {};
          }
        }
      } else if (line.includes('phrase') && line.includes(':') && currentType) {
        // Extract phrase definition
        const match = line.match(/phrase(\d+): "(.+?)"/);
        if (match) {
          const [, num, pattern] = match;
          // Add track suffix to make phrase unique if needed
          const phraseKey = `phrase${num}_track${trackId}`;
          globalPatternObjects[currentType][phraseKey] = pattern;
          // Track index per type/track
          if (!patternIndex[currentType]) patternIndex[currentType] = {} as { [trackId: number]: string[] };
          if (!patternIndex[currentType][trackId]) patternIndex[currentType][trackId] = [];
          patternIndex[currentType][trackId].push(phraseKey);
        }
      } else if (line.trim().startsWith('arrange(')) {
        // Store the FULL arrange call (must capture the entire thing, not just first line)
        const startIdx = codeLines.indexOf(line);
        let endIdx = startIdx;
        let parenCount = 1;
        let fullCall = line;
        
        // Find the end of the arrange call
        for (let i = startIdx + 1; i < codeLines.length && parenCount > 0; i++) {
          const nextLine = codeLines[i];
          fullCall += '\n' + nextLine;
          for (const char of nextLine) {
            if (char === '(') parenCount++;
            else if (char === ')') parenCount--;
          }
          if (parenCount === 0) {
            endIdx = i;
            break;
          }
        }
        
        // Replace phrase references with track-specific ones
        arrangeCall = fullCall.replace(
          /(\w+)\.phrase(\d+)/g, 
          `$1.phrase$2_track${trackId}`
        );
        
        // Derive type from object reference in the arrange call (first match)
        const m = fullCall.match(/(\w+)\.phrase\d+/);
        const derivedType = m ? m[1] : track?.isPercussion ? 'drum' : sound === 'bd' ? 'drum' : /bass/.test(sound) ? 'bass' : /piano|triangle/.test(sound) ? 'piano' : 'treble';
        arrangeCallsPerTrack.push({ trackId, type: derivedType, instrument: track?.instrument, call: arrangeCall });
        
        // Skip past the lines we've already processed
        line = codeLines[endIdx] || line;
      }
    });
  });
  
  // Emit an index showing which phrases belong to which track/instrument
  const indexLines: string[] = [];
  Object.entries(patternIndex).forEach(([type, byTrack]) => {
    Object.entries(byTrack).forEach(([tId, phraseKeys]) => {
      indexLines.push(`// ${type} track ${tId}: ${phraseKeys.join(', ')}`);
    });
  });
  if (indexLines.length) {
    lines.push('// Pattern index by type and track');
    lines.push(...indexLines);
    lines.push('');
  }

  // Generate consolidated pattern objects
  Object.entries(globalPatternObjects).forEach(([type, phrases]) => {
    if (Object.keys(phrases).length > 0) {
      lines.push(`const ${type} = {`);
      const phraseEntries = Object.entries(phrases);
      phraseEntries.forEach(([key, pattern], index) => {
        const comma = index < phraseEntries.length - 1 ? ',' : '';
        lines.push(`  ${key}: "${pattern}"${comma}`);
      });
      lines.push('};');
      lines.push('');
    }
  });
  
  // Add all arrange calls with helpful comments
  arrangeCallsPerTrack.forEach(({ trackId, type, instrument, call }) => {
    lines.push(`// Track ${trackId}${instrument ? ` • ${instrument}` : ''} • type: ${type}`);
    lines.push(call);
    lines.push('');
  });
  
  return lines.join('\n');
}

/**
 * Validate that the generated arrange code is syntactically correct
 */
export function validatePatternizedCode(code: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check for basic syntax requirements
  if (!code.includes('arrange(')) {
    errors.push('Missing arrange() function call');
  }
  
  if (!code.includes('const rest = "~"')) {
    errors.push('Missing rest constant definition');
  }
  
  // Check that all pattern references in arrange() are defined
  const arrangeMatch = code.match(/arrange\(\s*([\s\S]*?)\s*\)/);
  if (arrangeMatch) {
    const arrangeContent = arrangeMatch[1];
    const patternRefs = arrangeContent.match(/(\w+Phrase\d+)/g) || [];
    
    patternRefs.forEach(ref => {
      if (!code.includes(`const ${ref} =`)) {
        errors.push(`Pattern ${ref} referenced in arrange() but not defined`);
      }
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
