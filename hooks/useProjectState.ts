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
}

export function useProjectState({ examples }: UseProjectStateOptions) {
  const [config, setConfig] = useState<StrudelConfig>(() => loadConfigFromStorage());
  const [tracks, setTracks] = useState<Track[]>(() => loadTracksFromStorage());
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeExampleId, setActiveExampleId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const code = useMemo(() => {
    if (tracks.length === 0) {
      return '';
    }

    const service = new StrudelNotation(config);
    return service.generate(tracks);
  }, [config, tracks]);

  useEffect(() => {
    saveConfigToStorage(config);
  }, [config]);

  useEffect(() => {
    saveTracksToStorage(tracks);
  }, [tracks]);

  const loadProjectFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);

    try {
      const result = await parseMidiFile(file);
      const detectedKey = detectKey(result.tracks);

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
    clearProjectStorage();
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
