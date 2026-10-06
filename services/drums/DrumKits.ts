import { DRUM_KITS } from './drumKits.generated';

export { DRUM_KITS };

/** The bank used when nothing favours another; it wins every tie. */
export const DEFAULT_DRUM_KIT = 'RolandTR909';

/** Familiar kits first; the rest follow alphabetically. */
export const DRUM_KIT_NAMES: string[] = [
  DEFAULT_DRUM_KIT, 'RolandTR808', 'RolandTR707', 'LinnDrum',
  ...Object.keys(DRUM_KITS).filter((name) => ![DEFAULT_DRUM_KIT, 'RolandTR808', 'RolandTR707', 'LinnDrum'].includes(name)).sort(),
];

/** General MIDI percussion names (GM1 35–81, GM2 27–34 and 82–87). */
export const GM_PERCUSSION: Readonly<Record<number, string>> = {
  27: 'High Q', 28: 'Slap', 29: 'Scratch Push', 30: 'Scratch Pull', 31: 'Sticks', 32: 'Square Click',
  33: 'Metronome Click', 34: 'Metronome Bell', 35: 'Acoustic Bass Drum', 36: 'Bass Drum', 37: 'Side Stick',
  38: 'Acoustic Snare', 39: 'Hand Clap', 40: 'Electric Snare', 41: 'Low Floor Tom', 42: 'Closed Hi-Hat',
  43: 'High Floor Tom', 44: 'Pedal Hi-Hat', 45: 'Low Tom', 46: 'Open Hi-Hat', 47: 'Low-Mid Tom',
  48: 'Hi-Mid Tom', 49: 'Crash Cymbal 1', 50: 'High Tom', 51: 'Ride Cymbal 1', 52: 'Chinese Cymbal',
  53: 'Ride Bell', 54: 'Tambourine', 55: 'Splash Cymbal', 56: 'Cowbell', 57: 'Crash Cymbal 2', 58: 'Vibraslap',
  59: 'Ride Cymbal 2', 60: 'High Bongo', 61: 'Low Bongo', 62: 'Mute High Conga', 63: 'Open High Conga',
  64: 'Low Conga', 65: 'High Timbale', 66: 'Low Timbale', 67: 'High Agogo', 68: 'Low Agogo', 69: 'Cabasa',
  70: 'Maracas', 71: 'Short Whistle', 72: 'Long Whistle', 73: 'Short Guiro', 74: 'Long Guiro', 75: 'Claves',
  76: 'High Woodblock', 77: 'Low Woodblock', 78: 'Mute Cuica', 79: 'Open Cuica', 80: 'Mute Triangle',
  81: 'Open Triangle', 82: 'Shaker', 83: 'Jingle Bell', 84: 'Bell Tree', 85: 'Castanets', 86: 'Mute Surdo',
  87: 'Open Surdo',
};

/**
 * When a kit lacks a sound, the nearest by ear, in order: same instrument
 * first, then one of the same family (wood clicks, jingles, skins, metal).
 */
const STAND_INS: Readonly<Record<number, number[]>> = {
  27: [33, 75, 37], 28: [39, 37, 38], 29: [30, 39], 30: [29, 39], 31: [75, 76, 37], 32: [33, 37, 75],
  33: [32, 37, 75], 34: [56, 81, 53], 35: [36], 36: [35], 37: [31, 75, 76], 38: [40, 39], 39: [38, 40],
  40: [38, 39], 41: [43, 45, 47], 42: [44, 46], 43: [41, 45, 47], 44: [42, 46], 45: [47, 41, 43],
  46: [42, 44], 47: [45, 48, 41], 48: [50, 47, 45], 49: [57, 55, 52, 51], 50: [48, 47, 45],
  51: [59, 53, 42], 52: [49, 57, 55], 53: [51, 59, 56], 54: [83, 82, 69, 42], 55: [49, 57, 52],
  56: [67, 68, 53], 57: [49, 55, 52], 58: [69, 82, 54], 59: [51, 53, 42], 60: [61, 63, 62, 64, 76],
  61: [60, 64, 63, 62, 77], 62: [63, 64, 60, 61], 63: [62, 64, 60, 61], 64: [63, 62, 61, 60],
  65: [66, 50, 48], 66: [65, 48, 47], 67: [68, 56, 53], 68: [67, 56, 53], 69: [70, 82, 54],
  70: [69, 82, 54], 71: [72], 72: [71], 73: [74, 69, 82], 74: [73, 69, 82], 75: [76, 31, 37],
  76: [77, 75, 37], 77: [76, 75, 37], 78: [79, 64, 47], 79: [78, 64, 47], 80: [81, 53, 56],
  81: [80, 53, 56], 82: [70, 69, 54], 83: [54, 82, 69], 84: [81, 83, 54, 53], 85: [75, 76, 31, 37],
  86: [87, 41, 43, 35], 87: [86, 41, 43, 35],
};

