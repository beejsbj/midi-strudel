import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { detectKey } from '../services/KeyDetector';
import { parseMidiFile } from '../services/MidiParser';
import {
  clearProjectStorage,
  loadConfigFromStorage,
  loadTracksFromStorage,
  saveConfigToStorage,
  saveTracksToStorage,
} from '../services/projectStorage';
import { StrudelNotation } from '../services/StrudelNotation';
import { DEFAULT_CONFIG, StrudelConfig, Track } from '../types';
import { useDebouncedValue } from './useDebouncedValue';

export interface ExampleMidi {
  id: string;
  url: string;
  fileName: string;
  label: string;
  detail: string;
  sourceUrl: string;
}

interface UseProjectStateOptions {
  examples: readonly ExampleMidi[];
  dependencies?: Partial<ProjectStateDependencies>;
}

interface ProjectStateDependencies {
  clearStorage: typeof clearProjectStorage;
  createNotation: (config: StrudelConfig) => { generate: (tracks: Track[]) => string };
  debounceMs: number;
  detectKeySignature: typeof detectKey;
  loadConfig: typeof loadConfigFromStorage;
  loadTracks: typeof loadTracksFromStorage;
  parseMidi: typeof parseMidiFile;
  saveConfig: typeof saveConfigToStorage;
  saveTracks: typeof saveTracksToStorage;
}

const DEFAULT_DEBOUNCE_MS = 120;

export function getNotationConfig(config: StrudelConfig): StrudelConfig {
  return {
    ...config,
    durationTagStyle: DEFAULT_CONFIG.durationTagStyle,
    isNoteColoringEnabled: DEFAULT_CONFIG.isNoteColoringEnabled,
    isProgressiveFillEnabled: DEFAULT_CONFIG.isProgressiveFillEnabled,
    isPatternTextColoringEnabled: DEFAULT_CONFIG.isPatternTextColoringEnabled,
  };
}

export function getNotationConfigKey(config: StrudelConfig): string {
  return JSON.stringify({
    bpm: config.bpm,
    cycleUnit: config.cycleUnit,
    durationPrecision: config.durationPrecision,
    fileName: config.fileName,
    formatPerLineBy: config.formatPerLineBy,
    globalSound: config.globalSound,
    includeVelocity: config.includeVelocity,
    isQuantized: config.isQuantized,
    isTrackColoringEnabled: config.isTrackColoringEnabled,
    key: config.key,
    measuresPerLine: config.measuresPerLine,
    notationType: config.notationType,
    outputStyle: config.outputStyle,
    playbackKey: config.playbackKey,
    quantizationStrength: config.quantizationStrength,
    quantizationThreshold: config.quantizationThreshold,
    sourceBpm: config.sourceBpm,
    sourceTimeSignature: config.sourceTimeSignature,
    timeSignature: config.timeSignature,
    timingStyle: config.timingStyle,
    useAutoMapping: config.useAutoMapping,
    visualMethods: config.visualMethods,
    visualScope: config.visualScope,
  });
}

function getProjectStateDependencies(
  overrides?: Partial<ProjectStateDependencies>,
): ProjectStateDependencies {
  return {
    clearStorage: clearProjectStorage,
    createNotation: (config) => new StrudelNotation(config),
    debounceMs: DEFAULT_DEBOUNCE_MS,
    detectKeySignature: detectKey,
    loadConfig: loadConfigFromStorage,
    loadTracks: loadTracksFromStorage,
    parseMidi: parseMidiFile,
    saveConfig: saveConfigToStorage,
    saveTracks: saveTracksToStorage,
    ...overrides,
  };
}

export function useProjectState({ examples, dependencies }: UseProjectStateOptions) {
  const deps = useMemo(
    () => getProjectStateDependencies(dependencies),
    [dependencies],
  );
  const [config, setConfig] = useState<StrudelConfig>(() => deps.loadConfig());
  const [tracks, setTracks] = useState<Track[]>(() => deps.loadTracks());
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeExampleId, setActiveExampleId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notationConfigKey = getNotationConfigKey(config);
  const notationConfig = useMemo(
    () => getNotationConfig(config),
    // Editor-only visual settings are intentionally excluded so they do not regenerate notation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notationConfigKey],
  );
  const debouncedConfig = useDebouncedValue(config, deps.debounceMs);
  const debouncedTracks = useDebouncedValue(tracks, deps.debounceMs);
  const debouncedNotationConfig = useDebouncedValue(notationConfig, deps.debounceMs);

  const code = useMemo(() => {
    if (tracks.length === 0) {
      return '';
    }

    const service = deps.createNotation(debouncedNotationConfig);
    return service.generate(debouncedTracks);
  }, [debouncedNotationConfig, debouncedTracks, deps, tracks.length]);

  useEffect(() => {
    deps.saveConfig(debouncedConfig);
  }, [debouncedConfig, deps]);

  useEffect(() => {
    deps.saveTracks(debouncedTracks);
  }, [debouncedTracks, deps]);

  const loadProjectFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);

    try {
      const result = await deps.parseMidi(file);
      const detectedKey = deps.detectKeySignature(result.tracks);

      setTracks(result.tracks);
      setConfig((prev) => ({
        ...prev,
        bpm: result.bpm,
        sourceBpm: result.bpm,
        timeSignature: result.timeSignature,
        sourceTimeSignature: result.timeSignature,
        fileName: file.name.replace(/\.[^.]+$/, ''),
        key: detectedKey ?? undefined,
        playbackKey: detectedKey ?? undefined,
      }));
    } catch (err) {
      console.error('Failed to parse MIDI', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to parse MIDI file. Please try a different file.',
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileLoaded = (file: File) => {
    void loadProjectFile(file);
  };

  const handleExampleLoad = async (exampleId: string) => {
    setError(null);
    setIsProcessing(true);
    setActiveExampleId(exampleId);

    try {
      const example = examples.find((item) => item.id === exampleId);
      if (!example) {
        throw new Error('The selected example could not be found.');
      }

      const response = await fetch(example.url);
      if (!response.ok) {
        throw new Error(`Example file failed to load (${response.status}).`);
      }

      const blob = await response.blob();
      const exampleFile = new File([blob], example.fileName, {
        type: blob.type || 'audio/midi',
      });

      await loadProjectFile(exampleFile);
    } catch (err) {
      setIsProcessing(false);
      setActiveExampleId(null);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load the example MIDI file. Please try again.',
      );
    }
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void loadProjectFile(file);
    }

    event.target.value = '';
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const clearProject = () => {
    setTracks([]);
    setConfig(DEFAULT_CONFIG);
    setError(null);
    setActiveExampleId(null);
    deps.clearStorage();
  };

  return {
    activeExampleId,
    code,
    config,
    error,
    fileInputRef,
    handleExampleLoad,
    handleFileInputChange,
    handleFileLoaded,
    isProcessing,
    setConfig,
    setError,
    setTracks,
    tracks,
    triggerFileUpload,
    clearProject,
  };
}
