import { Note } from '@/types/music';
import { DetectedPattern } from './patternDetection';
import { 
  generateFormattedBracketNotation, 
  extractFormattedVelocityPattern,
  generateStrudelCode,
  generateDrumBracketNotation 
} from './bracketNotation';
import { KeySignature } from './musicTheory';
import { getDrumBank } from './drumMapping';
import { wrapInAngles } from './multiStream';

/**
 * Extended options to support instrument mapping
 */
export interface PatternizedCodeOptionsV2 {
  keySignature?: KeySignature;
  useScaleMode?: boolean;
  includeVelocity?: boolean;
  lineLength?: number;
  sound?: string;
  mapInstrumentToSample?: (name: string | undefined) => string;
  availableSamples?: string[];
}

/**
 * Generate proper multi-stream pattern code with instrument support
 */
export function generateMultiStreamPatternCodeV2(
  trackPatterns: Map<number, DetectedPattern[]>,
  trackNotes: Map<number, Note[]>,
  trackInfo: Array<{ name?: string; instrument?: string; isPercussion?: boolean }>,
  options: PatternizedCodeOptionsV2 = {},
  selectedTracks?: number[]
): string {
  const lines: string[] = [];
  const stackLines: string[] = [];
  
  // Add rest constant
  lines.push('const rest = "~";');
  lines.push('');
  
  // Process each track
  let drumTrackCount = 0;
  let stackCount = 0;
  
  trackPatterns.forEach((patterns, trackId) => {
    const track = trackInfo[trackId];
    const notes = trackNotes.get(trackId) || [];
    const isEnabled = !selectedTracks || selectedTracks.includes(trackId);
    
    if (patterns.length === 0 || notes.length === 0 || !isEnabled) return;
    
    // Generate patterns for this track
    const trackLines = generateTrackPatterns(
      trackId,
      track,
      patterns,
      notes,
      options,
      drumTrackCount
    );
    
    if (track?.isPercussion) {
      drumTrackCount++;
    }
    
    // Add track lines (pattern definitions)
    const patternLines = trackLines.filter(line => !line.startsWith('$:'));
    const strudelLine = trackLines.find(line => line.startsWith('$:'));
    
    lines.push(...patternLines);
    
    // Collect strudel lines for stacking
    if (strudelLine) {
      stackLines.push(strudelLine);
      stackCount++;
    }
    
    lines.push('');
  });
  
  // Add all the strudel pattern calls using stack
  if (stackLines.length > 0) {
    lines.push('// Stack all active tracks');
    lines.push('stack(');
    stackLines.forEach((line, index) => {
      const isLast = index === stackLines.length - 1;
      // Remove the $: prefix and add proper indentation
      const cleanLine = line.replace(/^\$:\s*/, '  ');
      lines.push(cleanLine + (isLast ? '' : ','));
    });
    lines.push(')');
  }
  
  return lines.join('\n');
}

/**
 * Generate patterns for a single track
 */