export interface DrumSample {
  /** Mini-notation sample token: `bd`, or `perc:24` for a folder's 25th file. */
  token: string;
  /** The GM sound played instead, when the kit lacks the one asked for. */
  standIn?: number;
}

/** The sample a kit plays for a GM percussion note, or undefined if nothing is close. */
export const drumSample = (midi: number, kit: string): DrumSample | undefined => {
  const notes = DRUM_KITS[kit] ?? DRUM_KITS[DEFAULT_DRUM_KIT];
  if (notes[midi]) return { token: notes[midi] };
  const standIn = STAND_INS[midi]?.find((note) => notes[note]);
  return standIn === undefined ? undefined : { token: notes[standIn], standIn };
};

/**
 * Cover the most hits first, then score each exact sound as 1 and stand-in as ½.
 * Ties keep the familiar kits.
 */
export const pickDrumKit = (midiNotes: number[]): string => {
  const hits = new Map<number, number>();
  for (const midi of midiNotes) hits.set(midi, (hits.get(midi) ?? 0) + 1);
  let best = DEFAULT_DRUM_KIT;
  let bestCoverage = -1;
  let bestScore = -1;
  for (const kit of DRUM_KIT_NAMES) {
    let coverage = 0;
    let score = 0;
    for (const [midi, count] of hits) {
      const sample = drumSample(midi, kit);
      if (sample) {
        coverage += count;
        score += sample.standIn === undefined ? count : count / 2;
      }
    }
    if (coverage > bestCoverage || (coverage === bestCoverage && score > bestScore)) {
      best = kit;
      bestCoverage = coverage;
      bestScore = score;
    }
  }
  return best;
};

/** A track's kit: its chosen bank when that bank exists, else the best match for its notes. */
export const drumKitFor = (track: { drumBank?: string; notes: Array<{ midi: number }> }): string =>
  track.drumBank && DRUM_KITS[track.drumBank] ? track.drumBank : pickDrumKit(track.notes.map((note) => note.midi));

/**
 * What each indexed sample (`perc:6`) in a part is, since the token alone does
 * not say: `perc:6 sticks`, or `perc:11 high woodblock (for castanets)` when it
 * stands in for a sound the kit lacks. A plain folder name (`bd`) is listed only
 * when it stands in for another sound.
 */
export const indexedSampleKey = (midiNotes: Iterable<number>, kit: string): string[] => {
  const entries = new Map<string, { sound: number; standsFor: Set<number> }>();
  for (const midi of new Set(midiNotes)) {
    const sample = drumSample(midi, kit);
    if (!sample || (!sample.token.includes(':') && sample.standIn === undefined)) continue;
    const entry = entries.get(sample.token) ?? { sound: sample.standIn ?? midi, standsFor: new Set<number>() };
    if (sample.standIn !== undefined) entry.standsFor.add(midi);
    entries.set(sample.token, entry);
  }
  const name = (midi: number) => (GM_PERCUSSION[midi] ?? `MIDI ${midi}`).toLowerCase();
  const order = (token: string) => token.split(':').map((part, index) => index ? part.padStart(3, '0') : part).join(':');
  return [...entries].sort(([a], [b]) => order(a).localeCompare(order(b))).map(([token, { sound, standsFor }]) =>
    `${token} ${name(sound)}${standsFor.size ? ` (for ${[...standsFor].sort((a, b) => a - b).map(name).join(', ')})` : ''}`);
};
