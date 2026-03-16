import React, { Suspense, useState, useEffect, useRef, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { DropZone } from './components/DropZone';
import { StrudelNotation } from './services/StrudelNotation';
import { parseMidiFile } from './services/MidiParser';
import { detectKey } from './services/KeyDetector';
import { Track, StrudelConfig, DEFAULT_CONFIG, KeySignature } from './types';
import { Loader2, Play, ExternalLink, Menu } from 'lucide-react';

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
const EXAMPLE_MIDIS = [
  {
    id: 'ruthlessness',
    url: '/examples/ruthlessness-epic-the-musical.mid',
    fileName: 'Ruthlessness (Epic The Musical).mid',
    label: 'Ruthlessness',
    detail: 'A smaller example that loads quickly and shows the shape of the app fast.',
    sourceUrl: 'https://onlinesequencer.net/3897560',
  },
  {
    id: 'warrior-of-the-mind',
    url: '/examples/warrior-of-the-mind-epic-the-musical.mid',
    fileName: 'Warrior of the Mind (Epic The Musical).mid',
    label: 'Warrior of the Mind',
    detail: 'A denser file with more material if you want to stress the conversion a bit.',
    sourceUrl: 'https://onlinesequencer.net/4782267',
  },
] as const;

const RUTHLESSNESS_EXAMPLE_SNIPPET = `$EXAMPLE_MELODY: \`<
~@0 E6@0.0833 D6@0.0833 C6@0.0833
D6@0.0833 C6@0.0833 B5@0.0833 C6@0.0833
B5@0.0833 A5@0.0833 B5@0.0833 A5@0.0833
G5@0.0833
>\`
  .as("note")
  .sound("triangle").cps(135 / 60 / 4)
  ._pianoroll()`;

const LazyCodeViewer = React.lazy(() =>
  import('./components/CodeViewer').then((module) => ({ default: module.CodeViewer })),
);

function sanitizeWholeNumber(value: unknown, fallback: number, min: number, max?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.round(value);
  const lowerBounded = Math.max(min, rounded);
  return max == null ? lowerBounded : Math.min(max, lowerBounded);
}

function sanitizeTimeSignature(
  value: Partial<StrudelConfig['timeSignature']> | undefined,
  fallback: StrudelConfig['timeSignature'],
): StrudelConfig['timeSignature'] {
  return {
    numerator: sanitizeWholeNumber(value?.numerator, fallback.numerator, 1, 32),
    denominator: sanitizeWholeNumber(value?.denominator, fallback.denominator, 1, 32),
  };
}

function sanitizeConfig(config: StrudelConfig): StrudelConfig {
  const defaultSourceTimeSignature =
    DEFAULT_CONFIG.sourceTimeSignature ?? DEFAULT_CONFIG.timeSignature;

  return {
    ...config,
    bpm: sanitizeWholeNumber(config.bpm, DEFAULT_CONFIG.bpm, 1),
    sourceBpm: sanitizeWholeNumber(config.sourceBpm, DEFAULT_CONFIG.sourceBpm, 1),
    timeSignature: sanitizeTimeSignature(config.timeSignature, DEFAULT_CONFIG.timeSignature),
    sourceTimeSignature: sanitizeTimeSignature(config.sourceTimeSignature, defaultSourceTimeSignature),
    measuresPerLine: sanitizeWholeNumber(config.measuresPerLine, DEFAULT_CONFIG.measuresPerLine, 1, 64),
    quantizationThreshold: sanitizeWholeNumber(config.quantizationThreshold, DEFAULT_CONFIG.quantizationThreshold, 0, 200),
    quantizationStrength: sanitizeWholeNumber(config.quantizationStrength, DEFAULT_CONFIG.quantizationStrength, 0, 100),
    durationPrecision: sanitizeWholeNumber(config.durationPrecision, DEFAULT_CONFIG.durationPrecision, 1, 8),
    key: config.key
      ? {
          ...config.key,
          confidence: Math.max(0, Math.min(1, Number.isFinite(config.key.confidence) ? config.key.confidence : 0)),
          averageOctave: sanitizeWholeNumber(config.key.averageOctave, 3, 0, 8),
        }
      : undefined,
    playbackKey: config.playbackKey
      ? {
          ...config.playbackKey,
          confidence: Math.max(0, Math.min(1, Number.isFinite(config.playbackKey.confidence) ? config.playbackKey.confidence : 0)),
          averageOctave: sanitizeWholeNumber(config.playbackKey.averageOctave, 3, 0, 8),
        }
      : undefined,
  };
}

function loadConfigFromStorage(): StrudelConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    // Merge with defaults so any new fields are present
    return sanitizeConfig({ ...DEFAULT_CONFIG, ...parsed });
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [keySignature, setKeySignature] = useState<KeySignature | undefined>(() => loadKeySignatureFromStorage());
  const [error, setError] = useState<string | null>(null);
  const [activeExampleId, setActiveExampleId] = useState<(typeof EXAMPLE_MIDIS)[number]['id'] | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Hidden input for the sidebar "Upload New" button
  const fileInputRef = useRef<HTMLInputElement>(null);

  const code = useMemo(() => {
    if (tracks.length === 0) {
      return "";
    }

    const service = new StrudelNotation(config);
    return service.generate(tracks);
  }, [config, tracks]);

  // Persist config, tracks, and key signature to localStorage on every change
  useEffect(() => { saveConfigToStorage(config); }, [config]);
  useEffect(() => { saveTracksToStorage(tracks); }, [tracks]);
  useEffect(() => { saveKeySignatureToStorage(keySignature); }, [keySignature]);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsMobileSidebarOpen(false);
    }
  }, [tracks.length]);

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

  const handleExampleLoad = async (exampleId: (typeof EXAMPLE_MIDIS)[number]['id']) => {
    setError(null);
    setIsProcessing(true);
    setActiveExampleId(exampleId);

    try {
      const example = EXAMPLE_MIDIS.find((item) => item.id === exampleId);
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

      await handleFile(exampleFile);
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
      setError(null);
      localStorage.removeItem(TRACKS_STORAGE_KEY);
      localStorage.removeItem(KEY_SIG_STORAGE_KEY);
      localStorage.removeItem(CONFIG_STORAGE_KEY);
  };

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
            isMobileOpen={isMobileSidebarOpen}
            onCloseMobile={() => setIsMobileSidebarOpen(false)}
          />
      )}

      <main className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
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
            <div className="flex-1 overflow-y-auto bg-noir-900 p-6 md:p-10">
                <div className="mx-auto grid min-h-full max-w-6xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                    <section className="relative overflow-hidden rounded-[28px] border border-gold-500/20 bg-[linear-gradient(180deg,rgba(24,24,24,0.96),rgba(10,10,10,0.99))] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.28)] md:p-10">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.1),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.04),transparent_28%)] pointer-events-none" />
                        <div className="relative space-y-8">
                            <div className="space-y-4">
                                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-gold-500/75">
                                    midi-strudel
                                </p>
                                <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-zinc-100 md:text-5xl">
                                    i got too obsessed with Epic: The Musical and wanted to see the melodies as strudel code.
                                </h1>
                                <div className="max-w-2xl space-y-4 text-[15px] leading-7 text-zinc-400">
                                    <p>
                                        that was honestly the whole spark for this. i was on a high from Epic, discovered{' '}
                                        <a
                                            href="https://strudel.cc/"
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-gold-400 underline decoration-gold-500/40 underline-offset-4 transition-colors hover:text-gold-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
                                        >
                                            strudel
                                        </a>
                                        , and really wanted to look at those melodies in this code-shaped notation instead of just a piano roll.
                                    </p>
                                    <p>
                                        then vibe coding made it very easy to keep poking at it. it stopped being a one-off experiment and slowly became a fun little toy for turning midi into strudel-ish code.
                                    </p>
                                    <p>
                                        along the way it also became a useful excuse to play with gemini, claude, and gpt as ai dev tools and see what kind of workflow they were actually good for.
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-2xl border border-gold-500/12 bg-black/25 p-4">
                                    <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-gold-500/70">what strudel is</p>
                                    <p className="text-sm leading-6 text-zinc-300">
                                        strudel is a browser-based live coding environment for music. instead of a piano roll, you describe repeating patterns and cycles in code.
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-zinc-400">
                                        <a
                                            href="https://strudel.cc/"
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 transition-colors hover:text-gold-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
                                        >
                                            strudel.cc
                                            <ExternalLink size={12} />
                                        </a>
                                        <a
                                            href="https://strudel.cc/learn/getting-started/"
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 transition-colors hover:text-gold-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
                                        >
                                            docs / getting started
                                            <ExternalLink size={12} />
                                        </a>
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-gold-500/12 bg-black/25 p-4">
                                    <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-gold-500/70">what this project does</p>
                                    <p className="text-sm leading-6 text-zinc-300">
                                        it takes a midi file, parses the tracks, and gives you strudel-ish code you can read, tweak, and send into the repl without starting from scratch.
                                    </p>
                                </div>
                            </div>

                        </div>
                    </section>

                    <section className="flex flex-col gap-6">
                        <div className="rounded-[24px] border border-gold-500/14 bg-black/30 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
                            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-gold-500/70">quick start</p>
                            <div className="space-y-2 text-sm leading-6 text-zinc-300">
                                <p>1. drop a `.mid` or `.midi` file into the upload box.</p>
                                <p>2. or hit one of the examples if you want to hear the vibe first.</p>
                                <p>3. once it loads, tweak the settings and open the result in strudel.</p>
                            </div>
                        </div>

                        <div className="relative rounded-[24px] border border-gold-500/14 bg-zinc-950/75 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
                            <div className="mb-4 flex items-center justify-between gap-4">
                                <div>
                                    <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-gold-500/75">upload your own midi</p>
                                    <p className="mt-1 text-sm text-zinc-400">drop a file in here and it opens straight into the editor.</p>
                                </div>
                            </div>

                            <div className="relative">
                                <DropZone onFileLoaded={handleFileLoaded} />
                                {isProcessing && (
                                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-noir-900/82 backdrop-blur-sm">
                                        <p className="font-mono text-gold-500 animate-pulse">Parsing MIDI Data...</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="relative overflow-hidden rounded-[24px] border border-gold-500/14 bg-[linear-gradient(180deg,rgba(22,22,22,0.96),rgba(12,12,12,0.98))] p-5">
                            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500/40 to-transparent" />
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-gold-500/75">example</p>
                                    <p className="text-sm leading-6 text-zinc-400">
                                        this is one loop from the first Ruthlessness track, shown as a real little strudel player instead of a fake code block.
                                    </p>
                                </div>

                                <div className="h-[360px] overflow-hidden rounded-[20px] border border-zinc-800 bg-noir-900/70">
                                    <Suspense
                                      fallback={
                                        <div className="flex h-full items-center justify-center bg-noir-900 text-zinc-400">
                                          <div className="flex items-center gap-2 text-sm font-mono">
                                            <Loader2 size={16} className="animate-spin text-gold-500" />
                                            <span>Loading example player...</span>
                                          </div>
                                        </div>
                                      }
                                    >
                                      <LazyCodeViewer
                                        code={RUTHLESSNESS_EXAMPLE_SNIPPET}
                                        durationTagStyle={config.durationTagStyle}
                                        isNoteColoringEnabled={config.isNoteColoringEnabled}
                                        isProgressiveFillEnabled={config.isProgressiveFillEnabled}
                                        isPatternTextColoringEnabled={config.isPatternTextColoringEnabled}
                                        showCopyButton={false}
                                        showOpenExternalButton={false}
                                        playerLabel="Ruthlessness / first track"
                                      />
                                    </Suspense>
                                </div>

                                <div className="flex flex-col gap-2">
                                    {EXAMPLE_MIDIS.map((example) => {
                                      const isActive = activeExampleId === example.id;
                                      const isDisabled = isProcessing;
                                      const primaryLabel =
                                        example.id === 'ruthlessness'
                                          ? 'see full Ruthlessness example'
                                          : 'or check out Warrior of the Mind';

                                      return (
                                        <button
                                          key={example.id}
                                          type="button"
                                          onClick={() => handleExampleLoad(example.id)}
                                          disabled={isDisabled}
                                          className={`inline-flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 ${
                                            isDisabled
                                              ? 'cursor-not-allowed border-gold-500/10 bg-gold-500/5 text-gold-300/60'
                                              : 'border-zinc-800 bg-black/30 text-zinc-100 hover:border-gold-500/30 hover:bg-zinc-900'
                                          }`}
                                        >
                                          <div className="min-w-0">
                                            <p className="text-sm font-semibold text-zinc-100">{primaryLabel}</p>
                                            <p className="mt-0.5 text-[12px] leading-5 text-zinc-500">{example.detail}</p>
                                          </div>
                                          <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-900/80 p-2 text-gold-400">
                                            {isProcessing && isActive ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
                                          </span>
                                        </button>
                                      );
                                    })}
                                </div>

                                <div className="flex flex-wrap gap-3 text-[11px] text-zinc-500">
                                    {EXAMPLE_MIDIS.map((example) => (
                                      <a
                                        key={example.id}
                                        href={example.sourceUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 transition-colors hover:text-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
                                      >
                                        {example.label} source
                                        <ExternalLink size={12} />
                                      </a>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        ) : (
            <div className="flex flex-col h-full">
               <div className="flex items-center justify-between border-b border-zinc-800 bg-noir-900/95 px-4 py-3 lg:hidden">
                 <button
                   type="button"
                   onClick={() => setIsMobileSidebarOpen(true)}
                   className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1.5 text-xs font-mono uppercase tracking-[0.22em] text-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
                 >
                   <Menu size={14} />
                   Controls
                 </button>
                 <span className="max-w-[58vw] truncate text-right text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                   {config.fileName ?? 'Loaded MIDI'}
                 </span>
               </div>
            <div className="flex flex-col h-full p-4 lg:p-6">
               <div className="flex-1 min-h-0">
                 <Suspense
                   fallback={
                     <div className="flex h-full items-center justify-center rounded-lg border border-zinc-800 bg-noir-800 text-zinc-400">
                       <div className="flex items-center gap-2 text-sm font-mono">
                         <Loader2 size={16} className="animate-spin text-gold-500" />
                         <span>Loading editor...</span>
                       </div>
                     </div>
                   }
                 >
                   <LazyCodeViewer
                     code={code}
                     durationTagStyle={config.durationTagStyle}
                     isNoteColoringEnabled={config.isNoteColoringEnabled}
                     isProgressiveFillEnabled={config.isProgressiveFillEnabled}
                     isPatternTextColoringEnabled={config.isPatternTextColoringEnabled}
                   />
                 </Suspense>
               </div>
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
