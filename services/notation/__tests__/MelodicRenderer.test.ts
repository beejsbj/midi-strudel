import { describe, it, expect } from 'vitest';
import { splitMelodyHarmony, renderMelodicTrack } from '../MelodicRenderer';
import { DEFAULT_CONFIG } from '../../../types';
import type { Note, Track } from '../../../types';

function makeNote(midi: number, note: string, noteOn: number, noteOff: number): Note {
  return { note, midi, noteOn, noteOff, velocity: 0.8 };
}

function makeTrack(notes: Note[], overrides: Partial<Track> = {}): Track {
  return {
    id: 'melodic',
    name: 'Piano',
    notes,
    isDrum: false,
    ...overrides,
  };
}

const beatDur = 60 / 120; // 0.5s at 120bpm
const barDur = beatDur * 4; // 2s for 4/4 at 120bpm
const config = { ...DEFAULT_CONFIG };

describe('splitMelodyHarmony', () => {
  it('puts non-overlapping sequential notes all into melody', () => {
    const notes = [
      makeNote(60, 'C4', 0, beatDur),
      makeNote(64, 'E4', beatDur, beatDur * 2),
      makeNote(67, 'G4', beatDur * 2, beatDur * 3),
    ];
    const { melody, harmony } = splitMelodyHarmony(notes);
    expect(melody).toHaveLength(3);
    expect(harmony).toHaveLength(0);
  });

  it('places overlapping notes into harmony', () => {
    const notes = [
      makeNote(60, 'C4', 0, beatDur * 2),   // long note
      makeNote(64, 'E4', beatDur, beatDur * 2), // starts while C4 is still playing
    ];
    const { melody, harmony } = splitMelodyHarmony(notes);
    expect(melody).toHaveLength(1);
    expect(harmony).toHaveLength(1);
    expect(melody[0].note).toBe('C4');
    expect(harmony[0].note).toBe('E4');
  });

  it('handles empty note list', () => {
    const { melody, harmony } = splitMelodyHarmony([]);
    expect(melody).toHaveLength(0);
    expect(harmony).toHaveLength(0);
  });
});

describe('renderMelodicTrack', () => {
  it('produces non-empty output for a single note track', () => {
    const notes = [makeNote(60, 'C4', 0, beatDur)];
    const track = makeTrack(notes);
    const result = renderMelodicTrack(track, beatDur, config);
    expect(result.length).toBeGreaterThan(0);
  });

  it('output includes the note value (absolute mode)', () => {
    const notes = [makeNote(60, 'C4', 0, beatDur)];
    const track = makeTrack(notes);
    const result = renderMelodicTrack(track, beatDur, config);
    expect(result).toContain('C4');
  });

  it('uses .as("note") for absolute notation', () => {
    const notes = [makeNote(60, 'C4', 0, beatDur)];
    const track = makeTrack(notes);
    const result = renderMelodicTrack(track, beatDur, { ...config, notationType: 'absolute' });
    expect(result).toContain('.as("note")');
  });

  it('includes _MELODY suffix in output variable name', () => {
    const notes = [makeNote(60, 'C4', 0, beatDur)];
    const track = makeTrack(notes, { name: 'Piano' });
    const result = renderMelodicTrack(track, barDur, config);
    expect(result).toContain('PIANO_MELODY');
  });

  it('emits rest tokens (~) between non-adjacent notes', () => {
    const notes = [
      makeNote(60, 'C4', 0, beatDur),
      // gap of one beat
      makeNote(64, 'E4', beatDur * 2, beatDur * 3),
    ];
    const track = makeTrack(notes);
    const result = renderMelodicTrack(track, beatDur * 3, config);
    expect(result).toContain('~');
  });

  it('generates separate MELODY and HARMONY sections for overlapping notes', () => {
    const notes = [
      makeNote(60, 'C4', 0, barDur),       // long melody note
      makeNote(64, 'E4', beatDur, barDur),  // overlapping harmony note
    ];
    const track = makeTrack(notes, { name: 'Piano' });
    const result = renderMelodicTrack(track, barDur, config);
    expect(result).toContain('_MELODY');
    expect(result).toContain('_HARMONY');
  });

  it('uses the configured sound in output', () => {
    const notes = [makeNote(60, 'C4', 0, beatDur)];
    const track = makeTrack(notes, { sound: 'gm_piano' });
    const result = renderMelodicTrack(track, beatDur, config);
    expect(result).toContain('gm_piano');
  });
});
