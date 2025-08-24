import { Note, WHOLE } from "@/types/music";
import { formatBracketNotation, generateFormattedBracketNotation } from "./bracketNotation";
import { KeySignature } from "./musicTheory";

export type AssignedNote = Note & { stream: number };

// Assign notes to monophonic streams using greedy allocation by start time
export function assignToStreams(notes: Note[]): AssignedNote[] {
  const sorted = [...notes].sort(
    (a, b) => a.start - b.start || a.release - b.release
  );
  const lastEndPerStream: number[] = [];
  const result: AssignedNote[] = [];

  for (const n of sorted) {
    let assigned = -1;
    for (let i = 0; i < lastEndPerStream.length; i++) {
      if (n.start >= lastEndPerStream[i]) {
        assigned = i;
        break;
      }
    }
    if (assigned === -1) {
      lastEndPerStream.push(n.release);
      assigned = lastEndPerStream.length - 1;
    } else {
      lastEndPerStream[assigned] = n.release;
    }
    result.push({ ...n, stream: assigned });
  }

  return result;
}

// Local duration formatter (cycles). Mirrors bracketNotation formatting.
function formatDuration(duration: number): string {
  if (duration === WHOLE) return "";
  const rounded = Math.round(duration * 10000) / 10000;
  return `@${rounded}`;
}

// Build a simple sequential bracket for a monophonic stream of notes (cycles)
export function buildSequentialBracket(notes: Note[], lineLength: number = 8, keySignature?: KeySignature, useScaleMode: boolean = false): string {
  if (!notes || notes.length === 0) return "";
  
  // Use the new unified function that handles both regular and scale modes
  return generateFormattedBracketNotation(notes, lineLength, keySignature, useScaleMode);
}

// Wrap a sequential string in angle brackets for Strudel
export function wrapInAngles(seq: string): string {
  if (!seq.trim()) return "<\n  >";

  // If seq has multiple lines, indent each line properly
  const lines = seq.split("\n");
  const indentedLines = lines.map((line) =>
    line.trim() ? `    ${line}` : line
  );

  return `<\n${indentedLines.join("\n")}\n  >`;
}
