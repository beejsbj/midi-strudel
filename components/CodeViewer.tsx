import React, { useState, useEffect, useRef } from 'react';
import { Copy, ExternalLink, Check, Play, Square, Loader2, AlertTriangle } from 'lucide-react';
import { StrudelMirror } from '@strudel/codemirror';
import { MatchDecorator, ViewPlugin, DecorationSet, EditorView, Decoration } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';
import * as StrudelCore from '@strudel/core';
import { initAudioOnFirstClick, getAudioContext, webaudioOutput, registerSynthSounds } from '@strudel/webaudio';
import { transpiler } from '@strudel/transpiler';
import { registerSoundfonts } from "@strudel/soundfonts";
import {
  highlightPlaybackLocations,
  strudelPlaybackHighlightExtension,
  updatePlaybackHighlightOptions,
  updatePlaybackLocations,
} from './strudelPlaybackHighlight';

// CodeMirror decoration that dims @duration annotations (e.g. @0.25, @1.5)
const durationDecorator = new MatchDecorator({
  regexp: /@[\d.]+/g,
  decoration: Decoration.mark({ class: 'cm-at-duration' }),
});
const durationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = durationDecorator.createDeco(view); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update(u: any) { this.decorations = durationDecorator.updateDeco(u, this.decorations); }
  },
  { decorations: v => v.decorations }
);

interface Props {
  code: string;
  durationTagStyle?: string;
  isNoteColoringEnabled?: boolean;
  isProgressiveFillEnabled?: boolean;
  isPatternTextColoringEnabled?: boolean;
}

// Typed interface for the methods we actually call on the editor
interface StrudelEditorInstance {
  getCode?: () => string;
  setCode?: (code: string) => void;
  evaluate?: () => void;
  stop?: () => void;
  clear?: () => void;
  destroy?: () => void;
  updateSettings?: (settings: Record<string, unknown>) => void;
  drawContext?: unknown;
  drawTime?: [number, number];
  // The underlying CodeMirror EditorView (StrudelMirror stores it as .editor)
  editor?: EditorView;
  // Legacy fallback name
  view?: {
    state?: { doc?: { toString: () => string; length: number } };
    dispatch: (tx: unknown) => void;
  };
}

const DATA_SOURCES_BASE = "https://raw.githubusercontent.com/felixroos/dough-samples/main/";
const SAMPLE_JSON_FILES = [
  "tidal-drum-machines.json",
  "piano.json",
  "Dirt-Samples.json",
  "EmuSP12.json",
  "vcsl.json",
  "mridangam.json",
];

