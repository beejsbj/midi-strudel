import MidiPackage from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { convertMidi, type ConversionOverrides } from '../convertMidi';
import { DRUM_MAP } from '../../constants';
import { evaluateGeneratedStrudelCode, gateTolerance } from './helpers/strudelRuntime';
import { roundedDecimal, snappedRatio } from '../notation/NumberFormat';

const { Midi } = MidiPackage;
type MidiTrack = ReturnType<InstanceType<typeof Midi>['addTrack']>;

const numericPitch = (value: unknown): number | string => {
  if (typeof value === 'number') return value;
  const match = /^([A-Ga-g])([#b]*)(-?\d+)$/.exec(String(value));
  if (!match) return String(value);
  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1].toUpperCase()]!;
  return (Number(match[3]) + 1) * 12 + semitone
    + [...match[2]].reduce((sum, char) => sum + (char === '#' ? 1 : -1), 0);
};

const score = (build: (track: MidiTrack) => void, drums = false) => {
  const midi = new Midi();
  midi.header.setTempo(120);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4], measures: 0 });
  const track = midi.addTrack();
  if (drums) track.channel = 9;
  build(track);
  return midi.toArray().buffer;
};

/**
 * Independent oracle: every source note over two loops, with exact onsets,
 * gates within 0.0005 of their slot, and velocities at three decimals.
 */
async function convertAndVerify(bytes: ArrayBuffer, overrides: ConversionOverrides = {}) {
  const result = convertMidi(bytes, 'readable.mid', overrides);
  const source = new Midi(bytes).tracks[0];
  const drum = source.channel === 9;
  const span = result.sharedSpanSeconds;
  const expected = [0, span].flatMap((offset) => source.notes.map((note) => ({
    pitch: drum ? DRUM_MAP[note.midi] : note.midi,
    onset: note.time + offset,
    end: note.time + note.duration + offset,
    velocity: note.velocity,
  }))).sort((a, b) => a.onset - b.onset || String(a.pitch).localeCompare(String(b.pitch)) || a.end - b.end);
  const runtime = await evaluateGeneratedStrudelCode(result.code, { exactBpm: result.config.bpm });
  try {
    const actual = runtime.querySeconds(0, span * 2).map((event) => ({
      event, pitch: drum ? event.value.s : numericPitch(event.value.note),
    })).sort((a, b) => a.event.onsetSeconds - b.event.onsetSeconds
      || String(a.pitch).localeCompare(String(b.pitch)) || a.event.gateEndSeconds - b.event.gateEndSeconds);
    expect(actual).toHaveLength(expected.length);
    actual.forEach(({ event, pitch }, index) => {
      const want = expected[index];
      expect(pitch).toBe(want.pitch);
      expect(Math.abs(event.onsetSeconds - want.onset)).toBeLessThan(1e-9);
      if (!drum) expect(Math.abs(event.gateEndSeconds - want.end)).toBeLessThanOrEqual(gateTolerance(event));
      if (result.config.includeVelocity) expect(event.value.velocity).toBe(Math.round(want.velocity * 1000) / 1000);
    });
  } finally { runtime.stop(); }
  return result;
}

