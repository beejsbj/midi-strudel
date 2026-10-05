import { drumSample, pickDrumKit } from '../../drums/DrumKits';

/** The kit a freshly parsed drum track uses: the best match for its notes. */
export const kitForNotes = (notes: Array<{ midi: number }>): string => pickDrumKit(notes.map((note) => note.midi));

/** The sample a source drum note should play, as `s:n`, or undefined if dropped. */
export const expectedDrum = (midi: number, kit: string): string | undefined => {
  const token = drumSample(midi, kit)?.token;
  if (!token) return undefined;
  const [sound, index = '0'] = token.split(':');
  return `${sound}:${index}`;
};

/** The sample an evaluated event plays, as `s:n`. */
export const playedDrum = (value: Record<string, unknown>): string => `${String(value.s)}:${Number(value.n ?? 0)}`;