export const CodeViewer: React.FC<Props> = ({
  code,
  durationTagStyle,
  isNoteColoringEnabled,
  isProgressiveFillEnabled,
  isPatternTextColoringEnabled,
}) => {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [strudelError, setStrudelError] = useState<string | null>(null);

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<StrudelEditorInstance | null>(null);
  const latestCodeRef = useRef(code);
  const previousCodeRef = useRef(code);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    latestCodeRef.current = code;
  }, [code]);

  // Helper to safely access code from the editor instance
  const getEditorContent = () => {
    if (!editorRef.current) return '';
    if (typeof editorRef.current.getCode === 'function') {
      return editorRef.current.getCode();
    }
    // Fallback: read from the underlying CodeMirror EditorView
    const cmView = editorRef.current.editor ?? (editorRef.current.view as EditorView | undefined);
    if (cmView?.state?.doc) {
      return cmView.state.doc.toString();
    }
    return '';
  };

  // Helper to safely set code on the editor instance
  const setEditorContent = (newCode: string) => {
    if (!editorRef.current) return;

    const current = getEditorContent();
    if (current === newCode) return;

    if (typeof editorRef.current.setCode === 'function') {
        editorRef.current.setCode(newCode);
        return;
    }

    // CM6 Fallback
    const cmView = editorRef.current.editor ?? (editorRef.current.view as EditorView | undefined);
    if (cmView) {
        cmView.dispatch({ changes: { from: 0, to: current?.length ?? 0, insert: newCode } });
    }
  };

  useEffect(() => {
    if (!editorContainerRef.current) return;
    if (editorRef.current) return;

    editorContainerRef.current.replaceChildren();

    const initStrudel = async () => {
      try {
        const editor = new StrudelMirror({
          defaultOutput: webaudioOutput,
          getTime: () => getAudioContext().currentTime,
          transpiler,
          root: editorContainerRef.current!,
          initialCode: code || "// Waiting for MIDI...",
          onCode: (_newCode: string) => {
            // Optional: can sync back to parent if needed
          },
          onError: (error: unknown) => {
            console.error("Strudel error:", error);
            setStrudelError(String(error));
            setIsPlaying(false);
          },
          afterEval: (options: { meta?: { miniLocations?: [number, number][] } }) => {
            const cmView = editorRef.current?.editor ?? (editorRef.current?.view as EditorView | undefined);
            if (cmView) {
              updatePlaybackLocations(cmView, options.meta?.miniLocations ?? []);
            }
          },
          onDraw: (haps: Array<{ isActive?: (time: unknown) => boolean; context?: { locations?: Array<{ start: number; end: number }> }; whole?: { begin: number | { valueOf(): number }; duration: number | { valueOf(): number } } }>, time: unknown, painters?: Array<(context: unknown, drawTime: unknown, drawHaps: unknown[], range: [number, number]) => void>) => {
            const activeHaps = haps.filter((hap) => hap?.isActive?.(time));
            const mirror = editorRef.current;
            const cmView = mirror?.editor ?? (mirror?.view as EditorView | undefined);
            if (cmView) {
              highlightPlaybackLocations(cmView, time as number | { valueOf(): number }, activeHaps);
            }
            painters?.forEach((painter) =>
              painter(mirror?.drawContext, time, haps, mirror?.drawTime ?? [0, 0]),
            );
          },
          onToggle: (started: boolean) => {
            if (!started) {
              const cmView = editorRef.current?.editor ?? (editorRef.current?.view as EditorView | undefined);
              if (cmView) {
                highlightPlaybackLocations(cmView, 0, []);
              }
            }
          },
          prebake: async () => {
            try {
              initAudioOnFirstClick();
              const coreModule = await import('@strudel/core');
              const maybeSamples = (coreModule as Record<string, unknown>).samples;

              const loadModules = StrudelCore.evalScope(
                Promise.resolve(coreModule),
                import('@strudel/draw'),
                import('@strudel/mini'),
                import('@strudel/tonal'),
                import('@strudel/webaudio'),
              );

              const promises: Promise<unknown>[] = [loadModules, registerSynthSounds(), registerSoundfonts()];

              if (typeof maybeSamples === 'function') {
                  for (const file of SAMPLE_JSON_FILES) {
                      promises.push((maybeSamples as (url: string) => Promise<unknown>)(`${DATA_SOURCES_BASE}${file}`));
                  }
              }

              await Promise.all(promises);
              setIsReady(true);
              setIsLoading(false);
            } catch (e) {
              console.error("Prebake error:", e);
              setAudioError("Audio failed to initialize. Try refreshing.");
              setIsLoading(false);
            }
          },
        }) as StrudelEditorInstance;

        if (editor.updateSettings) {
          editor.updateSettings({
              fontSize: 13,
              fontFamily: "JetBrains Mono, monospace",
              theme: "dark",
              isLineNumbersDisplayed: true,
              isActiveLineHighlighted: true,
              isBracketMatchingEnabled: true,
              isLineWrappingEnabled: true,
              isBracketClosingEnabled: true,
              isAutoCompletionEnabled: true,
              isPatternHighlightingEnabled: true,
              isFlashEnabled: true,
              isTooltipEnabled: true,
              isTabIndentationEnabled: true,
              isMultiCursorEnabled: true,
          });
        }

        editorRef.current = editor;

        // Inject decoration extensions
        const cmView = editor.editor ?? (editor.view as EditorView | undefined);
        if (cmView) {
          cmView.dispatch({
            effects: StateEffect.appendConfig.of([
              durationPlugin,
              strudelPlaybackHighlightExtension,
            ])
          });
          updatePlaybackHighlightOptions(cmView, {
            isNoteColoringEnabled: Boolean(isNoteColoringEnabled),
            isProgressiveFillEnabled: Boolean(isProgressiveFillEnabled),
            isPatternTextColoringEnabled: Boolean(isPatternTextColoringEnabled),
          });
        }

        if (latestCodeRef.current) {
          setEditorContent(latestCodeRef.current);
        }
      } catch (err) {
        console.error("Failed to init Strudel", err);
        setAudioError("Audio engine failed to load. Try refreshing.");
        setIsLoading(false);
      }
    };

    initStrudel();

    return () => {
       const container = editorContainerRef.current;
       if (editorRef.current) {
           try {
              if (typeof editorRef.current.stop === 'function') {
                  editorRef.current.stop();
              }
              if (typeof editorRef.current.clear === 'function') {
                  editorRef.current.clear();
              }
              if (typeof editorRef.current.destroy === 'function') {
                  editorRef.current.destroy();
              }
           } catch(e) { console.error("Error destroying editor", e) }
           editorRef.current = null;
       }
       container?.replaceChildren();
    };
  }, []);

  // Per-note hover handler for duration tags (reveals .cm-at-duration on adjacent note hover)
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container || durationTagStyle !== 'hover') return;

    let lastShown: Element | null = null;

    const clearLast = () => {
      if (lastShown) {
        lastShown.classList.remove('cm-duration-hovered');
        lastShown = null;
      }
    };

    const handleMouseOver = (e: MouseEvent) => {
      clearLast();
      const target = e.target as Element;
      if (!target) return;

      // If we hovered the duration tag itself, show it
      if (target.classList?.contains('cm-at-duration')) {
        target.classList.add('cm-duration-hovered');
        lastShown = target;
        return;
      }
      // Otherwise show the immediately following duration tag (if any)
      const next = target.nextElementSibling;
      if (next?.classList.contains('cm-at-duration')) {
        next.classList.add('cm-duration-hovered');
        lastShown = next;
      }
    };

    const handleMouseLeave = () => clearLast();

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [durationTagStyle]);

  useEffect(() => {
    const cmView = editorRef.current?.editor ?? (editorRef.current?.view as EditorView | undefined);
    if (!cmView) return;

    updatePlaybackHighlightOptions(cmView, {
      isNoteColoringEnabled: Boolean(isNoteColoringEnabled),
      isProgressiveFillEnabled: Boolean(isProgressiveFillEnabled),
      isPatternTextColoringEnabled: Boolean(isPatternTextColoringEnabled),
    });
  }, [isNoteColoringEnabled, isProgressiveFillEnabled, isPatternTextColoringEnabled]);

  // Keep isPlayingRef in sync so the code-sync effect can read current value without being a dep
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Sync code prop updates to editor — only when the generated code actually changes,
  // NOT when isPlaying changes (which would wipe user edits on Play click)
  useEffect(() => {
    const previousCode = previousCodeRef.current;
    previousCodeRef.current = code;

    if (!editorRef.current || !code) return;
    if (previousCode === code) return;

    setEditorContent(code);

    if (isPlayingRef.current && typeof editorRef.current.evaluate === 'function') {
      try {
        editorRef.current.evaluate();
      } catch (err) {
        console.error('Failed to re-evaluate updated code', err);
      }
    }
  }, [code]);

  const handleCopy = async () => {
    const currentCode = getEditorContent() || code;
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — fall back to selecting the text in the editor
      setCopyError(true);
      setTimeout(() => setCopyError(false), 2000);
      try {
        const selection = window.getSelection();
        if (selection && editorContainerRef.current) {
          const range = document.createRange();
          range.selectNodeContents(editorContainerRef.current);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } catch {
        // Selection also unavailable — nothing more we can do
      }
    }
  };

  const handleOpenStrudel = () => {
    const currentCode = getEditorContent() || code;
    try {
      const encoded = btoa(unescape(encodeURIComponent(currentCode)));
      const url = `https://strudel.cc/#${encoded}`;
      window.open(url, "_blank");
    } catch (err) {
      console.error("Failed to encode code for Strudel URL:", err);
      // Show a brief message — open plain URL as fallback
      window.open("https://strudel.cc/", "_blank");
    }
  };

  const togglePlay = () => {
      if (!editorRef.current) return;

      try {
        if (isPlaying) {
            if (typeof editorRef.current.stop === 'function') {
                editorRef.current.stop();
            }
            setIsPlaying(false);
        } else {
            setStrudelError(null);
            if (typeof editorRef.current.evaluate === 'function') {
                editorRef.current.evaluate();
            }
            setIsPlaying(true);
        }
      } catch (err) {
        console.error("Playback error:", err);
        setIsPlaying(false);
      }
  };

  return (
    <div className="flex flex-col h-full bg-noir-800 border border-zinc-800 rounded-lg overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-4 py-2 bg-noir-900 border-b border-zinc-800">
        <div className="flex space-x-2 items-center">
          <div className="flex space-x-1.5 mr-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
          </div>
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest hidden sm:block">Strudel Player</span>

          {isLoading ? (
             <span className="flex items-center space-x-1 text-xs text-gold-500 animate-pulse ml-2">
                <Loader2 size={12} className="animate-spin" />
                <span>Loading Engine...</span>
             </span>
          ) : audioError ? (
             <span className="flex items-center space-x-1 text-xs text-red-400 ml-2">
                <AlertTriangle size={12} />
                <span>Audio Error</span>
             </span>
          ) : (
             <span className="text-xs text-green-500/80 ml-2">Ready</span>
          )}
        </div>

        <div className="flex items-center space-x-2">
            <button
                onClick={togglePlay}
                disabled={!isReady}
                aria-label={isPlaying ? 'Stop playback' : 'Start playback'}
                className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold uppercase rounded transition-all shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 ${
                    isPlaying
                    ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/50 focus-visible:outline-red-500'
                    : 'bg-green-500/10 text-green-500 hover:bg-green-500/20 border border-green-500/50 focus-visible:outline-green-500'
                } ${!isReady ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                {isPlaying ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                <span>{isPlaying ? 'Stop' : 'Play'}</span>
            </button>

            <div className="w-px h-4 bg-zinc-800 mx-1" />

            <button
                onClick={handleCopy}
                aria-label={copyError ? 'Copy failed — text selected' : copied ? 'Copied!' : 'Copy to clipboard'}
                className={`p-1.5 transition-colors rounded hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-500 ${copyError ? 'text-red-400' : 'text-zinc-400 hover:text-gold-400'}`}
                title={copyError ? 'Copy failed' : 'Copy to clipboard'}
            >
                {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <button
                onClick={handleOpenStrudel}
                aria-label="Open in Strudel editor"
                className="flex items-center space-x-1 px-3 py-1.5 bg-gold-600 text-white text-xs font-bold uppercase rounded hover:bg-gold-500 transition-all shadow-lg shadow-gold-600/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-400"
            >
                <span>Open External</span>
                <ExternalLink size={12} />
            </button>
        </div>
      </div>

      {/* Audio error inline message */}
      {audioError && (
        <div role="alert" className="flex items-center space-x-2 px-4 py-2 bg-red-900/40 border-b border-red-800/50 text-red-300 text-xs">
          <AlertTriangle size={12} />
          <span>{audioError}</span>
        </div>
      )}

      {/* Strudel pattern evaluation error */}
      {strudelError && (
        <div role="alert" className="flex items-center space-x-2 px-4 py-2 bg-red-900/40 border-b border-red-800/50 text-red-300 text-xs font-mono">
          <AlertTriangle size={12} className="shrink-0" />
          <span className="truncate">{strudelError}</span>
        </div>
      )}

      <div className="flex-1 relative bg-noir-900 overflow-hidden group">
        <div
          ref={editorContainerRef}
          className="h-full w-full text-sm"
          data-duration-style={durationTagStyle ?? 'sup'}
        />
      </div>
    </div>
  );
};
