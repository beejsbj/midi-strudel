import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { CodeViewer } from './components/CodeViewer';
import { DropZone } from './components/DropZone';
import { StrudelNotation } from './services/StrudelNotation';
import { parseMidiFile } from './services/MidiParser';
import { detectKey } from './services/KeyDetector';
import { Track, StrudelConfig, DEFAULT_CONFIG, KeySignature } from './types';
import { Music, Wand2, Clock, FileCode, Github } from 'lucide-react';

// --- Error Boundary ---
interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

type ErrorBoundaryProps = { children: React.ReactNode };

class ErrorBoundary extends React.Component {
  declare props: ErrorBoundaryProps;
  declare state: ErrorBoundaryState;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('React error boundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full bg-noir-900 text-gray-200 items-center justify-center p-8">
          <div className="max-w-md w-full space-y-4 text-center">
            <h1 className="text-2xl font-bold text-red-400">Something went wrong</h1>
            <p className="text-zinc-400 text-sm">{this.state.message || 'An unexpected error occurred.'}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gold-600 text-white text-sm font-bold rounded hover:bg-gold-500 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return (this.props as ErrorBoundaryProps).children;
  }
}

// --- localStorage helpers ---
const CONFIG_STORAGE_KEY = 'midi-strudel-config';
const TRACKS_STORAGE_KEY = 'midi-strudel-tracks';
const KEY_SIG_STORAGE_KEY = 'midi-strudel-keysig';

function loadConfigFromStorage(): StrudelConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    // Merge with defaults so any new fields are present
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfigToStorage(config: StrudelConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Storage quota exceeded or unavailable — silently ignore
  }
}

