/**
 * Builds services/drums/drumKits.generated.ts: for every drum machine bank the
 * app loads, which General MIDI percussion notes it plays exactly, and with
 * which sample token (`bd`, or `perc:24` for the 25th file of a folder).
 *
 * Whole folders like `bd` or `hh` are one GM sound each. Mixed folders (`perc`,
 * `misc`, `sh`, `tb`, `cb`, ...) are read file by file from their names, so
 * `RolandMC303_perc/Longguir.wav` is the long guiro. Run with:
 *   bunx tsx scripts/generate-drum-kits.mts
 */
import { writeFileSync } from 'node:fs';

const MANIFEST = 'https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json';

/** Folders that are a single GM sound whatever their files are called. */
const FOLDER_NOTES: Record<string, number[]> = {
  bd: [35, 36], sd: [38, 40], rim: [37], cp: [39], hh: [42, 44], oh: [46],
  lt: [41, 43], mt: [45, 47], ht: [48, 50], cr: [49, 57], rd: [51, 59],
  cb: [56], tb: [54],
};
/** Earlier folders win when two files claim one note. */
const FOLDER_ORDER = ['bd', 'sd', 'rim', 'cp', 'hh', 'oh', 'lt', 'mt', 'ht', 'cr', 'rd', 'cb', 'tb', 'sh', 'perc', 'misc', 'fx'];

type Variant = { high?: number[]; low?: number[]; mute?: number[]; open?: number[]; short?: number[]; long?: number[]; all: number[] };
/** File-name keyword -> GM note(s); a variant word picks between paired notes. */
const FILE_RULES: Array<[RegExp, Variant]> = [
  [/cast/, { all: [85] }],
  [/jingle|sleigh/, { all: [83] }],
  [/bell ?tree/, { all: [84] }],
  [/surd/, { mute: [86], open: [87], all: [86, 87] }],
  [/side ?stick/, { all: [37] }],
  [/stick/, { all: [31] }],
  [/metro|click/, { all: [33] }],
  [/vibra/, { all: [58] }],
  [/bongo/, { high: [60], low: [61], all: [60, 61] }],
  [/conga/, { mute: [62], high: [63], open: [63], low: [64], all: [63, 64, 62] }],
  [/timb/, { high: [65], low: [66], all: [65, 66] }],
  [/agogo/, { high: [67], low: [68], all: [67, 68] }],
  [/cabasa/, { all: [69] }],
  [/marac/, { all: [70] }],
  [/whis/, { short: [71], long: [72], all: [71, 72] }],
  [/gui/, { short: [73], long: [74], all: [73, 74] }],
  [/clave/, { all: [75] }],
  [/wood ?bl|block/, { high: [76], low: [77], all: [76, 77] }],
  [/cuic/, { mute: [78], open: [79], all: [78, 79] }],
  [/tria/, { mute: [80], open: [81], all: [80, 81] }],
  [/shak/, { all: [82] }],
  [/tamb/, { all: [54] }],
  [/cowbell/, { all: [56] }],
  [/splash/, { all: [55] }],
  [/china/, { all: [52] }],
];

/** Notes a file names, and whether the name picks one of a pair (hi/lo, mute/open, ...). */
const fileNotes = (file: string): { notes: number[]; specific: boolean } => {
  const name = decodeURIComponent(file.split('/').pop()!).replace(/\.[a-z0-9]+$/i, '').toLowerCase();
  const rule = FILE_RULES.find(([pattern]) => pattern.test(name));
  if (!rule) return { notes: [], specific: false };
  const variant = rule[1];
  const has = (pattern: RegExp) => pattern.test(name);
  const pick = (notes: number[]) => ({ notes, specific: true });
  if (variant.mute && has(/mute/)) return pick(variant.mute);
  if (variant.open && has(/open/)) return pick(variant.open);
  if (variant.short && has(/short/)) return pick(variant.short);
  if (variant.long && has(/long/)) return pick(variant.long);
  if (variant.high && has(/(^|[^a-z])(h|hi|high)([^a-z]|$)|^hi/)) return pick(variant.high);
  if (variant.low && has(/(^|[^a-z])(l|lo|low)([^a-z]|$)|^lo/)) return pick(variant.low);
  return { notes: variant.all, specific: !variant.high && !variant.mute && !variant.short };
};

const manifest = await (await fetch(MANIFEST)).json() as Record<string, string[] | string>;
const kits: Record<string, Record<number, string>> = {};
for (const [key, files] of Object.entries(manifest)) {
  if (!Array.isArray(files) || !key.includes('_')) continue;
  const split = key.lastIndexOf('_');
  const [bank, folder] = [key.slice(0, split), key.slice(split + 1)];
  if (!FOLDER_ORDER.includes(folder)) continue;
  (kits[bank] ??= {});
}
for (const bank of Object.keys(kits).sort()) {
  const notes: Record<number, string> = {};
  const claim = (note: number, token: string) => { notes[note] ??= token; };
  const folders = FOLDER_ORDER.filter((folder) => Array.isArray(manifest[`${bank}_${folder}`]));
  // Single-sound folders play their first file; their file names are not read.
  for (const folder of folders) for (const note of FOLDER_NOTES[folder] ?? []) claim(note, folder);
  // Mixed folders are read by file name: a file naming one of a pair first,
  // then generic names for whichever of the pair is still unclaimed.
  const named = folders.filter((folder) => !FOLDER_NOTES[folder]).flatMap((folder) =>
    (manifest[`${bank}_${folder}`] as string[]).map((file, index) =>
      ({ token: index === 0 ? folder : `${folder}:${index}`, ...fileNotes(file) })));
  for (const pass of [true, false]) {
    for (const file of named) if (file.specific === pass) file.notes.forEach((note) => claim(note, file.token));
  }
  const shakers = manifest[`${bank}_sh`];
  if (Array.isArray(shakers) && shakers.length === 1) claim(82, 'sh');
  kits[bank] = notes;
}

const lines = Object.entries(kits).filter(([, notes]) => Object.keys(notes).length)
  .map(([bank, notes]) => `  ${bank}: {${Object.entries(notes).map(([note, token]) => ` ${note}: '${token}'`).join(',')} },`);
writeFileSync(new URL('../services/drums/drumKits.generated.ts', import.meta.url), `// Generated by scripts/generate-drum-kits.mts from
// ${MANIFEST}
// on ${new Date().toISOString().slice(0, 10)}. Do not edit by hand.
//
// Each bank: General MIDI percussion note -> sample token that plays it exactly.
// Indices follow the manifest's file order, which is how Strudel picks \`n\`.

export const DRUM_KITS: Record<string, Readonly<Record<number, string>>> = {
${lines.join('\n')}
};
`);
console.log(`${lines.length} kits`);
