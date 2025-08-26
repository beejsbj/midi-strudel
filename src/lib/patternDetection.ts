import { Note } from '@/types/music';
import { midiToDrumToken } from './drumMapping';

export interface PatternInstance {
  patternId: string;
  startTime: number;
  endTime: number;
  notes: Note[];
}

export interface DetectedPattern {
  id: string;
  notes: Note[];
  instances: PatternInstance[];
  repetitions: number;
  duration: number;
  similarity: number; // 0-1, how consistent the repetitions are
  coverage: number; // 0-1, what percentage of total music time this pattern covers
  occurrences?: Array<{ startTime: number; endTime: number }>; // Track when pattern occurs
}

export interface PatternDetectionOptions {
  minLength: number; // Minimum number of notes in a pattern
  minRepetitions: number; // Minimum number of repetitions to consider a pattern
  similarityThreshold: number; // 0-1, how similar repetitions must be
  timingTolerance: number; // Tolerance for timing variations in cycles
  velocityTolerance: number; // Tolerance for velocity variations (0-1)
  allowOverlapping: boolean; // Whether patterns can overlap in time
}

const DEFAULT_OPTIONS: PatternDetectionOptions = {
  minLength: 2,
  minRepetitions: 2,
  similarityThreshold: 0.6, // Lowered from 0.8 to be less strict
  timingTolerance: 0.15, // Increased to 15% to allow more timing variation
  velocityTolerance: 0.2, // Increased to 20% velocity difference
  allowOverlapping: true,
};

/**
 * Main pattern detection function
 * Finds repeating note sequences in the given notes
 */
export function detectPatterns(
  notes: Note[],
  options: Partial<PatternDetectionOptions> = {}
): DetectedPattern[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  if (notes.length < opts.minLength * opts.minRepetitions) {
    return [];
  }

  // Sort notes by start time
  const sortedNotes = [...notes].sort((a, b) => a.start - b.start);
  
  // Find all possible patterns using sliding window
  const candidatePatterns = findRepeatingSequences(sortedNotes, opts);
  
  // Filter patterns that meet repetition and similarity requirements
  const validPatterns = candidatePatterns.filter(pattern => 
    pattern.repetitions >= opts.minRepetitions &&
    pattern.similarity >= opts.similarityThreshold
  );

  // Merge overlapping or very similar patterns
  const mergedPatterns = mergeOverlappingPatterns(validPatterns, opts);
  
  // Calculate coverage statistics
  const totalDuration = sortedNotes.length > 0 
    ? Math.max(...sortedNotes.map(n => n.release)) - Math.min(...sortedNotes.map(n => n.start))
    : 0;
    
  return mergedPatterns.map(pattern => ({
    ...pattern,
    coverage: totalDuration > 0 ? (pattern.duration * pattern.repetitions) / totalDuration : 0,
    occurrences: pattern.instances.map(inst => ({
      startTime: inst.startTime,
      endTime: inst.endTime
    }))
  }));
}

/**
 * Find repeating note sequences using motif-based approach
 */
function findRepeatingSequences(
  sortedNotes: Note[],
  options: PatternDetectionOptions
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const usedNoteIndices = new Set<number>();
  const foundMotifs = new Map<string, DetectedPattern>(); // Track found motifs by signature

  // Start with smaller patterns (motifs) and work up
  for (let length = options.minLength; length <= Math.min(sortedNotes.length / options.minRepetitions, 16); length++) {
    // Try each possible starting position
    for (let start = 0; start <= sortedNotes.length - length; start++) {
      // Skip if this position is already covered by a found pattern
      if (!options.allowOverlapping && usedNoteIndices.has(start)) {
        continue;
      }

      const candidatePattern = sortedNotes.slice(start, start + length);
      const signature = getPatternSignature(candidatePattern);
      
      // Skip if we've already found this motif
      if (foundMotifs.has(signature)) {
        continue;
      }
      
      const instances = findPatternInstances(candidatePattern, sortedNotes, start, options);
      
      if (instances.length >= options.minRepetitions) {
        const patternId = `pattern_${patterns.length + 1}`;
        const pattern = createPatternFromInstances(patternId, candidatePattern, instances);
        
        if (pattern.similarity >= options.similarityThreshold) {
          // Check if this pattern is a subset/superset of existing patterns
          let shouldAdd = true;
          const patternsToRemove: string[] = [];
          
          for (const existing of patterns) {
            const relation = comparePatterns(pattern, existing);
            if (relation === 'subset') {
              // This pattern is contained in an existing one, skip it
              shouldAdd = false;
              break;
            } else if (relation === 'superset') {
              // This pattern contains an existing one, remove the smaller one
              patternsToRemove.push(existing.id);
            } else if (relation === 'overlap' && pattern.notes.length === existing.notes.length) {
              // Same length patterns that overlap significantly - keep the one with better coverage
              if (pattern.coverage <= existing.coverage) {
                shouldAdd = false;
                break;
              } else {
                patternsToRemove.push(existing.id);
              }
            }
          }
          
          if (shouldAdd) {
            // Remove subsumed patterns
            patternsToRemove.forEach(id => {
              const idx = patterns.findIndex(p => p.id === id);
              if (idx >= 0) patterns.splice(idx, 1);
            });
            
            patterns.push(pattern);
            foundMotifs.set(signature, pattern);
            
            // Mark notes as used if not allowing overlaps
            if (!options.allowOverlapping) {
              instances.forEach(instance => {
                const startIndex = sortedNotes.findIndex(n => n.start === instance.startTime);
                for (let i = startIndex; i < startIndex + length && i < sortedNotes.length; i++) {
                  usedNoteIndices.add(i);
                }
              });
            }
          }
        }
      }
    }
  }

  // Sort by quality: prefer patterns with more repetitions and better coverage
  return patterns.sort((a, b) => {
    // Prefer shorter patterns that repeat more (true motifs)
    const aScore = a.repetitions / Math.sqrt(a.notes.length);
    const bScore = b.repetitions / Math.sqrt(b.notes.length);
    return bScore - aScore || b.coverage - a.coverage;
  });
}