/** The first track's phrase object. */
const phraseLibrary = (code: string) => {
  const start = code.search(/^const (?!BPM)\w+ = \{$/m);
  return code.slice(start, code.indexOf('\n};', start) + 3);
};

describe('readable structured notation', () => {
  it('writes held chords as structure and whole measures as <...> steps without .slow', async () => {
    const bytes = score((track) => {
      [[38, 50], [40, 52], [41, 53]].forEach((chord, bar) => chord.forEach((midi) =>
        track.addNote({ midi, ticks: bar * 1920, durationTicks: 1920, velocity: 0.8 })));
      // Last chord holds half a measure: [chord ~].
      [43, 55].forEach((midi) => track.addNote({ midi, ticks: 3 * 1920, durationTicks: 960, velocity: 0.8 }));
    });
    const result = await convertAndVerify(bytes);
    const library = phraseLibrary(result.code);
    expect(library).toMatch(/<\s*\[D2,D3\] \[E2,E3\] \[F2,F3\] \[\[G2,G3\] ~\]\s*>/);
    expect(library).not.toContain('.clip(');
    expect(library).not.toContain('.slow(');
  });

  it('keeps a staccato grid rather than merging its rests', async () => {
    const bytes = score((track) => {
      // Staccato grid stays: C4 sounds one sixteenth of a four-sixteenth beat.
      track.addNote({ midi: 60, ticks: 0, durationTicks: 120 });
      track.addNote({ midi: 62, ticks: 360, durationTicks: 120 });
      // The only attack in its beat: the beat is its slot, gate 0.5.
      track.addNote({ midi: 64, ticks: 480, durationTicks: 240 });
    });
    const result = await convertAndVerify(bytes);
    expect(result.code).toContain('note(`[C4 ~!2 D4] E4 ~!2`).clip(`[1 ~!2 1] 0.5 ~!2`)');
  });

  describe.each([false, true])('colon controls (velocity %s)', (includeVelocity) => {
    const bytes = score((track) => {
      // One attack, two different releases: one chord in colon mode. Velocities
      // are stored as n/127 (0.8 -> 101/127 -> 0.795).
      track.addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8 });
      track.addNote({ midi: 64, ticks: 0, durationTicks: 240, velocity: 0.5 });
      track.addNote({ midi: 67, ticks: 480, durationTicks: 160, velocity: 0.7 });
      track.addNote({ midi: 65, ticks: 960, durationTicks: 480, velocity: 0.6 });
    });

    it('attaches varying fields to each note with .as', async () => {
      const result = await convertAndVerify(bytes, { controlSyntax: 'colon', includeVelocity });
      const fields = includeVelocity ? 'note:velocity:clip' : 'note:clip';
      expect(result.code).toContain(`.as("${fields}")`);
      expect(result.code).toContain(includeVelocity ? '[C4:0.795,E4:0.496:0.5]' : '[C4,E4:0.5]');
      expect(result.code).not.toMatch(/\.clip\(`|\.velocity\(`/);
      expect(result.code).not.toContain('stack(');
    });

    it('keeps the chained spelling equivalent', async () => {
      const result = await convertAndVerify(bytes, { controlSyntax: 'chained', includeVelocity });
      expect(result.code).not.toContain('.as(');
      expect(result.code).toContain('.clip(`');
    });
  });

  it('names colon fields on each phrase and hoists track-wide constants to the track line', async () => {
    const bytes = score((track) => {
      [60, 62, 64, 65].forEach((midi, beat) => track.addNote({ midi, ticks: beat * 480, durationTicks: 160, velocity: 0.8 }));
    });
    const chained = await convertAndVerify(bytes, { controlSyntax: 'chained', includeVelocity: true });
    expect(chained.code).toContain('note(`C4 D4 E4 F4`).clip(1/3).velocity(0.795)');
    const colon = await convertAndVerify(bytes, { controlSyntax: 'colon', includeVelocity: true });
    // A phrase pasted on its own still knows its fields.
    expect(colon.code).toContain('a: `C4 D4 E4 F4`\n    .as("note"),');
    expect(colon.code).toContain('$track_1: track_1.a\n  .clip(1/3)\n  .velocity(0.795)');
    expect(colon.code).not.toContain('note(');
  });

  it('carries a value as a note field when it differs between phrases of one track', async () => {
    const bytes = score((track) => {
      // Bar 1 staccato (1/3), bar 2 legato: each bar is constant, the track is not.
      [60, 62, 64, 65].forEach((midi, beat) => track.addNote({ midi, ticks: beat * 480, durationTicks: 160 }));
      [67, 65, 64, 62].forEach((midi, beat) => track.addNote({ midi, ticks: 1920 + beat * 480, durationTicks: 480 }));
    });
    const result = await convertAndVerify(bytes, { controlSyntax: 'colon' });
    expect(result.code).toContain('.as("note:clip")');
    expect(result.code).toContain('C4:0.333');
    expect(result.code).not.toContain('.clip(');
  });

  it('uses colon fields for relative pitches and drums', async () => {
    const relative = score((track) => {
      [60, 62, 64, 65, 67, 69, 71, 72].forEach((midi, index) =>
        track.addNote({ midi, ticks: index * 240, durationTicks: index % 2 ? 60 : 240, velocity: 0.8 }));
    });
    const relativeResult = await convertAndVerify(relative, { controlSyntax: 'colon', notationType: 'relative' });
    // Degrees mean pitches only with their scale, so each phrase carries it.
    expect(relativeResult.code).toMatch(/`\n {4}\.as\("n:clip"\)\.scale\("[^"]+"\),\n/);
    expect(relativeResult.code).not.toContain('\n  .scale(');

    const kit = score((track) => {
      track.addNote({ midi: 36, ticks: 0, durationTicks: 480, velocity: 0.8 });
      track.addNote({ midi: 49, ticks: 0, durationTicks: 720, velocity: 0.8 });
      track.addNote({ midi: 38, ticks: 960, durationTicks: 120, velocity: 0.8 });
    }, true);
    // Drums are one-shots: no clip field even when MIDI lengths differ.
    const kitResult = await convertAndVerify(kit, { controlSyntax: 'colon' });
    expect(kitResult.code).toContain('a: `[bd,cr] sd`\n    .as("s"),');
    expect(kitResult.code).not.toMatch(/clip/);
  });

  it('plays a drum sample once per instant, at the level Strudel gives soundfonts', async () => {
    const kit = score((track) => {
      // GM 35 and 36 are both `bd`: together they are one louder kick.
      track.addNote({ midi: 35, ticks: 0, durationTicks: 120, velocity: 0.5 });
      track.addNote({ midi: 36, ticks: 0, durationTicks: 120, velocity: 0.9 });
      track.addNote({ midi: 38, ticks: 960, durationTicks: 120, velocity: 0.8 });
    }, true);
    const result = convertMidi(kit, 'kit.mid', { controlSyntax: 'colon' });
    expect(result.code).toContain('a: `bd sd`\n    .as("s"),');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'merged-drum-layers', count: 1 }));
    const runtime = await evaluateGeneratedStrudelCode(result.code, { exactBpm: result.config.bpm });
    try {
      const hits = runtime.querySeconds(0, result.sharedSpanSeconds);
      expect(hits.map((hit) => hit.value.s)).toEqual(['bd', 'sd']);
      hits.forEach((hit) => expect(hit.value.gain).toBe(0.3));
    } finally { runtime.stop(); }
  });
});

describe('line wrapping', () => {
  const bytes = score((track) => {
    for (let bar = 0; bar < 3; bar++) {
      for (let beat = 0; beat < 4; beat++) {
        // Distinct triplet per beat so measures do not fold into m!n.
        [0, 160, 320].forEach((offset, index) => track.addNote({
          midi: 60 + bar * 5 + beat + index, ticks: bar * 1920 + beat * 480 + offset, durationTicks: 160 }));
      }
    }
  });
  // Three short bars (quarter notes) fit on one row.
  const narrow = score((track) => {
    for (let bar = 0; bar < 3; bar++) [0, 1, 2, 3].forEach((beat) =>
      track.addNote({ midi: 60 + bar * 5 + beat, ticks: bar * 1920 + beat * 480, durationTicks: 480 }));
  });
  // Every beat a run of four-note sixteenth chords: one bar is far wider than a line.
  const dense = (bars: number) => score((track) => {
    for (let bar = 0; bar < bars; bar++) for (let step = 0; step < 16; step++) {
      [0, 4, 7, 11].forEach((interval) => track.addNote({
        midi: 48 + bar * 2 + step % 5 + interval, ticks: bar * 1920 + step * 120, durationTicks: 120 }));
    }
  });
  const passage = (code: string) => /: note\(`([\s\S]*?)`\)/.exec(code)![1];

  const blockLines = (code: string) => passage(code).split('\n').map((line) => line.trim()).filter(Boolean);

  it('puts N measures on each line of a multi-bar block', async () => {
    const result = await convertAndVerify(bytes, { measuresPerLine: 1 });
    const lines = blockLines(result.code);
    expect(lines[0]).toBe('<');
    expect(lines.at(-1)).toBe('>');
    expect(lines.slice(1, -1)).toHaveLength(3);
    lines.slice(1, -1).forEach((line) => expect(line).toMatch(/^\[\[.*\]\]$/));
  });

  it('keeps a multi-bar passage on its key line when it fits one row', async () => {
    const result = await convertAndVerify(narrow, { measuresPerLine: 4 });
    expect(passage(result.code)).toBe('<[C4 C#4 D4 D#4] [F4 F#4 G4 G#4] [A#4 B4 C5 C#5]>');
  });

  it('breaks a row before it passes 100 characters', async () => {
    const result = await convertAndVerify(bytes, { measuresPerLine: 4 });
    const lines = blockLines(result.code);
    // Three ~52-character bars: any two together pass 100, so one bar per row.
    expect(lines.slice(1, -1)).toHaveLength(3);
    lines.forEach((line) => expect(line.length).toBeLessThanOrEqual(100));
  });

  it('puts each beat of a too-wide bar on its own line', async () => {
    const result = await convertAndVerify(dense(2), { measuresPerLine: 4 });
    const lines = blockLines(result.code);
    expect(lines).toEqual(['<', '[', expect.any(String), expect.any(String), expect.any(String), expect.any(String), ']',
      '[', expect.any(String), expect.any(String), expect.any(String), expect.any(String), ']', '>']);
    lines.forEach((line) => expect(line.length).toBeLessThanOrEqual(100));
    const oneBar = await convertAndVerify(dense(1));
    expect(blockLines(oneBar.code)).toHaveLength(6);
    expect(blockLines(oneBar.code)[0]).toBe('[');
  });

  it('keeps a one-bar passage on its key line', async () => {
    const oneBar = score((track) => [60, 62, 64, 65].forEach((midi, beat) => track.addNote({ midi, ticks: beat * 480, durationTicks: 480 })));
    const result = await convertAndVerify(oneBar, { measuresPerLine: 1 });
    expect(passage(result.code)).toBe('C4 D4 E4 F4');
  });

  it('indents the block under its phrase key', async () => {
    const result = await convertAndVerify(narrow, { measuresPerLine: 2 });
    expect(result.code).toMatch(/\nconst track_1 = \{\n {2}a: note\(`<\n {4}\[C4 .*\n {4}\[A#4 .*\n {2}>`\),\n\};/);
  });

  it('keeps every line within 100 characters, key and .as included', async () => {
    const result = await convertAndVerify(bytes, { measuresPerLine: 4, controlSyntax: 'colon' });
    result.code.split('\n').forEach((line) => expect(line.length).toBeLessThanOrEqual(100));
  });
});

describe('cycle ratios', () => {
  it('snaps float noise to exact small fractions and leaves real ratios alone', () => {
    expect(snappedRatio(1.0000000000000002)).toBe(1);
    expect(snappedRatio(4 / 3 + 1e-15)).toBe(4 / 3);
    expect(snappedRatio(103)).toBe(103);
    expect(snappedRatio(Math.PI)).toBe(Math.PI);
  });
});

describe('control values', () => {
  it('use three decimals, or three significant digits below 0.1', () => {
    expect(roundedDecimal(1 / 3)).toBe('0.333');
    expect(roundedDecimal(1.5)).toBe('1.5');
    expect(roundedDecimal(2)).toBe('2');
    expect(roundedDecimal(0.00125)).toBe('0.00125');
    expect(roundedDecimal(1 / 478)).toBe('0.00209');
    expect(roundedDecimal(0)).toBe('0');
  });

  it('keep a lone one-tick note at a slow tempo within 0.5% of its length', async () => {
    const midi = new Midi();
    midi.header.setTempo(60);
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4], measures: 0 });
    const track = midi.addTrack();
    // A one-tick (~2 ms) note alone in a one-second beat slot, plus a varied
    // neighbour so gates are patterned. Three decimals would give 0.002 (4% short).
    track.addNote({ midi: 60, ticks: 0, durationTicks: 1 });
    track.addNote({ midi: 62, ticks: 1920, durationTicks: 960 });
    const result = convertMidi(midi.toArray().buffer, 'staccato.mid');
    const runtime = await evaluateGeneratedStrudelCode(result.code, { exactBpm: result.config.bpm });
    try {
      const [first] = runtime.querySeconds(0, 1);
      const sourceSeconds = 1 * 60 / 60 / 480;
      expect(Math.abs((first.gateEndSeconds - first.onsetSeconds) - sourceSeconds) / sourceSeconds).toBeLessThan(0.005);
    } finally { runtime.stop(); }
  });
});
