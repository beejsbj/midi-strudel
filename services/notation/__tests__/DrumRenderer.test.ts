import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderDrumTrack } from '../DrumRenderer';
import { DEFAULT_CONFIG } from '../../../types';
import type { Track, Note } from '../../../types';

function makeNote(midi: number, noteOn: number, noteOff: number, noteName = 'C4'): Note {
  return { note: noteName, midi, noteOn, noteOff, velocity: 0.8 };
}

function makeTrack(notes: Note[], overrides: Partial<Track> = {}): Track {
  return {
    id: 'drums',
    name: 'Drums',
    notes,
    isDrum: true,
    ...overrides,
  };
}

const beatDur = 60 / 120; // 0.5s at 120bpm
const config = { ...DEFAULT_CONFIG };

describe('renderDrumTrack', () => {
  it('produces non-empty output for a simple drum pattern', () => {
    const notes = [
      makeNote(36, 0, beatDur),        // kick on beat 1
      makeNote(42, beatDur, beatDur * 2), // hi-hat on beat 2
    ];
    const track = makeTrack(notes);
    const result = renderDrumTrack(track, beatDur * 2, config);
    expect(result.length).toBeGreaterThan(0);
  });

  it('output contains expected drum sound tokens', () => {
    const notes = [
      makeNote(36, 0, beatDur),           // kick -> bd
      makeNote(38, beatDur, beatDur * 2), // snare -> sd
    ];
    const track = makeTrack(notes);
    const result = renderDrumTrack(track, beatDur * 2, config);
    expect(result).toContain('bd');
    expect(result).toContain('sd');
  });

  it('uses .as("s") notation', () => {
    const notes = [makeNote(36, 0, beatDur)];
    const track = makeTrack(notes);
    const result = renderDrumTrack(track, beatDur, config);
    expect(result).toContain('.as("s")');
  });

  it('warns for unmapped MIDI drum notes via console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const unmappedMidi = 99; // not in DRUM_MAP
      const notes = [makeNote(unmappedMidi, 0, beatDur, 'D#7')];
      const track = makeTrack(notes);
      renderDrumTrack(track, beatDur, config);
      expect(warnSpy).toHaveBeenCalledOnce();
      // The warn message should mention the MIDI number
      expect(warnSpy.mock.calls[0][0]).toContain('99');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does NOT warn for mapped drum notes', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const notes = [makeNote(36, 0, beatDur)]; // 36 = bd, mapped
      const track = makeTrack(notes);
      renderDrumTrack(track, beatDur, config);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('filters out unmapped notes from output', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const notes = [
        makeNote(36, 0, beatDur),   // mapped -> bd
        makeNote(99, beatDur, beatDur * 2), // unmapped, should be dropped
      ];
      const track = makeTrack(notes);
      const result = renderDrumTrack(track, beatDur * 2, config);
      expect(result).toContain('bd');
      expect(result).not.toContain('?');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('uses the track name in the variable identifier', () => {
    const notes = [makeNote(36, 0, beatDur)];
    const track = makeTrack(notes, { name: 'My Drums' });
    const result = renderDrumTrack(track, beatDur, config);
    expect(result).toContain('MY_DRUMS');
  });
});
