import { Track, KeySignature } from '../types';

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const PITCH_CLASSES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export const detectKey = (tracks: Track[]): KeySignature => {
  // 1. Build Chroma Vector (duration based)
  const chroma = new Array(12).fill(0);
  let totalDuration = 0;

  tracks.forEach(track => {
    if (track.isDrum) return; // Skip drums
    track.notes.forEach(note => {
      const pc = note.midi % 12;
      const duration = note.noteOff - note.noteOn;
      chroma[pc] += duration;
      totalDuration += duration;
    });
  });

  if (totalDuration === 0) {
    return { root: 'C', type: 'major', confidence: 0, averageOctave: 4 };
  }

  // Correlation function (Pearson)
  const correlation = (x: number[], y: number[]) => {
      const n = x.length;
      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = y.reduce((a, b) => a + b, 0);
      const meanX = sumX / n;
      const meanY = sumY / n;
      
      let num = 0;
      let den1 = 0;
      let den2 = 0;
      
      for(let i=0; i<n; i++) {
          const dx = x[i] - meanX;
          const dy = y[i] - meanY;
          num += dx * dy;
          den1 += dx * dx;
          den2 += dy * dy;
      }
      
      if (den1 === 0 || den2 === 0) return 0;
      return num / Math.sqrt(den1 * den2);
  }

  let bestKey = { root: 0, type: 'major' as 'major'|'minor', score: -2 };
  
  // Test all 12 roots for Major
  for(let i=0; i<12; i++) {
      // Shift chroma so that 'i' is at index 0
      const rotatedChroma = [...chroma.slice(i), ...chroma.slice(0, i)];
      const r = correlation(rotatedChroma, MAJOR_PROFILE);
      if (r > bestKey.score) bestKey = { root: i, type: 'major', score: r };
  }
  
  // Test all 12 roots for Minor
  for(let i=0; i<12; i++) {
      const rotatedChroma = [...chroma.slice(i), ...chroma.slice(0, i)];
      const r = correlation(rotatedChroma, MINOR_PROFILE);
      if (r > bestKey.score) bestKey = { root: i, type: 'minor', score: r };
  }

  // Calculate Root Octave (Weighted Average)
  let octaveSum = 0;
  let octaveCount = 0;
  tracks.forEach(track => {
    if (track.isDrum) return;
    track.notes.forEach(note => {
      if (note.midi % 12 === bestKey.root) {
        octaveSum += Math.floor(note.midi / 12);
        octaveCount++;
      }
    });
  });

  const avgOctave = octaveCount > 0 ? Math.round(octaveSum / octaveCount) : 4;

  return {
      root: PITCH_CLASSES[bestKey.root],
      type: bestKey.type,
      confidence: Math.max(0, Math.round(bestKey.score * 100)),
      averageOctave: avgOctave
  };
}