import {
  RangeSetBuilder,
  StateEffect,
  StateField,
  Text,
} from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { isNote, tokenizeNote } from '@strudel/core';

type NumericLike = number | { valueOf(): number };

type PlaybackHighlightOptions = {
  isNoteColoringEnabled: boolean;
  isProgressiveFillEnabled: boolean;
  isPatternTextColoringEnabled: boolean;
};

type HapLike = {
  context?: {
    locations?: Array<{ start: number; end: number }>;
  };
  whole?: {
    begin: NumericLike;
    duration: NumericLike;
  };
};

type NoteToken = {
  from: number;
  to: number;
  note: string;
  color: string;
};

export type ActivePlaybackRange = {
  start: number;
  end: number;
  begin?: NumericLike;
  duration?: NumericLike;
};

const defaultOptions: PlaybackHighlightOptions = {
  isNoteColoringEnabled: false,
  isProgressiveFillEnabled: false,
  isPatternTextColoringEnabled: false,
};

const setPlaybackOptions =
  StateEffect.define<Partial<PlaybackHighlightOptions>>();
const setActivePlayback = StateEffect.define<{
  atTime: NumericLike;
  ranges: ActivePlaybackRange[];
}>();

export const updatePlaybackHighlightOptions = (
  view: EditorView,
  options: Partial<PlaybackHighlightOptions>,
) => {
  view.dispatch({ effects: setPlaybackOptions.of(options) });
};

export const collectActivePlaybackRanges = (haps: HapLike[]): ActivePlaybackRange[] => {
  const ranges: ActivePlaybackRange[] = [];

  for (const hap of haps) {
    if (!hap.context?.locations?.length) {
      continue;
    }

    for (const location of hap.context.locations) {
      ranges.push({
        start: location.start,
        end: location.end,
        begin: hap.whole?.begin,
        duration: hap.whole?.duration,
      });
    }
  }

  return ranges.sort((left, right) => left.start - right.start || left.end - right.end);
};

export const highlightPlaybackLocations = (
  view: EditorView,
  atTime: NumericLike,
  ranges: ActivePlaybackRange[],
) => {
  view.dispatch({ effects: setActivePlayback.of({ atTime, ranges }) });
};

const playbackOptions = StateField.define<PlaybackHighlightOptions>({
  create() {
    return defaultOptions;
  },
  update(options, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setPlaybackOptions)) {
        return { ...options, ...effect.value };
      }
    }

    return options;
  },
});

const activePlayback = StateField.define<{
  atTime: NumericLike;
  ranges: ActivePlaybackRange[];
}>({
  create() {
    return { atTime: 0, ranges: [] };
  },
  update(active, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setActivePlayback)) {
        return effect.value;
      }
    }

    return active;
  },
});

const noteTokens = StateField.define<NoteToken[]>({
  create(state) {
    return extractNoteTokens(state.doc);
  },
  update(tokens, tr) {
    return tr.docChanged ? extractNoteTokens(tr.newDoc) : tokens;
  },
});

const passiveNoteDecorations = EditorView.decorations.compute(
  [noteTokens, playbackOptions],
  (state) => {
    const tokens = state.field(noteTokens);
    const options = state.field(playbackOptions);
    const builder = new RangeSetBuilder<Decoration>();

    if (!options.isNoteColoringEnabled) {
      return builder.finish();
    }

    for (const token of tokens) {
      builder.add(
        token.from,
        token.to,
        Decoration.mark({
          attributes: {
            'data-strudel-note-color': token.color,
            style: `--strudel-note-color: ${token.color}; color: ${token.color};`,
          },
        }),
      );
    }

    return builder.finish();
  },
);

const activeNoteDecorations = EditorView.decorations.compute(
  [noteTokens, playbackOptions, activePlayback],
  (state) => {
    const tokens = state.field(noteTokens);
    const options = state.field(playbackOptions);
    const { atTime, ranges } = state.field(activePlayback);
    const builder = new RangeSetBuilder<Decoration>();
    const decoratedTokens = new Set<string>();
    let tokenIndex = 0;

    for (const range of ranges) {
      while (tokenIndex < tokens.length && tokens[tokenIndex].to <= range.start) {
        tokenIndex++;
      }

      let scanIndex = tokenIndex;
      while (scanIndex < tokens.length && tokens[scanIndex].from < range.end) {
        const token = tokens[scanIndex];
        if (token.to > range.start) {
          const key = `${token.from}:${token.to}`;
          if (!decoratedTokens.has(key)) {
            decoratedTokens.add(key);

            const color = options.isNoteColoringEnabled
              ? token.color
              : 'var(--foreground)';
            const style = buildActiveNoteStyle(
              color,
              atTime,
              range,
              options.isProgressiveFillEnabled,
              options.isPatternTextColoringEnabled,
            );

            builder.add(
              token.from,
              token.to,
              Decoration.mark({
                attributes: {
                  class: 'cm-note-playing',
                  'data-strudel-active-note': 'true',
                  style,
                },
              }),
            );
          }
        }

        scanIndex++;
      }
    }

    return builder.finish();
  },
);