/**
 * Find all instances of a pattern in the note sequence
 */
function findPatternInstances(
  patternNotes: Note[],
  allNotes: Note[],
  skipBefore: number,
  options: PatternDetectionOptions
): PatternInstance[] {
  const instances: PatternInstance[] = [];
  const patternDuration = patternNotes[patternNotes.length - 1].release - patternNotes[0].start;

  for (let i = skipBefore; i <= allNotes.length - patternNotes.length; i++) {
    const candidateNotes = allNotes.slice(i, i + patternNotes.length);
    const similarity = calculatePatternSimilarity(patternNotes, candidateNotes, options);
    
    if (similarity >= options.similarityThreshold) {
      instances.push({
        patternId: '',
        startTime: candidateNotes[0].start,
        endTime: candidateNotes[candidateNotes.length - 1].release,
        notes: candidateNotes
      });
      
      // Skip ahead to avoid finding overlapping instances of the same pattern
      i += Math.floor(patternNotes.length * 0.75) - 1;
    }
  }

  return instances;
}

/**
 * Calculate similarity between two note sequences
 */
export function calculatePatternSimilarity(
  pattern1: Note[],
  pattern2: Note[],
  options: PatternDetectionOptions
): number {
  if (pattern1.length !== pattern2.length) {
    return 0;
  }

  let matches = 0;
  const totalComparisons = pattern1.length;

  for (let i = 0; i < pattern1.length; i++) {
    const note1 = pattern1[i];
    const note2 = pattern2[i];
    
    // Compare relative timing (normalized to pattern start)
    const relTime1 = i === 0 ? 0 : note1.start - pattern1[0].start;
    const relTime2 = i === 0 ? 0 : note2.start - pattern2[0].start;
    const timingMatch = Math.abs(relTime1 - relTime2) <= options.timingTolerance;
    
    // Compare duration
    const dur1 = note1.release - note1.start;
    const dur2 = note2.release - note2.start;
    const durationMatch = Math.abs(dur1 - dur2) <= options.timingTolerance;
    
    // Compare pitch (note names)
    const pitchMatch = note1.name === note2.name;
    
    // Compare velocity if available
    let velocityMatch = true;
    if (note1.velocity !== undefined && note2.velocity !== undefined) {
      velocityMatch = Math.abs(note1.velocity - note2.velocity) <= options.velocityTolerance;
    }
    
    // A note matches if pitch matches and either timing or duration is close
    if (pitchMatch && (timingMatch || durationMatch) && velocityMatch) {
      matches++;
    }
  }

  return matches / totalComparisons;
}

/**
 * Create a pattern object from instances
 */
function createPatternFromInstances(
  id: string,
  templateNotes: Note[],
  instances: PatternInstance[]
): DetectedPattern {
  const duration = templateNotes[templateNotes.length - 1].release - templateNotes[0].start;
  
  // Calculate average similarity across all instances
  const similarities = instances.map(instance => 
    calculatePatternSimilarity(templateNotes, instance.notes, DEFAULT_OPTIONS)
  );
  const avgSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;

  return {
    id,
    notes: templateNotes,
    instances: instances.map(instance => ({ ...instance, patternId: id })),
    repetitions: instances.length,
    duration,
    similarity: avgSimilarity,
    coverage: 0 // Will be calculated later
  };
}

/**
 * Merge overlapping or very similar patterns
 */
