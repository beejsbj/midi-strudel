import { Note, StrudelConfig } from '../../types';
import {
  gcd,
  lcm,
  round,
  formatNoteVal,
  getCycleDuration,
} from './NotationUtils';

export { gcd, lcm };

export function simplifyGrid(grid: string[]): string[] {
  const len = grid.length;
  for (let d = 1; d <= len; d++) {
    if (len % d !== 0) continue;
    const step = len / d;
    let possible = true;
    for (let i = 0; i < len; i += step) {
      for (let j = 1; j < step; j++) {
        if (grid[i + j] !== "_") { possible = false; break; }
      }
      if (!possible) break;
    }
    if (possible) {
      const newGrid: string[] = [];
      for (let i = 0; i < len; i += step) newGrid.push(grid[i]);
      return newGrid;
    }
  }
  return grid;
}

export function generateSimpleGrid(
  startedNotes: Note[],
  sustainedNotes: Note[],
  startTime: number,
  duration: number,
  isDrum: boolean,
  config: StrudelConfig,
  drumMap: Record<number, string>
): string[] {
  if (startedNotes.length === 0 && sustainedNotes.length === 0) return ["~"];

  const possibleResolutions = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32];
  let bestRes = 16;
  const ERROR_TOLERANCE = 0.05;

  for (const res of possibleResolutions) {
    const tickDur = duration / res;
    let fits = true;
    for (const n of startedNotes) {
      const rel = n.noteOn - startTime;
      const tick = rel / tickDur;
      if (Math.abs(tick - Math.round(tick)) > ERROR_TOLERANCE) { fits = false; break; }
    }
    if (!fits) continue;
    for (const n of [...startedNotes, ...sustainedNotes]) {
      if (n.noteOff < startTime + duration - 0.001) {
        const rel = n.noteOff - startTime;
        const tick = rel / tickDur;
        if (Math.abs(tick - Math.round(tick)) > ERROR_TOLERANCE) { fits = false; break; }
      }
    }
    if (fits) { bestRes = res; break; }
  }

  const grid: string[] = new Array(bestRes).fill("~");
  const tickDur = duration / bestRes;
  const cycleDur = getCycleDuration(config);

  const addToGrid = (index: number, token: string) => {
    if (index >= bestRes) return;
    const current = grid[index];
    if (current === "~" || current === "") {
      grid[index] = token;
    } else {
      const existing = current.startsWith("{") ? current.slice(1, -1) : current;
      if (!existing.includes(token)) {
        grid[index] = `{${existing}, ${token}}`;
      }
    }
  };

  startedNotes.forEach(note => {
    const relStart = note.noteOn - startTime;
    const startTick = Math.round(relStart / tickDur);
    const relEnd = note.noteOff - startTime;
    const endTick = Math.min(bestRes, Math.round(relEnd / tickDur));

    if (startTick < bestRes) {
      const val = formatNoteVal(note, cycleDur, isDrum, config, drumMap, 0).replace(/@.*/, '');
      addToGrid(startTick, val);
      for (let i = startTick + 1; i < endTick; i++) addToGrid(i, "_");
    }
  });

  sustainedNotes.forEach(n => {
    const relEnd = n.noteOff - startTime;
    const endTick = Math.min(bestRes, Math.round(relEnd / tickDur));
    for (let i = 0; i < endTick; i++) addToGrid(i, "_");
  });

  return grid;
}

export function generateLayeredGrid(
  allNotes: Note[],
  startTime: number,
  duration: number,
  isDrum: boolean,
  config: StrudelConfig,
  drumMap: Record<number, string>
): string[] {
  const notes = [...allNotes].sort((a, b) => a.noteOn - b.noteOn);
  const lanes: Note[][] = [];

  for (const note of notes) {
    let placed = false;
    const start = Math.max(startTime, note.noteOn);

    for (const lane of lanes) {
      const last = lane[lane.length - 1];
      const lastEnd = Math.min(startTime + duration, last.noteOff);

      if (lastEnd <= start + 0.001) {
        lane.push(note);
        placed = true;
        break;
      }
    }
    if (!placed) lanes.push([note]);
  }

  const laneGrids: string[] = lanes.map(laneNotes => {
    const started = laneNotes.filter(n => n.noteOn >= startTime - 0.001);
    const sustained = laneNotes.filter(n => n.noteOn < startTime - 0.001);
    const grid = generateSimpleGrid(started, sustained, startTime, duration, isDrum, config, drumMap);
    return grid.join(" ");
  });

  if (laneGrids.length === 0) return ["~"];
  if (laneGrids.length === 1) return [laneGrids[0]];

  return [`{ ${laneGrids.join(", ")} }`];
}

