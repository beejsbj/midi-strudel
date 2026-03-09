import React, { useState, useEffect, useRef } from 'react';
import { Copy, ExternalLink, Check, Play, Square, Loader2, AlertTriangle } from 'lucide-react';
import { StrudelMirror } from '@strudel/codemirror';
import { MatchDecorator, ViewPlugin, DecorationSet, EditorView, Decoration } from '@codemirror/view';
import { StateEffect, Compartment } from '@codemirror/state';
import * as StrudelCore from '@strudel/core';
import { initAudioOnFirstClick, getAudioContext, webaudioOutput, registerSynthSounds } from '@strudel/webaudio';
import { transpiler } from '@strudel/transpiler';
import { registerSoundfonts } from "@strudel/soundfonts";

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

// Pitch-class hue map for note text coloring
const NOTE_HUES: Record<string, number> = {
  'C': 0, 'C#': 30, 'Db': 30, 'D': 60, 'D#': 90, 'Eb': 90, 'E': 120,
  'F': 150, 'F#': 180, 'Gb': 180, 'G': 210, 'G#': 240, 'Ab': 240,
  'A': 270, 'A#': 300, 'Bb': 300, 'B': 330,
};

const noteDecorator = new MatchDecorator({
  regexp: /\b([A-G][#b]?)(\d)\b/g,
  decoration: (match) => {
    const hue = NOTE_HUES[match[1]] ?? 0;
    return Decoration.mark({ attributes: { style: `color: hsl(${hue}, 70%, 65%)` } });
  },
});

const noteColorPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = noteDecorator.createDeco(view); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update(u: any) { this.decorations = noteDecorator.updateDeco(u, this.decorations); }
  },
  { decorations: v => v.decorations }
);

const noteColorCompartment = new Compartment();

interface Props {
  code: string;
  durationTagStyle?: string;
  isPatternTextColoringEnabled?: boolean;
  isNoteColoringEnabled?: boolean;
}

// Typed interface for the methods we actually call on the editor
interface StrudelEditorInstance {
  getCode?: () => string;
  setCode?: (code: string) => void;
  evaluate?: () => void;
  stop?: () => void;
  destroy?: () => void;
  updateSettings?: (settings: Record<string, unknown>) => void;
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
  isPatternTextColoringEnabled,
  isNoteColoringEnabled,
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
  const observerRef = useRef<MutationObserver | null>(null);

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
          prebake: async () => {
            try {
              initAudioOnFirstClick();

              const loadModules = StrudelCore.evalScope(
                import('@strudel/core'),
                import('@strudel/draw'),
                import('@strudel/mini'),
                import('@strudel/tonal'),
                import('@strudel/webaudio'),
              );

              const promises: Promise<unknown>[] = [loadModules, registerSynthSounds(), registerSoundfonts()];

              if (typeof StrudelCore.samples === 'function') {
                  for (const file of SAMPLE_JSON_FILES) {
                      promises.push(StrudelCore.samples(`${DATA_SOURCES_BASE}${file}`));
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
              noteColorCompartment.of([]),
            ])
          });
        }
      } catch (err) {
        console.error("Failed to init Strudel", err);
        setAudioError("Audio engine failed to load. Try refreshing.");
        setIsLoading(false);
      }
    };

    initStrudel();

    return () => {
       if (observerRef.current) {
           observerRef.current.disconnect();
           observerRef.current = null;
       }
       if (editorRef.current) {
           try {
             if (typeof editorRef.current.stop === 'function') {
                 editorRef.current.stop();
             }
             if (typeof editorRef.current.destroy === 'function') {
                 editorRef.current.destroy();
             }
           } catch(e) { console.error("Error destroying editor", e) }
           editorRef.current = null;
       }
    };
  }, []);

  // Toggle note text coloring via Compartment reconfigure
  useEffect(() => {
    if (!editorRef.current) return;
    const cmView = editorRef.current.editor ?? (editorRef.current.view as EditorView | undefined);
    if (!cmView) return;
    cmView.dispatch({
      effects: noteColorCompartment.reconfigure(isPatternTextColoringEnabled ? noteColorPlugin : [])
    });
  }, [isPatternTextColoringEnabled]);

  // MutationObserver for runtime note coloring (sets --note-value on .strudel-mark)
  useEffect(() => {
    if (!editorContainerRef.current) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (!isNoteColoringEnabled) return;

    const NOTE_RE = /([A-G][#b]?)(\d)/;
    const PITCH_CLASS: Record<string, number> = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4,
      'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8,
      'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
    };

    const applyNoteProps = (el: HTMLElement) => {
      const text = el.textContent || '';
      const m = text.match(NOTE_RE);
      if (m) {
        const pc = PITCH_CLASS[m[1]] ?? 0;
        const octave = parseInt(m[2], 10);
        const midiNum = pc + octave * 12 + 12;
        el.style.setProperty('--note-value', String(midiNum));
      }
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            if (node.classList.contains('strudel-mark')) {
              applyNoteProps(node);
            }
            node.querySelectorAll<HTMLElement>('.strudel-mark').forEach(applyNoteProps);
          }
        }
        if (
          mutation.type === 'attributes' &&
          mutation.target instanceof HTMLElement &&
          mutation.target.classList.contains('strudel-mark')
        ) {
          applyNoteProps(mutation.target);
        }
      }
    });

    observer.observe(editorContainerRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [isNoteColoringEnabled]);

  // Sync code prop updates to editor
  useEffect(() => {
    if (editorRef.current && code) {
        setEditorContent(code);
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
          data-duration-style={durationTagStyle ?? 'sub'}
        />
      </div>
    </div>
  );
};