function mergeOverlappingPatterns(
  patterns: DetectedPattern[],
  options: PatternDetectionOptions
): DetectedPattern[] {
  if (patterns.length <= 1) return patterns;

  const merged: DetectedPattern[] = [];
  const processed = new Set<string>();

  for (const pattern of patterns) {
    if (processed.has(pattern.id)) continue;

    let mergedPattern = pattern;
    processed.add(pattern.id);

    // Look for patterns to merge with this one
    for (const other of patterns) {
      if (processed.has(other.id) || other.id === pattern.id) continue;

      // Check if patterns are similar enough to merge
      const similarity = calculatePatternSimilarity(pattern.notes, other.notes, options);
      
      if (similarity >= options.similarityThreshold * 0.9) {
        // Merge the patterns - keep the one with more repetitions
        if (other.repetitions > mergedPattern.repetitions) {
          mergedPattern = {
            ...other,
            id: pattern.id, // Keep original ID
            instances: [...mergedPattern.instances, ...other.instances]
          };
        } else {
          mergedPattern = {
            ...mergedPattern,
            instances: [...mergedPattern.instances, ...other.instances]
          };
        }
        processed.add(other.id);
      }
    }

    // Update repetition count after merging
    mergedPattern.repetitions = mergedPattern.instances.length;
    merged.push(mergedPattern);
  }

  return merged.sort((a, b) => b.repetitions - a.repetitions || b.coverage - a.coverage);
}

/**
 * Detect patterns across multiple tracks simultaneously
 */
export function detectMultiTrackPatterns(
  trackNotes: Map<number, Note[]>,
  trackInfo: Array<{ name?: string; instrument?: string; isPercussion?: boolean }>,
  options: Partial<PatternDetectionOptions> = {}
): Map<number, DetectedPattern[]> {
  const trackPatterns = new Map<number, DetectedPattern[]>();
  
  // Process each track individually first
  trackNotes.forEach((notes, trackId) => {
    if (notes.length === 0) return;
    
    const track = trackInfo[trackId];
    let patterns: DetectedPattern[];
    
    if (track?.isPercussion) {
      // Use specialized drum pattern detection
      patterns = detectDrumPatterns(notes, options);
    } else {
      // Use regular pattern detection
      patterns = detectPatterns(notes, options);
    }
    
    trackPatterns.set(trackId, patterns);
  });
  
  // TODO: Implement cross-track pattern alignment
  // This could find patterns that occur simultaneously across tracks
  
  return trackPatterns;
}

/**
 * Specialized pattern detection for percussion tracks
 */
export function detectDrumPatterns(
  notes: Note[],
  options: Partial<PatternDetectionOptions> = {}
): DetectedPattern[] {
  // Convert notes to use drum tokens instead of note names
  const drumNotes = notes.map(note => ({
    ...note,
    name: note.midiNumber ? midiToDrumToken(note.midiNumber) : note.name
  }));
  
  // Use modified options for drum patterns
  const drumOptions: PatternDetectionOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    minLength: Math.max(1, options.minLength || 1), // Drums can have single-hit patterns
    similarityThreshold: options.similarityThreshold || 0.9, // Be more strict with drum pattern matching
    timingTolerance: options.timingTolerance || 0.03, // Tighter timing for drums
  };
  
  return detectPatterns(drumNotes, drumOptions);
}

/**
 * Generate a signature for a pattern to detect duplicates
 */
function getPatternSignature(notes: Note[]): string {
  // Create a signature based on relative intervals and durations
  if (notes.length === 0) return '';
  
  const intervals: number[] = [];
  const durations: number[] = [];
  
  for (let i = 0; i < notes.length; i++) {
    durations.push(Math.round((notes[i].release - notes[i].start) * 100));
    if (i > 0) {
      // Relative interval from previous note
      const prevMidi = notes[i-1].midiNumber || 60;
      const currMidi = notes[i].midiNumber || 60;
      intervals.push(currMidi - prevMidi);
    }
  }
  
  return `${intervals.join(',')}_${durations.join(',')}`;
}

/**
 * Compare two patterns to determine their relationship
 */
function comparePatterns(p1: DetectedPattern, p2: DetectedPattern): 'subset' | 'superset' | 'overlap' | 'different' {
  const sig1 = getPatternSignature(p1.notes);
  const sig2 = getPatternSignature(p2.notes);
  
  // Check if one is contained in the other
  if (sig1.includes(sig2)) return 'superset';
  if (sig2.includes(sig1)) return 'subset';
  
  // Check for significant overlap (shifted versions)
  const notes1 = p1.notes.map(n => n.name).join(' ');
  const notes2 = p2.notes.map(n => n.name).join(' ');
  
  // If they share >70% of their content, consider them overlapping
  const minLength = Math.min(notes1.length, notes2.length);
  const maxOverlap = Math.max(
    notes1.includes(notes2.substring(0, Math.floor(minLength * 0.7))) ? 0.7 : 0,
    notes2.includes(notes1.substring(0, Math.floor(minLength * 0.7))) ? 0.7 : 0
  );
  
  if (maxOverlap >= 0.7) return 'overlap';
  return 'different';
}