export function getBeatGrid(
  startedNotes: Note[],
  sustainedNotes: Note[],
  startTime: number,
  duration: number,
  isDrum: boolean,
  config: StrudelConfig,
  drumMap: Record<number, string>
): string[] {
  const simpleGrid = generateSimpleGrid(startedNotes, sustainedNotes, startTime, duration, isDrum, config, drumMap);

  const hasBadSyntax = simpleGrid.some(t => t.includes('{') && t.includes('_'));

  if (!hasBadSyntax) return simpleGrid;

  return generateLayeredGrid([...startedNotes, ...sustainedNotes], startTime, duration, isDrum, config, drumMap);
}

export function flattenGrid(beatGrids: string[][]): string[] {
  const lengths = beatGrids.map(g => g.length);
  const totalLCM = lengths.reduce((a, b) => lcm(a, b), 1);

  const fullGrid: string[] = [];

  for (const grid of beatGrids) {
    const factor = totalLCM / grid.length;
    if (factor === 1) {
      fullGrid.push(...grid);
    } else {
      for (const cell of grid) {
        const isComplex = cell.startsWith('{') && (cell.includes(',') || cell.length > 20);

        if (isComplex) {
          fullGrid.push(`${cell}@${factor}`);
        } else {
          fullGrid.push(cell);
          for (let k = 1; k < factor; k++) fullGrid.push("_");
        }
      }
    }
  }

  return simplifyGrid(fullGrid);
}

export function renderMeasureSubdivision(
  notes: Note[],
  measureStart: number,
  measureDur: number,
  cycleDur: number,
  isDrum: boolean,
  config: StrudelConfig,
  drumMap: Record<number, string>
): string {
  const cycles = measureDur / cycleDur;
  const cyclesRounded = round(cycles, 4);
  const EPSILON = 0.001;

  if (notes.length === 0) {
    const suffix = cyclesRounded === 1 ? "" : `@${cyclesRounded}`;
    return `[~]${suffix}`;
  }

  const numerator = config.timeSignature.numerator || 4;
  const beatDur = measureDur / numerator;
  const beatGrids: string[][] = [];
  const sustainedNotes: Note[] = [];
  let noteIndex = 0;

  for (let i = 0; i < numerator; i++) {
    const beatStart = measureStart + (i * beatDur);
    const beatEnd = beatStart + beatDur;
    const beatNotes: Note[] = [];

    while (noteIndex < notes.length && notes[noteIndex].noteOff <= beatStart + EPSILON) {
      noteIndex++;
    }

    while (sustainedNotes.length > 0 && sustainedNotes[0].noteOff <= beatStart + EPSILON) {
      sustainedNotes.shift();
    }

    while (noteIndex < notes.length && notes[noteIndex].noteOn < beatEnd - EPSILON) {
      beatNotes.push(notes[noteIndex]);
      noteIndex++;
    }

    const activeSustains = sustainedNotes.filter(
      (note) => note.noteOn < beatStart - EPSILON && note.noteOff > beatStart + EPSILON,
    );

    if (i === 0 && activeSustains.length > 0) {
      const retriggered = activeSustains.map(n => ({ ...n, noteOn: beatStart }));
      beatGrids.push(getBeatGrid([...beatNotes, ...retriggered], [], beatStart, beatDur, isDrum, config, drumMap));
    } else {
      beatGrids.push(getBeatGrid(beatNotes, activeSustains, beatStart, beatDur, isDrum, config, drumMap));
    }

    for (const note of beatNotes) {
      if (note.noteOff > beatEnd + EPSILON) {
        sustainedNotes.push(note);
      }
    }
  }

  const fullGrid = flattenGrid(beatGrids);
  const content = fullGrid.join(" ");

  const suffix = cyclesRounded === 1 ? "" : `@${cyclesRounded}`;
  return `[${content}]${suffix}`;
}