function generateTrackPatterns(
  trackId: number,
  track: { name?: string; instrument?: string; isPercussion?: boolean } | undefined,
  patterns: DetectedPattern[],
  notes: Note[],
  options: PatternizedCodeOptionsV2,
  drumTrackIndex: number
): string[] {
  const lines: string[] = [];
  
  // Normalize pattern timing
  const normalizedPatterns = patterns.map(pattern => ({
    ...pattern,
    notes: normalizePatternTiming(pattern.notes)
  }));
  
  // Generate a clean instrument name for the variable
  const getCleanInstrumentName = () => {
    if (track?.isPercussion) return 'drums';
    if (!track?.instrument) return 'unknown';
    
    const inst = track.instrument.toLowerCase();
    // Extract clean instrument name
    if (inst.includes('piano')) return 'piano';
    if (inst.includes('bass')) return 'bass';
    if (inst.includes('guitar')) return 'guitar';
    if (inst.includes('violin')) return 'violin';
    if (inst.includes('cello')) return 'cello';
    if (inst.includes('viola')) return 'viola';
    if (inst.includes('drum')) return 'drums';
    if (inst.includes('synth')) return 'synth';
    if (inst.includes('string')) return 'strings';
    if (inst.includes('brass')) return 'brass';
    if (inst.includes('flute')) return 'flute';
    if (inst.includes('sax')) return 'sax';
    if (inst.includes('trumpet')) return 'trumpet';
    if (inst.includes('organ')) return 'organ';
    if (inst.includes('pad')) return 'pad';
    if (inst.includes('lead')) return 'lead';
    if (inst.includes('choir')) return 'choir';
    if (inst.includes('harp')) return 'harp';
    if (inst.includes('bell')) return 'bells';
    
    // Fallback: clean up the instrument name
    return inst.replace(/[^a-z0-9]/gi, '').substring(0, 12) || 'inst';
  };
  
  const instrumentName = getCleanInstrumentName();
  const varName = `t${trackId}_${instrumentName}`;
  
  // Generate pattern phrases
  const phrases: string[] = [];
  normalizedPatterns.forEach((pattern, index) => {
    let notation: string;
    
    if (track?.isPercussion) {
      // Use drum notation for percussion
      notation = generateDrumBracketNotation(pattern.notes);
    } else {
      // Use regular notation for pitched instruments
      notation = generateFormattedBracketNotation(
        pattern.notes,
        options.lineLength || 8,
        options.keySignature,
        options.useScaleMode,
        false // patterns use duration mode by default
      );
    }
    
    // Format as single line
    const singleLine = notation.split('\n').map(l => l.trim()).filter(l => l).join(' ');
    phrases.push(`  p${index + 1}: "<${singleLine}>"`);
  });
  
  // Create pattern object for this track
  lines.push(`const ${varName} = {`);
  lines.push(...phrases.map((p, i) => i < phrases.length - 1 ? p + ',' : p));
  lines.push('};');
  lines.push('');
  
  // Build arrange sequence with proper timing
  const arrangeItems: string[] = [];
  
  // Sort patterns by their first occurrence
  const sortedPatterns = normalizedPatterns
    .map((pattern, index) => ({ pattern, index, occurrences: pattern.occurrences || [] }))
    .sort((a, b) => {
      const aFirst = Math.min(...a.occurrences.map(o => o.startTime));
      const bFirst = Math.min(...b.occurrences.map(o => o.startTime));
      return aFirst - bFirst;
    });
  
  // Track current position in the timeline
  let currentPosition = 0;
  
  sortedPatterns.forEach(({ pattern, index, occurrences }) => {
    if (occurrences.length === 0) {
      // Fallback if occurrences not tracked - just use repetitions
      arrangeItems.push(`  [${pattern.repetitions}, ${varName}.p${index + 1}]`);
      return;
    }
    
    // Group consecutive occurrences
    const groups: Array<{ start: number; count: number; gap?: number }> = [];
    let currentGroup: { start: number; count: number } | null = null;
    
    occurrences
      .sort((a, b) => a.startTime - b.startTime)
      .forEach((occ, i) => {
        if (currentGroup === null) {
          currentGroup = { start: occ.startTime, count: 1 };
        } else {
          const expectedNext = currentGroup.start + (currentGroup.count * pattern.duration);
          const tolerance = pattern.duration * 0.1; // 10% tolerance for timing variations
          
          if (Math.abs(occ.startTime - expectedNext) <= tolerance) {
            // Consecutive occurrence
            currentGroup.count++;
          } else {
            // Gap detected - save current group and start new one
            groups.push(currentGroup);
            currentGroup = { start: occ.startTime, count: 1 };
          }
        }
      });
    
    if (currentGroup) {
      groups.push(currentGroup);
    }
    
    // Generate arrange items with rests for gaps
    groups.forEach((group, groupIndex) => {
      // Add rest if there's a gap from current position
      if (group.start > currentPosition + 0.01) { // Small tolerance to avoid tiny rests
        const restDuration = group.start - currentPosition;
        arrangeItems.push(`  [1, "~@${restDuration.toFixed(4)}"]`);
      }
      
      // Add the pattern repetitions
      arrangeItems.push(`  [${group.count}, ${varName}.p${index + 1}]`);
      
      // Update current position
      currentPosition = group.start + (group.count * pattern.duration);
    });
  });
  
  // If we still don't have proper timing info, fall back to simple repetitions
  if (arrangeItems.length === 0) {
    normalizedPatterns.forEach((pattern, index) => {
      arrangeItems.push(`  [${pattern.repetitions}, ${varName}.p${index + 1}]`);
    });
  }
  
  // Generate the arrange call with proper sound handling
  lines.push(`// Track ${trackId} • ${track?.instrument || track?.name || 'Unknown'}${track?.isPercussion ? ' (Percussion)' : ''}`);
  
  let strudelCall = `$: arrange(\n${arrangeItems.map(item => '  ' + item).join(',\n')}\n  )`;
  
  if (track?.isPercussion) {
    // Use s() for drums - chain after arrange
    const drumBank = getDrumBank(track.name || track.instrument || '', drumTrackIndex);
    strudelCall += '.s()';
    if (drumBank) {
      strudelCall += `.bank("${drumBank}")`;
    }
  } else {
    // Use note() for pitched instruments
    strudelCall += '.note()';
    
    // Map instrument to sample
    let sample = 'triangle';
    if (options.mapInstrumentToSample && track?.instrument) {
      sample = options.mapInstrumentToSample(track.instrument);
    } else if (track?.instrument) {
      // Basic fallback mapping
      const inst = track.instrument.toLowerCase();
      if (inst.includes('piano')) sample = 'piano';
      else if (inst.includes('bass')) sample = 'bass';
      else if (inst.includes('guitar')) sample = 'guitar';
      else if (inst.includes('violin')) sample = 'gm_violin';
      else if (inst.includes('cello')) sample = 'gm_cello';
    }
    
    strudelCall += `.sound("${sample}")`;
  }
  
  // Add velocity if enabled
  if (options.includeVelocity) {
    const velocityPattern = extractFormattedVelocityPattern(
      notes,
      options.lineLength || 8,
      track?.isPercussion ? undefined : options.keySignature,
      !track?.isPercussion && options.useScaleMode
    );
    if (velocityPattern && velocityPattern.trim()) {
      strudelCall += `.velocity("<${velocityPattern}>")`;
    }
  }
  
  lines.push(strudelCall);
  
  return lines;
}

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
