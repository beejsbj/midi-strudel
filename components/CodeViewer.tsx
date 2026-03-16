import React, { useState, useEffect, useRef } from 'react';
import { Copy, ExternalLink, Check, Play, Square, Loader2, AlertTriangle } from 'lucide-react';
import { StrudelMirror } from '@strudel/codemirror';
import { ViewPlugin, DecorationSet, EditorView, Decoration } from '@codemirror/view';
import { RangeSetBuilder, StateEffect } from '@codemirror/state';
import * as StrudelCore from '@strudel/core';
import * as StrudelDraw from '@strudel/draw';
import * as StrudelMini from '@strudel/mini';
import * as StrudelTonal from '@strudel/tonal';
import * as StrudelWebAudio from '@strudel/webaudio';
import { initAudioOnFirstClick, getAudioContext, webaudioOutput, registerSynthSounds } from '@strudel/webaudio';
import { transpiler } from '@strudel/transpiler';
import { registerSoundfonts } from "@strudel/soundfonts";
import {
  highlightPlaybackLocations,
  strudelPlaybackHighlightExtension,
  updatePlaybackHighlightOptions,
  updatePlaybackLocations,
} from './strudelPlaybackHighlight';

const INLINE_META_REGEX = /(?:@[\d.]+|:(?:\d+(?:\.\d+)?))/g;

function buildInlineMetaDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const content = view.state.doc.toString();
  const selection = view.state.selection.main;

  for (const match of content.matchAll(INLINE_META_REGEX)) {
    const from = match.index;
    if (from == null) continue;

    const to = from + match[0].length;
    const isActive = selection.empty
      ? selection.head >= from && selection.head <= to
      : selection.from < to && selection.to > from;

    builder.add(
      from,
      to,
      Decoration.mark({
        class: isActive ? 'cm-inline-meta cm-inline-meta-active' : 'cm-inline-meta',
      }),
    );
  }

  return builder.finish();
}

const inlineMetaPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildInlineMetaDecorations(view);
    }
    update(update: { docChanged: boolean; selectionSet: boolean; view: EditorView }) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = buildInlineMetaDecorations(update.view);
      }
    }
  },
  { decorations: v => v.decorations }
);

interface Props {
  code: string;
  durationTagStyle?: string;
  isNoteColoringEnabled?: boolean;
  isProgressiveFillEnabled?: boolean;
  isPatternTextColoringEnabled?: boolean;
  showCopyButton?: boolean;
  showOpenExternalButton?: boolean;
  playerLabel?: string;
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
  showCopyButton = true,
  showOpenExternalButton = true,
  playerLabel = 'Strudel Player',
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
              const maybeSamples = Reflect.get(StrudelCore as object, 'samples');

              const loadModules = StrudelCore.evalScope(
                Promise.resolve(StrudelCore),
                Promise.resolve(StrudelDraw),
                Promise.resolve(StrudelMini),
                Promise.resolve(StrudelTonal),
                Promise.resolve(StrudelWebAudio),
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
              fontFamily: "IBM Plex Mono, monospace",
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
              inlineMetaPlugin,
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

  // Per-note hover handler for inline meta tags (duration + velocity)
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container || durationTagStyle !== 'hover') return;

    let lastShown: Element | null = null;

    const clearLast = () => {
      if (lastShown) {
        lastShown.classList.remove('cm-inline-meta-hovered');
        lastShown = null;
      }
    };

    const handleMouseOver = (e: MouseEvent) => {
      clearLast();
      const target = e.target as Element;
      if (!target) return;

      if (target.classList?.contains('cm-inline-meta')) {
        target.classList.add('cm-inline-meta-hovered');
        lastShown = target;
        return;
      }
      const next = target.nextElementSibling;
      if (next?.classList.contains('cm-inline-meta')) {
        next.classList.add('cm-inline-meta-hovered');
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
    <div className="flex h-full flex-col overflow-hidden rounded-[8px] border border-[rgba(245,158,11,0.18)] bg-[linear-gradient(180deg,rgba(20,20,20,0.98),rgba(10,10,10,1))] shadow-[0_28px_90px_rgba(0,0,0,0.34)]">
      <div className="border-b border-[rgba(245,158,11,0.16)] bg-[linear-gradient(180deg,rgba(28,28,28,0.96),rgba(16,16,16,0.98))] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-[10px] font-medium uppercase tracking-[0.26em] text-gold-500/70">
              strudel editor
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-zinc-100">{playerLabel}</span>
              {isLoading ? (
                <span className="inline-flex items-center gap-1 rounded-sm border border-[rgba(245,158,11,0.22)] bg-gold-500/10 px-2 py-0.5 text-[11px] text-gold-300 animate-pulse">
                  <Loader2 size={11} className="animate-spin" />
                  Loading engine
                </span>
              ) : audioError ? (
                <span className="inline-flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300">
                  <AlertTriangle size={11} />
                  Audio error
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  Ready
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              disabled={!isReady}
              aria-label={isPlaying ? 'Stop playback' : 'Start playback'}
              className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.18em] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 ${
                isPlaying
                  ? 'border-red-500/50 bg-red-500/12 text-red-300 hover:bg-red-500/18 focus-visible:outline-red-500'
                  : 'border-emerald-500/50 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/18 focus-visible:outline-emerald-500'
              } ${!isReady ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              {isPlaying ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
              <span>{isPlaying ? 'Stop' : 'Play'}</span>
            </button>

            {showCopyButton && (
              <button
                onClick={handleCopy}
                aria-label={copyError ? 'Copy failed — text selected' : copied ? 'Copied!' : 'Copy to clipboard'}
                className={`inline-flex items-center justify-center rounded-sm border px-2.5 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-500 ${
                  copyError
                    ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : 'border-[rgba(245,158,11,0.18)] bg-zinc-900/80 text-zinc-400 hover:border-[rgba(245,158,11,0.34)] hover:text-gold-300'
                }`}
                title={copyError ? 'Copy failed' : 'Copy to clipboard'}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            )}

            {showOpenExternalButton && (
              <button
                onClick={handleOpenStrudel}
                aria-label="Open in Strudel editor"
                className="inline-flex items-center gap-1 rounded-sm border border-[rgba(245,158,11,0.28)] bg-gold-500/12 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.16em] text-gold-200 transition-all hover:bg-gold-500/18 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-400"
              >
                <span>Open in Strudel</span>
                <ExternalLink size={12} />
              </button>
            )}
          </div>
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
        <div role="alert" className="flex items-center space-x-2 px-4 py-2 bg-red-900/40 border-b border-red-800/50 font-mono text-xs text-red-300">
          <AlertTriangle size={12} className="shrink-0" />
          <span className="truncate">{strudelError}</span>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.06),transparent_30%),linear-gradient(180deg,rgba(9,9,9,0.98),rgba(6,6,6,1))] group">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-gold-500/5 to-transparent" />
        <div
          ref={editorContainerRef}
          className="h-full w-full text-sm"
          data-duration-style={durationTagStyle ?? 'sup'}
        />
      </div>
    </div>
  );
};
