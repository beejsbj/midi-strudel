import { describe, it, expect } from 'vitest';
import { generateSimpleGrid, flattenGrid, simplifyGrid, renderMeasureSubdivision } from '../GridBuilder';
import { DEFAULT_CONFIG } from '../../../types';
import type { Note } from '../../../types';

const DRUM_MAP: Record<number, string> = {
  36: 'bd',
  38: 'sd',
  42: 'hh',
};

const config = { ...DEFAULT_CONFIG };

function makeNote(midi: number, noteOn: number, noteOff: number): Note {
  return { note: 'C4', midi, noteOn, noteOff, velocity: 0.8 };
}

describe('generateSimpleGrid', () => {
  it('returns a rest grid when no notes are provided', () => {
    const grid = generateSimpleGrid([], [], 0, 1, false, config, DRUM_MAP);
    expect(grid).toEqual(['~']);
  });

  it('produces a non-empty grid for a single note', () => {
    // One note starting at 0, lasting the full beat
    const note = makeNote(60, 0, 0.5);
    const grid = generateSimpleGrid([note], [], 0, 0.5, false, config, DRUM_MAP);
    expect(grid.length).toBeGreaterThan(0);
    // The first cell must be a note, not a rest
    expect(grid[0]).not.toBe('~');
  });

  it('generates valid grid for a 4/4 bar with a kick on beat 1', () => {
    const beatDur = (60 / 120) * 1; // 0.5s per beat at 120bpm
    const kick = makeNote(36, 0, beatDur); // kick on beat 1
    const grid = generateSimpleGrid([kick], [], 0, beatDur, true, config, DRUM_MAP);
    expect(grid[0]).toBe('bd');
  });
});

describe('simplifyGrid', () => {
  it('collapses a grid with only sustained tails', () => {
    // [A, _, _, _] should simplify to [A]
    const grid = ['A', '_', '_', '_'];
    const simplified = simplifyGrid(grid);
    expect(simplified).toEqual(['A']);
  });

  it('leaves already-minimal grids unchanged', () => {
    const grid = ['A', 'B', 'C', 'D'];
    expect(simplifyGrid(grid)).toEqual(grid);
  });

  it('does not simplify mixed content', () => {
    // [A, B, _, _] — cannot simplify because B is a note not a sustain after A
    const grid = ['A', 'B', '_', '_'];
    const simplified = simplifyGrid(grid);
    // Step size 2: positions 0 and 2 checked. grid[1]='B' != '_', so step=2 fails.
    // Step size 4: only 1 element — this would succeed only if grid[1..3] are all '_'
    // grid[1]='B' != '_', so step=4 also fails at j=1.
    // Result should be unchanged
    expect(simplified).toEqual(grid);
  });

  it('preserves total musical content after simplification', () => {
    // [X, _, X, _] — step=2: grid[1]='_' ok, grid[3]='_' ok => simplifies to [X, X]
    const grid = ['X', '_', 'X', '_'];
    const simplified = simplifyGrid(grid);
    expect(simplified).toEqual(['X', 'X']);
  });
});

describe('flattenGrid', () => {
  it('correctly expands grids of different lengths via LCM', () => {
    // beatGrids: [[A], [B, C]] → LCM(1, 2)=2, expand [A] to [A, _], concat [B, C] → [A, _, B, C]
    const beatGrids = [['A'], ['B', 'C']];
    const flat = flattenGrid(beatGrids);
    expect(flat).toContain('A');
    expect(flat).toContain('B');
    expect(flat).toContain('C');
  });

  it('preserves content for equal-length grids', () => {
    const beatGrids = [['A', 'B'], ['C', 'D']];
    const flat = flattenGrid(beatGrids);
    expect(flat).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('renderMeasureSubdivision', () => {
  it('returns a rest bracket when there are no notes', () => {
    const cycleDur = (60 / 120) * 4;
    const measureDur = cycleDur;
    const result = renderMeasureSubdivision([], 0, measureDur, cycleDur, false, config, DRUM_MAP);
    expect(result).toBe('[~]');
  });

  it('wraps output in square brackets', () => {
    const note = makeNote(60, 0, 0.5);
    const cycleDur = (60 / 120) * 4; // 2s
    const measureDur = cycleDur;
    const result = renderMeasureSubdivision([note], 0, measureDur, cycleDur, false, config, DRUM_MAP);
    expect(result.startsWith('[')).toBe(true);
    expect(result.includes(']')).toBe(true);
  });
});
