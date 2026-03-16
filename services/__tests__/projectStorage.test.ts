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
  it('round-trips config and tracks without a separate key state', () => {
    const storage = createMemoryStorage();
    const tracks = [
      {
        id: 'track-1',
        name: 'Piano',
        notes: [],
        isDrum: false,
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

  it('clears both persisted keys', () => {
    const storage = createMemoryStorage();

    saveConfigToStorage(DEFAULT_CONFIG, storage);
    saveTracksToStorage([{ id: 'track-1', name: 'Piano', notes: [], isDrum: false }], storage);
    clearProjectStorage(storage);

    expect(storage.getItem(CONFIG_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(TRACKS_STORAGE_KEY)).toBeNull();
  });
});
