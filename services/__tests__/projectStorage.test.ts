import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../types';
import {
  CONFIG_STORAGE_KEY,
  TRACKS_STORAGE_KEY,
  clearProjectStorage,
  loadConfigFromStorage,
  loadTracksFromStorage,
  normalizeConfidence,
  saveConfigToStorage,
  saveTracksToStorage,
  sanitizeConfig,
} from '../projectStorage';

function createMemoryStorage() {
  const store = new Map<string, string>();

  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

describe('normalizeConfidence', () => {
  it('clamps invalid values into the 0..1 range', () => {
    expect(normalizeConfidence(-1)).toBe(0);
    expect(normalizeConfidence(0.42)).toBe(0.42);
    expect(normalizeConfidence(4)).toBe(1);
  });
});

describe('sanitizeConfig', () => {
  it('applies the current default toggles to partial persisted config', () => {
    const config = sanitizeConfig({
      globalSound: 'sawtooth',
    });

    expect(config.useAutoMapping).toBe(true);
    expect(config.isNoteColoringEnabled).toBe(true);
  });

  it('normalizes key confidence from persisted config', () => {
    const config = sanitizeConfig({
      ...DEFAULT_CONFIG,
      key: {
        root: 'C',
        type: 'major',
        confidence: 7,
        averageOctave: 4,
      },
      playbackKey: {
        root: 'A',
        type: 'minor',
        confidence: -3,
        averageOctave: 5,
      },
    });

    expect(config.key?.confidence).toBe(1);
    expect(config.playbackKey?.confidence).toBe(0);
  });
});

describe('project storage', () => {
  it('keeps expanded as the legacy default and persists structured mode', () => {
    expect(sanitizeConfig({}).renderingMode).toBe('expanded');
    expect(sanitizeConfig({ renderingMode: 'invalid' as never }).renderingMode).toBe('expanded');
    const storage = createMemoryStorage();
    saveConfigToStorage({ ...DEFAULT_CONFIG, renderingMode: 'structured' }, storage);
    expect(loadConfigFromStorage(storage).renderingMode).toBe('structured');
  });

  it('round-trips config and tracks without a separate key state', () => {
    const storage = createMemoryStorage();
    const tracks = [
      {
        id: 'track-1',
        name: 'Piano',
        notes: [{
          note: 'C4', midi: 60, noteOn: 0, noteOff: 0.5, velocity: 0.8,
          source: { id: 'track-1:note-0:0', ticks: 0, durationTicks: 480 },
        }],
        isDrum: false,
        sourceTiming: {
          ppq: 480,
          tempos: [{ ticks: 0, bpm: 120 }],
          timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }],
        },
      },
    ];
    const config = {
      ...DEFAULT_CONFIG,
      fileName: 'example',
      key: {
        root: 'C',
        type: 'major' as const,
        confidence: 0.82,
        averageOctave: 4,
      },
      playbackKey: {
        root: 'C',
        type: 'major' as const,
        confidence: 0.82,
        averageOctave: 4,
      },
    };

    saveConfigToStorage(config, storage);
    saveTracksToStorage(tracks, storage);

    expect(loadConfigFromStorage(storage)).toMatchObject({
      fileName: 'example',
      key: config.key,
      playbackKey: config.playbackKey,
    });
    expect(loadTracksFromStorage(storage)).toEqual(tracks);
  });

  it('loads legacy seconds-only tracks without manufacturing source timing', () => {
    const storage = createMemoryStorage();
    const legacyTracks = [{
      id: 'legacy-piano',
      name: 'Legacy Piano',
      isDrum: false,
      notes: [{ note: 'C4', midi: 60, noteOn: 0.125, noteOff: 0.375, velocity: 0.8 }],
    }];

    saveTracksToStorage(legacyTracks, storage);

    expect(loadTracksFromStorage(storage)).toEqual(legacyTracks);
  });

  it('clears both persisted keys', () => {
    const storage = createMemoryStorage();

    saveConfigToStorage(DEFAULT_CONFIG, storage);
    saveTracksToStorage([{ id: 'track-1', name: 'Piano', notes: [], isDrum: false }], storage);
    clearProjectStorage(storage);

    expect(storage.getItem(CONFIG_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(TRACKS_STORAGE_KEY)).toBeNull();
  });

  it('does not persist a pristine default config', () => {
    const storage = createMemoryStorage();

    saveConfigToStorage(DEFAULT_CONFIG, storage);

    expect(storage.getItem(CONFIG_STORAGE_KEY)).toBeNull();
  });
});
