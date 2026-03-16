import { useCallback, useEffect, useRef, useState } from 'react';
import { StrudelMirror } from '@strudel/codemirror';
import { EditorView, Decoration, DecorationSet, ViewPlugin } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, Text } from '@codemirror/state';
import * as StrudelCore from '@strudel/core';
import * as StrudelDraw from '@strudel/draw';
import * as StrudelMini from '@strudel/mini';
import * as StrudelTonal from '@strudel/tonal';
import * as StrudelWebAudio from '@strudel/webaudio';
import {
  getAudioContext,
  initAudioOnFirstClick,
  registerSynthSounds,
  webaudioOutput,
} from '@strudel/webaudio';
import { registerSoundfonts } from '@strudel/soundfonts';
import { transpiler } from '@strudel/transpiler';
import {
  collectActivePlaybackRanges,
  highlightPlaybackLocations,
  strudelPlaybackHighlightExtension,
  updatePlaybackHighlightOptions,
} from '../strudelPlaybackHighlight';

const DATA_SOURCES_BASE = 'https://raw.githubusercontent.com/felixroos/dough-samples/main/';
const SAMPLE_JSON_FILES = [
  'tidal-drum-machines.json',
  'piano.json',
  'Dirt-Samples.json',
  'EmuSP12.json',
  'vcsl.json',
  'mridangam.json',
];
const INLINE_META_REGEX = /(?:@[\d.]+|:(?:\d+(?:\.\d+)?))/g;

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
  editor?: EditorView;
  view?: {
    state?: { doc?: { toString: () => string; length: number } };
    dispatch: (tx: unknown) => void;
  };
}

interface UseStrudelEditorOptions {
  code: string;
  durationTagStyle?: string;
  isNoteColoringEnabled?: boolean;
  isProgressiveFillEnabled?: boolean;
  isPatternTextColoringEnabled?: boolean;
}

type InlineMetaToken = {
  from: number;
  to: number;
};

type HapLike = Parameters<typeof collectActivePlaybackRanges>[0][number];

function extractInlineMetaTokens(doc: Text): InlineMetaToken[] {
  const tokens: InlineMetaToken[] = [];
  const content = doc.toString();

  for (const match of content.matchAll(INLINE_META_REGEX)) {
    const from = match.index;
    if (from == null) continue;

    tokens.push({
      from,
      to: from + match[0].length,
    });
  }

  return tokens;
}

function buildInlineMetaDecorations(
  tokens: InlineMetaToken[],
  selection: EditorView['state']['selection']['main'],
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const token of tokens) {
    const isActive = selection.empty
      ? selection.head >= token.from && selection.head <= token.to
      : selection.from < token.to && selection.to > token.from;

    builder.add(
      token.from,
      token.to,
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
    tokens: InlineMetaToken[];

    constructor(view: EditorView) {
      this.tokens = extractInlineMetaTokens(view.state.doc);
      this.decorations = buildInlineMetaDecorations(this.tokens, view.state.selection.main);
    }

    update(update: { docChanged: boolean; selectionSet: boolean; view: EditorView }) {
      if (update.docChanged) {
        this.tokens = extractInlineMetaTokens(update.view.state.doc);
      }

      if (update.docChanged || update.selectionSet) {
        this.decorations = buildInlineMetaDecorations(this.tokens, update.view.state.selection.main);
      }
    }
  },
  { decorations: (view) => view.decorations },
);

function getTimeValue(value: number | { valueOf(): number } | undefined) {
  return typeof value === 'number' ? value : (value?.valueOf() ?? 0);
}

function getPlaybackSignature(
  atTime: number | { valueOf(): number },
  haps: HapLike[],
  isProgressiveFillEnabled: boolean,
) {
  const ranges = collectActivePlaybackRanges(haps);

  if (!ranges.length) {
    return {
      ranges,
      signature: 'empty',
    };
  }

  const currentTime = getTimeValue(atTime);
  const signature = ranges
    .map((range) => {
      if (!isProgressiveFillEnabled) {
        return `${range.start}:${range.end}`;
      }

      const duration = getTimeValue(range.duration);
      if (!duration) {
        return `${range.start}:${range.end}:360`;
      }

      const begin = getTimeValue(range.begin);
      const progress = Math.max(0, Math.min(1, (currentTime - begin) / duration));
      return `${range.start}:${range.end}:${Math.round(progress * 360)}`;
    })
    .join('|');

  return { ranges, signature };
}