export const strudelPlaybackHighlightExtension = [
  playbackOptions,
  activePlayback,
  noteTokens,
  passiveNoteDecorations,
  activeNoteDecorations,
];

function extractNoteTokens(doc: Text) {
  const tokens: NoteToken[] = [];
  const content = doc.toString();
  const noteRegex = /\b[a-gA-G](?:[#bsf]+)?\d\b/g;

  for (const match of content.matchAll(noteRegex)) {
    const note = match[0];
    const from = match.index;

    if (from == null || !isNote(note)) {
      continue;
    }

    const color = noteToHslColor(note);

    if (!color) {
      continue;
    }

    tokens.push({
      from,
      to: from + note.length,
      note,
      color,
    });
  }

  return tokens;
}

function buildActiveNoteStyle(
  color: string,
  atTime: NumericLike,
  range: ActivePlaybackRange,
  isProgressiveFillEnabled: boolean,
  isPatternTextColoringEnabled: boolean,
) {
  const progressDegrees = isProgressiveFillEnabled
    ? getProgressDegrees(atTime, range)
    : 360;
  const fillStyle = isProgressiveFillEnabled
    ? `background-image: conic-gradient(from 0deg at 50% 50%, ${toTransparentColor(
        color,
      )} 0deg ${progressDegrees}deg, transparent ${progressDegrees}deg 360deg);`
    : `background-color: ${toTransparentColor(color)};`;

  const textColorStyle = isPatternTextColoringEnabled
    ? buildContrastTextStyle(color)
    : '';

  return [
    `--strudel-note-color: ${color}`,
    fillStyle,
    `box-shadow: inset 0 0 0 1px ${toOutlineColor(color)}`,
    'background-repeat: no-repeat',
    'background-position: center',
    textColorStyle,
  ]
    .filter(Boolean)
    .join('; ');
}

function getProgressDegrees(atTime: NumericLike, range: ActivePlaybackRange) {
  const duration = getTimeValue(range.duration);
  if (!duration) {
    return 360;
  }

  const currentTime = getTimeValue(atTime);
  const start = getTimeValue(range.begin);
  const progress = Math.max(0, Math.min(1, (currentTime - start) / duration));
  return Math.round(progress * 360);
}

function getTimeValue(value: NumericLike | undefined) {
  return typeof value === 'number' ? value : (value?.valueOf() ?? 0);
}

function noteToHslColor(note: string) {
  try {
    const [pc, acc, oct] = tokenizeNote(note);

    if (!pc) {
      return null;
    }

    const chromas: Record<string, number> = {
      c: 0,
      d: 2,
      e: 4,
      f: 5,
      g: 7,
      a: 9,
      b: 11,
    };
    const accidentals: Record<string, number> = { '#': 1, b: -1, s: 1, f: -1 };
    const chroma = chromas[pc.toLowerCase()];
    const accidentalOffset =
      acc?.split('').reduce((sum, char) => sum + (accidentals[char] ?? 0), 0) ??
      0;
    const chromaticStep = (((chroma + accidentalOffset) % 12) + 12) % 12;
    const octave = oct ?? 3;
    const hue = chromaticStep * 30;
    const lightness = Math.max(26, Math.min(72, 30 + octave * 7));

    return `hsl(${hue}, 72%, ${lightness}%)`;
  } catch {
    return null;
  }
}

function toTransparentColor(color: string) {
  return `color-mix(in srgb, ${color} 80%, transparent)`;
}

function toOutlineColor(color: string) {
  return `color-mix(in srgb, ${color} 90%, transparent)`;
}

function buildContrastTextStyle(color: string) {
  const lightness = getColorLightness(color);
  const shadowAlpha =
    lightness == null ? 0.82 : lightness >= 64 ? 0.96 : lightness >= 52 ? 0.88 : 0.76;

  return [
    '--strudel-active-text-color: white',
    'color: var(--strudel-active-text-color) !important',
    `text-shadow: 0 0 1px rgba(0, 0, 0, ${shadowAlpha}), 0 0 2px rgba(0, 0, 0, ${Math.min(1, shadowAlpha + 0.08)}), 0 0 4px rgba(0, 0, 0, 0.35)`,
  ].join('; ');
}

function getColorLightness(color: string) {
  const match = color.match(
    /hsl\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*([\d.]+)%\s*\)/,
  );
  if (!match) {
    return null;
  }
  return parseFloat(match[1]);
}