/**
 * Find patterns that occur at the same time across different tracks
 */
export function alignCrossTrackPatterns(
  trackPatterns: Map<number, DetectedPattern[]>,
  timingTolerance: number = 0.1
): Array<{
  tracks: number[];
  patterns: DetectedPattern[];
  startTime: number;
  endTime: number;
}> {
  const alignedPatterns: Array<{
    tracks: number[];
    patterns: DetectedPattern[];
    startTime: number;
    endTime: number;
  }> = [];
  
  // Get all pattern instances with their timing
  const allInstances: Array<{
    trackId: number;
    pattern: DetectedPattern;
    instance: PatternInstance;
  }> = [];
  
  trackPatterns.forEach((patterns, trackId) => {
    patterns.forEach(pattern => {
      pattern.instances.forEach(instance => {
        allInstances.push({ trackId, pattern, instance });
      });
    });
  });
  
  // Sort by start time
  allInstances.sort((a, b) => a.instance.startTime - b.instance.startTime);
  
  // Group instances that occur at approximately the same time
  const timeGroups: Array<typeof allInstances> = [];
  let currentGroup: typeof allInstances = [];
  let currentTime = -Infinity;
  
  for (const item of allInstances) {
    if (item.instance.startTime - currentTime > timingTolerance) {
      if (currentGroup.length > 0) {
        timeGroups.push(currentGroup);
      }
      currentGroup = [item];
      currentTime = item.instance.startTime;
    } else {
      currentGroup.push(item);
    }
  }
  
  if (currentGroup.length > 0) {
    timeGroups.push(currentGroup);
  }
  
  // Convert groups with multiple tracks to aligned patterns
  timeGroups.forEach(group => {
    const uniqueTracks = new Set(group.map(item => item.trackId));
    if (uniqueTracks.size > 1) {
      const tracks = Array.from(uniqueTracks);
      const patterns = group.map(item => item.pattern);
      const startTime = Math.min(...group.map(item => item.instance.startTime));
      const endTime = Math.max(...group.map(item => item.instance.endTime));
      
      alignedPatterns.push({
        tracks,
        patterns,
        startTime,
        endTime
      });
    }
  });
  
  return alignedPatterns;
}

/**
 * Get pattern statistics for display
 */
export function getPatternStatistics(patterns: DetectedPattern[]): {
  totalPatterns: number;
  totalRepetitions: number;
  averageSimilarity: number;
  totalCoverage: number;
} {
  if (patterns.length === 0) {
    return {
      totalPatterns: 0,
      totalRepetitions: 0,
      averageSimilarity: 0,
      totalCoverage: 0
    };
  }

  const totalRepetitions = patterns.reduce((sum, p) => sum + p.repetitions, 0);
  const averageSimilarity = patterns.reduce((sum, p) => sum + p.similarity, 0) / patterns.length;
  const totalCoverage = patterns.reduce((sum, p) => sum + p.coverage, 0);

  return {
    totalPatterns: patterns.length,
    totalRepetitions,
    averageSimilarity,
    totalCoverage: Math.min(totalCoverage, 1) // Cap at 100%
  };
}

/**
 * Get statistics for multi-track patterns
 */
export function getMultiTrackPatternStatistics(
  trackPatterns: Map<number, DetectedPattern[]>
): {
  totalTracks: number;
  totalPatterns: number;
  totalRepetitions: number;
  averageSimilarity: number;
  averageCoverage: number;
  trackStats: Map<number, ReturnType<typeof getPatternStatistics>>;
} {
  const trackStats = new Map<number, ReturnType<typeof getPatternStatistics>>();
  let totalPatterns = 0;
  let totalRepetitions = 0;
  let totalSimilarity = 0;
  let totalCoverage = 0;
  let patternCount = 0;
  
  trackPatterns.forEach((patterns, trackId) => {
    const stats = getPatternStatistics(patterns);
    trackStats.set(trackId, stats);
    
    totalPatterns += stats.totalPatterns;
    totalRepetitions += stats.totalRepetitions;
    totalSimilarity += stats.averageSimilarity * stats.totalPatterns;
    totalCoverage += stats.totalCoverage;
    patternCount += stats.totalPatterns;
  });
  
  return {
    totalTracks: trackPatterns.size,
    totalPatterns,
    totalRepetitions,
    averageSimilarity: patternCount > 0 ? totalSimilarity / patternCount : 0,
    averageCoverage: trackPatterns.size > 0 ? totalCoverage / trackPatterns.size : 0,
    trackStats
  };
}