export function useStrudelEditor({
  code,
  durationTagStyle,
  isNoteColoringEnabled,
  isProgressiveFillEnabled,
  isPatternTextColoringEnabled,
}: UseStrudelEditorOptions) {
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [strudelError, setStrudelError] = useState<string | null>(null);

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<StrudelEditorInstance | null>(null);
  const audioReadyPromiseRef = useRef<Promise<void> | null>(null);
  const highlightOptionsRef = useRef({
    isNoteColoringEnabled: Boolean(isNoteColoringEnabled),
    isProgressiveFillEnabled: Boolean(isProgressiveFillEnabled),
    isPatternTextColoringEnabled: Boolean(isPatternTextColoringEnabled),
  });
  const latestCodeRef = useRef(code);
  const previousCodeRef = useRef(code);
  const isPlayingRef = useRef(false);
  const playbackSignatureRef = useRef('uninitialized');

  useEffect(() => {
    latestCodeRef.current = code;
  }, [code]);

  useEffect(() => {
    highlightOptionsRef.current = {
      isNoteColoringEnabled: Boolean(isNoteColoringEnabled),
      isProgressiveFillEnabled: Boolean(isProgressiveFillEnabled),
      isPatternTextColoringEnabled: Boolean(isPatternTextColoringEnabled),
    };
  }, [isNoteColoringEnabled, isPatternTextColoringEnabled, isProgressiveFillEnabled]);

  const getEditorContent = useCallback(() => {
    if (!editorRef.current) return '';
    if (typeof editorRef.current.getCode === 'function') {
      return editorRef.current.getCode();
    }

    const cmView = editorRef.current.editor ?? (editorRef.current.view as EditorView | undefined);
    if (cmView?.state?.doc) {
      return cmView.state.doc.toString();
    }

    return '';
  }, []);

  const setEditorContent = useCallback((newCode: string) => {
    if (!editorRef.current) return;

    const current = getEditorContent();
    if (current === newCode) return;

    if (typeof editorRef.current.setCode === 'function') {
      editorRef.current.setCode(newCode);
      return;
    }

    const cmView = editorRef.current.editor ?? (editorRef.current.view as EditorView | undefined);
    if (cmView) {
      cmView.dispatch({ changes: { from: 0, to: current.length, insert: newCode } });
    }
  }, [getEditorContent]);

  const ensureAudioReady = useCallback(async () => {
    if (isReady) {
      return;
    }

    if (audioReadyPromiseRef.current) {
      await audioReadyPromiseRef.current;
      return;
    }

    const initPromise = (async () => {
      setAudioError(null);

      try {
        initAudioOnFirstClick();
        const maybeSamples = Reflect.get(StrudelCore as object, 'samples');
        const promises: Promise<unknown>[] = [
          StrudelCore.evalScope(
            Promise.resolve(StrudelCore),
            Promise.resolve(StrudelDraw),
            Promise.resolve(StrudelMini),
            Promise.resolve(StrudelTonal),
            Promise.resolve(StrudelWebAudio),
          ),
          registerSynthSounds(),
          registerSoundfonts(),
        ];

        if (typeof maybeSamples === 'function') {
          for (const file of SAMPLE_JSON_FILES) {
            promises.push((maybeSamples as (url: string) => Promise<unknown>)(`${DATA_SOURCES_BASE}${file}`));
          }
        }

        await Promise.all(promises);
        setIsReady(true);
        setIsLoading(false);
      } catch (err) {
        audioReadyPromiseRef.current = null;
        console.error('Prebake error:', err);
        setAudioError('Audio failed to initialize. Try refreshing.');
        setIsLoading(false);
        throw err;
      }
    })();

    audioReadyPromiseRef.current = initPromise;
    await initPromise;
  }, [isReady]);

  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container || editorRef.current) return;

    container.replaceChildren();

    const initStrudel = async () => {
      try {
        const editor = new StrudelMirror({
          defaultOutput: webaudioOutput,
          getTime: () => getAudioContext().currentTime,
          prebake: ensureAudioReady,
          transpiler,
          root: container,
          initialCode: latestCodeRef.current || '// Waiting for MIDI...',
          onCode: () => {
            // Editor remains source-of-truth locally after init.
          },
          onError: (error: unknown) => {
            console.error('Strudel error:', error);
            setStrudelError(String(error));
            setIsPlaying(false);
          },
          onDraw: (
            haps: Array<{
              isActive?: (time: unknown) => boolean;
              context?: { locations?: Array<{ start: number; end: number }> };
              whole?: { begin: number | { valueOf(): number }; duration: number | { valueOf(): number } };
            }>,
            time: unknown,
            painters?: Array<(context: unknown, drawTime: unknown, drawHaps: unknown[], range: [number, number]) => void>,
          ) => {
            const activeHaps = haps.filter((hap) => hap?.isActive?.(time));
            const mirror = editorRef.current;
            const cmView = mirror?.editor ?? (mirror?.view as EditorView | undefined);
            if (cmView) {
              const { ranges, signature } = getPlaybackSignature(
                time as number | { valueOf(): number },
                activeHaps,
                highlightOptionsRef.current.isProgressiveFillEnabled,
              );

              if (signature !== playbackSignatureRef.current) {
                playbackSignatureRef.current = signature;
                highlightPlaybackLocations(cmView, time as number | { valueOf(): number }, ranges);
              }
            }

            painters?.forEach((painter) =>
              painter(mirror?.drawContext, time, haps, mirror?.drawTime ?? [0, 0]),
            );
          },
          onToggle: (started: boolean) => {
            if (!started) {
              playbackSignatureRef.current = 'stopped';
              const cmView = editorRef.current?.editor ?? (editorRef.current?.view as EditorView | undefined);
              if (cmView) {
                highlightPlaybackLocations(cmView, 0, []);
              }
            }
          },
        }) as StrudelEditorInstance;

        if (editor.updateSettings) {
          editor.updateSettings({
            fontSize: 13,
            fontFamily: 'IBM Plex Mono, monospace',
            theme: 'dark',
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

        const cmView = editor.editor ?? (editor.view as EditorView | undefined);
        if (cmView) {
          cmView.dispatch({
            effects: StateEffect.appendConfig.of([
              inlineMetaPlugin,
              strudelPlaybackHighlightExtension,
            ]),
          });

          updatePlaybackHighlightOptions(cmView, {
            ...highlightOptionsRef.current,
          });
        }

        if (latestCodeRef.current) {
          setEditorContent(latestCodeRef.current);
        }
      } catch (err) {
        console.error('Failed to init Strudel', err);
        setAudioError('Audio engine failed to load. Try refreshing.');
        setIsLoading(false);
      }
    };

    void initStrudel();

    return () => {
      if (editorRef.current) {
        try {
          editorRef.current.stop?.();
          editorRef.current.clear?.();
          editorRef.current.destroy?.();
        } catch (err) {
          console.error('Error destroying editor', err);
        }

        editorRef.current = null;
      }

      container?.replaceChildren();
    };
  }, [setEditorContent]);

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

    const handleMouseOver = (event: MouseEvent) => {
      clearLast();
      const target = event.target as Element | null;
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
      ...highlightOptionsRef.current,
    });
  }, [isNoteColoringEnabled, isPatternTextColoringEnabled, isProgressiveFillEnabled]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const previousCode = previousCodeRef.current;
    previousCodeRef.current = code;

    if (!editorRef.current || !code || previousCode === code) return;

    playbackSignatureRef.current = 'code-updated';
    setEditorContent(code);

    if (isPlayingRef.current) {
      try {
        editorRef.current.evaluate?.();
      } catch (err) {
        console.error('Failed to re-evaluate updated code', err);
      }
    }
  }, [code, setEditorContent]);

  const togglePlay = useCallback(() => {
    if (!editorRef.current) return;

    const runToggle = async () => {
      try {
        if (isPlayingRef.current) {
          editorRef.current?.stop?.();
          setIsPlaying(false);
          return;
        }

        setStrudelError(null);
        await ensureAudioReady();
        editorRef.current?.evaluate?.();
        setIsPlaying(true);
      } catch (err) {
        console.error('Playback error:', err);
        setIsPlaying(false);
      }
    };

    void runToggle();
  }, [ensureAudioReady]);

  return {
    audioError,
    editorContainerRef,
    getEditorContent,
    isLoading,
    isPlaying,
    isReady,
    strudelError,
    togglePlay,
  };
}
