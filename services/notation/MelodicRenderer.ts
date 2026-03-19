import { Note, Track, StrudelConfig } from '../../types';
import { getAutoSound } from '../../constants';
import {
  prepareNotes,
  formatTrackName,
  getAsString,
  createRestToken,
  createRestTokenCycles,
  isRest,
  getRestDuration,
  getCycleDuration,
  getMeasureDuration,
  buildVisualSuffix,
} from './NotationUtils';
import { renderMeasureAbsolute, renderMeasureSubdivision } from './GridBuilder';

export function splitMelodyHarmony(notes: Note[]): { melody: Note[]; harmony: Note[] } {
  const sorted = [...notes].sort((a, b) => a.noteOn - b.noteOn || b.midi - a.midi);
  return splitMelodyHarmonySorted(sorted);
}

function splitMelodyHarmonySorted(notes: Note[]): { melody: Note[]; harmony: Note[] } {
  const melody: Note[] = [];
  const harmony: Note[] = [];
  let lastEnd = 0;

  notes.forEach(note => {
    if (note.noteOn >= lastEnd - 0.01) {
      melody.push(note);
      lastEnd = note.noteOff;
    } else {
      harmony.push(note);
    }
  });

  return { melody, harmony };
}

export function renderSequence(
  notes: Note[],
  totalDuration: number,
  isDrum: boolean,
  config: StrudelConfig,
  drumMap: Record<number, string>
): string {
  if (notes.length === 0) {
    return '';
  }

  const cycleDur = getCycleDuration(config);
  const measureDur = getMeasureDuration(config);

  const tokens: string[] = [];
  let cursor = 0;
  let nextNoteIndex = 0;
  const EPSILON = 0.01;

  const restTokenFn = (dur: number, cd: number) => createRestToken(dur, cd, config);

  while (cursor < totalDuration - EPSILON) {
    while (nextNoteIndex < notes.length && notes[nextNoteIndex].noteOn < cursor - EPSILON) {
      nextNoteIndex++;
    }

    if (nextNoteIndex >= notes.length) {
      const restDur = totalDuration - cursor;
      tokens.push(createRestToken(restDur, cycleDur, config));
      break;
    }

    const nextNote = notes[nextNoteIndex];

    if (nextNote.noteOn > cursor + EPSILON) {
      const gap = nextNote.noteOn - cursor;
      tokens.push(createRestToken(gap, cycleDur, config));
      cursor = nextNote.noteOn;
    }

    let blockEnd = cursor + measureDur;
    let blockEndIndex = nextNoteIndex;
    let blockMaxEnd = blockEnd;

    while (blockEndIndex < notes.length && notes[blockEndIndex].noteOn < blockEnd - EPSILON) {
      blockMaxEnd = Math.max(blockMaxEnd, notes[blockEndIndex].noteOff);
      blockEndIndex++;
    }

    if (blockMaxEnd > blockEnd + EPSILON) {
      blockEnd = Math.ceil((blockMaxEnd + EPSILON) / measureDur) * measureDur;

      while (blockEndIndex < notes.length && notes[blockEndIndex].noteOn < blockEnd - EPSILON) {
        blockEndIndex++;
      }
    }

    const blockDur = blockEnd - cursor;
    const blockNotes = notes.slice(nextNoteIndex, blockEndIndex);

    let blockString = "";
    if (config.timingStyle === 'relativeDivision') {
      blockString = renderMeasureSubdivision(blockNotes, cursor, blockDur, cycleDur, isDrum, config, drumMap);
    } else {
      blockString = renderMeasureAbsolute(blockNotes, cursor, blockDur, cycleDur, isDrum, config, drumMap, restTokenFn);
    }

    if (blockString) tokens.push(blockString);
    cursor = blockEnd;
    nextNoteIndex = blockEndIndex;
  }

  // POST PROCESSING: MERGE RESTS
  const mergedTokens: string[] = [];

  for (const token of tokens) {
    if (!token.trim()) continue;

    if (isRest(token)) {
      const lastIdx = mergedTokens.length - 1;
      if (lastIdx >= 0 && isRest(mergedTokens[lastIdx])) {
        const prevDur = getRestDuration(mergedTokens[lastIdx]);
        const currDur = getRestDuration(token);
        const totalCycles = prevDur + currDur;
        mergedTokens[lastIdx] = createRestTokenCycles(totalCycles, config);
      } else {
        mergedTokens.push(token);
      }
    } else {
      mergedTokens.push(token);
    }
  }

  // FORMATTING INTO LINES
  const outputLines: string[] = [];
  const perLine = config.measuresPerLine;

  if (config.formatPerLineBy === 'note') {
    const flatTokens = mergedTokens.flatMap(t => t.trim().split(/\s+/).filter(Boolean));
    const chunkSize = Math.max(1, perLine);
    const remainingTokens = [...flatTokens];

    while (remainingTokens.length > 1 && isRest(remainingTokens[0])) {
      outputLines.push(remainingTokens.shift()!);
    }

    for (let index = 0; index < remainingTokens.length; index += chunkSize) {
      outputLines.push(remainingTokens.slice(index, index + chunkSize).join(' '));
    }
  } else {
    let currentLine = "";
    let itemsInLine = 0;
    for (const token of mergedTokens) {
      currentLine += token + " ";
      itemsInLine++;
      if (itemsInLine >= perLine) {
        outputLines.push(currentLine.trim());
        currentLine = "";
        itemsInLine = 0;
      }
    }
    if (currentLine.trim()) outputLines.push(currentLine.trim());
  }

  return outputLines.join('\n');
}

export function renderMelodicTrack(
  track: Track,
  globalMaxDuration: number,
  config: StrudelConfig,
  preparedNotes?: Note[],
): string {
  const notes = preparedNotes ?? prepareNotes(track.notes, config);

  let sound = config.globalSound;

  if (track.sound) {
    sound = track.sound;
  } else if (config.useAutoMapping) {
    const auto = getAutoSound(track);
    if (auto) sound = auto;
  }

  let scaleSuffix = "";
  if (config.notationType === 'relative' && (config.key || config.playbackKey)) {
    const k = config.playbackKey || config.key!;
    scaleSuffix = `\n  .scale("${k.root}${k.averageOctave}:${k.type}")`;
  }

  const { melody, harmony } = splitMelodyHarmonySorted(notes);
  let trackOutput = "";

  // Pass empty drumMap for melodic tracks
  const emptyDrumMap: Record<number, string> = {};

  const visualSuffix = buildVisualSuffix(config, track);

  if (melody.length > 0) {
    const melodyCode = renderSequence(melody, globalMaxDuration, false, config, emptyDrumMap);
    trackOutput += `$${formatTrackName(track.name)}_MELODY: \`<\n${melodyCode}\n>\`\n  .as("${getAsString(false, config)}")` + scaleSuffix + `\n  .sound("${sound}")` + visualSuffix + `;\n\n`;
  }

  if (harmony.length > 0) {
    const harmonyCode = renderSequence(harmony, globalMaxDuration, false, config, emptyDrumMap);
    trackOutput += `$${formatTrackName(track.name)}_HARMONY: \`<\n${harmonyCode}\n>\`\n  .as("${getAsString(false, config)}")` + scaleSuffix + `\n  .sound("${sound}")` + visualSuffix + `;\n\n`;
  }

  return trackOutput;
}