export function renderMeasureAbsolute(
  notes: Note[],
  measureStart: number,
  measureDur: number,
  cycleDur: number,
  isDrum: boolean,
  config: StrudelConfig,
  drumMap: Record<number, string>,
  createRestTokenFn: (dur: number, cycleDur: number) => string
): string {
  const EPSILON = 0.01;

  if (notes.length === 0) return createRestTokenFn(measureDur, cycleDur);

  const formatOverlapGroup = (groupNotes: Note[]): { token: string; end: number } => {
    const groupStart = groupNotes[0].noteOn;
    const groupEnd = Math.max(...groupNotes.map(note => note.noteOff));
    const lanes: Note[][] = [];

    for (const groupNote of groupNotes) {
      let placed = false;

      for (const lane of lanes) {
        const lastNote = lane[lane.length - 1];
        if (lastNote.noteOff <= groupNote.noteOn + EPSILON) {
          lane.push(groupNote);
          placed = true;
          break;
        }
      }

      if (!placed) lanes.push([groupNote]);
    }

    const groupDur = groupEnd - groupStart;
    const cycles = round(groupDur / cycleDur, config.durationPrecision);
    const suffix = Math.abs(cycles - 1) < 0.001 ? "" : `@${cycles}`;
    const isSimpleChord = lanes.every(lane => lane.length === 1)
      && groupNotes.every(note =>
        Math.abs(note.noteOn - groupStart) < EPSILON
        && Math.abs(note.noteOff - groupEnd) < EPSILON,
      );

    if (isSimpleChord) {
      const innerNotes = groupNotes.map(note =>
        formatNoteVal(note, cycleDur, isDrum, config, drumMap).replace(/@-?\d*\.?\d+$/, ''),
      );

      return { token: `{${innerNotes.join(', ')}}${suffix}`, end: groupEnd };
    }

    const laneTokens = lanes.map(lane => {
      const parts: string[] = [];
      let laneCursor = groupStart;

      for (const laneNote of lane) {
        if (laneNote.noteOn > laneCursor + EPSILON) {
          parts.push(createRestTokenFn(laneNote.noteOn - laneCursor, cycleDur));
        }

        parts.push(formatNoteVal(laneNote, cycleDur, isDrum, config, drumMap));
        laneCursor = laneNote.noteOff;
      }

      if (laneCursor < groupEnd - EPSILON) {
        parts.push(createRestTokenFn(groupEnd - laneCursor, cycleDur));
      }

      return parts.join(' ');
    });

    return { token: `{${laneTokens.join(', ')}}${suffix}`, end: groupEnd };
  };

  let cursor = measureStart;
  const output: string[] = [];

  for (let i = 0; i < notes.length;) {
    const note = notes[i];
    if (note.noteOn > cursor + EPSILON) {
      const gap = note.noteOn - cursor;
      if (gap > EPSILON) {
        output.push(createRestTokenFn(gap, cycleDur));
      }
      cursor = note.noteOn;
    }

    let j = i + 1;
    let overlapEnd = note.noteOff;

    while (j < notes.length && notes[j].noteOn < overlapEnd - EPSILON) {
      overlapEnd = Math.max(overlapEnd, notes[j].noteOff);
      j++;
    }

    const groupNotes = notes.slice(i, j);

    if (groupNotes.length > 1) {
      const overlapGroup = formatOverlapGroup(groupNotes);
      output.push(overlapGroup.token);
      cursor = overlapGroup.end;
    } else {
      output.push(formatNoteVal(note, cycleDur, isDrum, config, drumMap));
      cursor = note.noteOff;
    }

    i = j;
  }

  if (cursor < measureStart + measureDur - EPSILON) {
    const rem = (measureStart + measureDur) - cursor;
    output.push(createRestTokenFn(rem, cycleDur));
  }

  return output.join(' ').trim();
}