function loadTracksFromStorage(): Track[] {
  try {
    const raw = localStorage.getItem(TRACKS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveTracksToStorage(tracks: Track[]): void {
  try {
    if (tracks.length === 0) {
      localStorage.removeItem(TRACKS_STORAGE_KEY);
    } else {
      localStorage.setItem(TRACKS_STORAGE_KEY, JSON.stringify(tracks));
    }
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

function loadKeySignatureFromStorage(): KeySignature | undefined {
  try {
    const raw = localStorage.getItem(KEY_SIG_STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function saveKeySignatureToStorage(keySig: KeySignature | undefined): void {
  try {
    if (keySig === undefined) {
      localStorage.removeItem(KEY_SIG_STORAGE_KEY);
    } else {
      localStorage.setItem(KEY_SIG_STORAGE_KEY, JSON.stringify(keySig));
    }
  } catch {
    // silently ignore
  }
}

// --- Main App ---
const App: React.FC = () => {
  const [config, setConfig] = useState<StrudelConfig>(() => loadConfigFromStorage());
  const [tracks, setTracks] = useState<Track[]>(() => loadTracksFromStorage());
  const [code, setCode] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [keySignature, setKeySignature] = useState<KeySignature | undefined>(() => loadKeySignatureFromStorage());
  const [error, setError] = useState<string | null>(null);

  // Hidden input for the sidebar "Upload New" button
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persist config, tracks, and key signature to localStorage on every change
  useEffect(() => { saveConfigToStorage(config); }, [config]);
  useEffect(() => { saveTracksToStorage(tracks); }, [tracks]);
  useEffect(() => { saveKeySignatureToStorage(keySignature); }, [keySignature]);

  const handleFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    try {
      const result = await parseMidiFile(file);

      // Detect Key
      const detectedKey = detectKey(result.tracks);

      setTracks(result.tracks);
      setKeySignature(detectedKey ?? undefined);

      setConfig(prev => ({
        ...prev,
        bpm: result.bpm,
        sourceBpm: result.bpm,
        timeSignature: result.timeSignature,
        sourceTimeSignature: result.timeSignature,
        fileName: file.name.replace(/\.[^.]+$/, ''),
        // Only update key fields when a key was detected; leave unchanged if no notes
        ...(detectedKey !== null && {
          key: detectedKey,
          playbackKey: detectedKey,
        }),
      }));

    } catch (err) {
      console.error("Failed to parse MIDI", err);
      setError(err instanceof Error ? err.message : "Failed to parse MIDI file. Please try a different file.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileLoaded = (file: File) => {
    handleFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
        handleFile(e.target.files[0]);
    }
    // Reset value so same file can be selected again if needed
    if (e.target) e.target.value = '';
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const clearProject = () => {
      setTracks([]);
      setKeySignature(undefined);
      setConfig(DEFAULT_CONFIG);
      setCode("");
      setError(null);
      localStorage.removeItem(TRACKS_STORAGE_KEY);
      localStorage.removeItem(KEY_SIG_STORAGE_KEY);
      localStorage.removeItem(CONFIG_STORAGE_KEY);
  };

  useEffect(() => {
    if (tracks.length === 0) return;

    const generate = () => {
      const service = new StrudelNotation(config);
      const output = service.generate(tracks);
      setCode(output);
    };

    const timeout = setTimeout(generate, 100);
    return () => clearTimeout(timeout);
  }, [config, tracks]);

  return (
    <div className="flex h-screen w-full bg-noir-900 text-gray-200 font-sans overflow-hidden">
      {tracks.length > 0 && (
          <Sidebar
            config={config}
            setConfig={setConfig}
            tracks={tracks}
            setTracks={setTracks}
            keySignature={keySignature}
            onClear={clearProject}
            onUpload={triggerFileUpload}
          />
      )}

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Inline error banner */}
        {error && (
          <div role="alert" className="flex items-center justify-between px-4 py-2 bg-red-900/60 border-b border-red-700/50 text-red-300 text-sm">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="ml-4 text-red-400 hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400 rounded"
            >
              ✕
            </button>
          </div>
        )}

        {tracks.length === 0 ? (
            <div className="flex-1 overflow-y-auto bg-noir-900 flex flex-col items-center justify-center p-8">
                <div className="max-w-xl w-full space-y-12">

                    {/* Header Section */}
                    <div className="text-center space-y-6">
                         <div className="inline-block border border-gold-500/30 bg-gold-500/5 rounded-full px-4 py-1.5 mb-2">
                             <span className="text-gold-500 text-xs font-mono font-bold tracking-widest uppercase">Experimental Tool</span>
                         </div>
                         <h1 className="text-4xl font-black text-white tracking-tighter">
                            MIDI <span className="text-zinc-600 px-2">→</span> <span className="text-gold-500">STRUDEL</span>
                         </h1>
                         <div className="space-y-4 text-zinc-400 font-light leading-relaxed">
                             <p>
                                Hi! This is a playground for converting standard MIDI files into Strudel's live-coding notation.
                             </p>
                             <p className="text-sm">
                                It tries to be smart about chords, voice leading, and polyphony, translating linear piano rolls into clean, cycle-based patterns. It's not perfect, but it's a fun way to get your tracks into the REPL.
                             </p>
                         </div>
                    </div>

                    {/* Drop Zone */}
                    <div className="relative">
                        <DropZone onFileLoaded={handleFileLoaded} />
                        {isProcessing && (
                            <div className="absolute inset-0 bg-noir-900/80 backdrop-blur-sm flex items-center justify-center rounded-xl z-10">
                                <p className="text-gold-500 font-mono animate-pulse">Parsing MIDI Data...</p>
                            </div>
                        )}
                    </div>

                    {/* Features Grid */}
                    <div className="grid grid-cols-2 gap-x-12 gap-y-8 pt-4">
                        <div className="space-y-2">
                            <div className="flex items-center space-x-2 text-gold-500 mb-1">
                                <FileCode size={16} />
                                <h3 className="font-bold text-sm uppercase tracking-wide">Notation Logic</h3>
                            </div>
                            <p className="text-xs text-zinc-500 leading-relaxed">
                                Converts absolute time to cycles. Supports both absolute duration <code>@0.5</code> and subdivision <code>[a b]</code> syntax.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center space-x-2 text-purple-500 mb-1">
                                <Wand2 size={16} />
                                <h3 className="font-bold text-sm uppercase tracking-wide">Sound Mapping</h3>
                            </div>
                            <p className="text-xs text-zinc-500 leading-relaxed">
                                Heuristic matching of track names to Strudel's GM instruments. Snare becomes <code>sd</code>, Piano becomes <code>gm_piano</code>.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center space-x-2 text-blue-500 mb-1">
                                <Clock size={16} />
                                <h3 className="font-bold text-sm uppercase tracking-wide">Quantization</h3>
                            </div>
                            <p className="text-xs text-zinc-500 leading-relaxed">
                                Clean up messy human timing. Set a threshold to snap notes to the grid for cleaner code output.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center space-x-2 text-green-500 mb-1">
                                <Music size={16} />
                                <h3 className="font-bold text-sm uppercase tracking-wide">Key Analysis</h3>
                            </div>
                            <p className="text-xs text-zinc-500 leading-relaxed">
                                Detects the musical key to optionally output relative scale degrees (0, 1, 2b) instead of note names.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        ) : (
            <div className="flex flex-col h-full p-6">
               <div className="flex-1 min-h-0">
                 <CodeViewer code={code} />
               </div>
            </div>
        )}
      </main>

      {/* Hidden File Input for Sidebar Action */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept=".mid,.midi"
        className="hidden"
      />
    </div>
  );
};

const AppWithBoundary: React.FC = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default AppWithBoundary;
