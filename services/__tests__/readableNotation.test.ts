import MidiPackage from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { convertMidi, type ConversionOverrides } from '../convertMidi';
import { DRUM_MAP } from '../../constants';
import { evaluateGeneratedStrudelCode, gateTolerance } from './helpers/strudelRuntime';

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
      expect(Math.abs(event.gateEndSeconds - want.end)).toBeLessThanOrEqual(gateTolerance(event));
      if (result.config.includeVelocity) expect(event.value.velocity).toBe(Math.round(want.velocity * 1000) / 1000);
    });
  } finally { runtime.stop(); }
  return result;
}

const phraseLibrary = (code: string) => code.slice(code.indexOf('const phrases = {'), code.indexOf('\n};') + 3);

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
    expect(library).toContain('<[D2,D3] [E2,E3] [F2,F3] [[G2,G3] ~]>');
    expect(library).not.toContain('.clip(');
    expect(library).not.toContain('.slow(');
  });

  it('keeps one .slow per measure when a cycle is a beat', async () => {
    const bytes = score((track) => {
      track.addNote({ midi: 60, ticks: 0, durationTicks: 480 });
      track.addNote({ midi: 62, ticks: 1920 + 480, durationTicks: 480 });
    });
    const result = await convertAndVerify(bytes, { cycleUnit: 'beat' });
    expect(result.code).toMatch(/<C4 ~!3 \[~ D4 ~!2\]>|<\[C4 ~!3\] \[~ D4 ~!2\]>/);
    expect(result.code).toContain('.slow(4)');
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

  it('uses colon fields for relative pitches and drums', async () => {
    const relative = score((track) => {
      [60, 62, 64, 65, 67, 69, 71, 72].forEach((midi, index) =>
        track.addNote({ midi, ticks: index * 240, durationTicks: index % 2 ? 60 : 240, velocity: 0.8 }));
    });
    const relativeResult = await convertAndVerify(relative, { controlSyntax: 'colon', notationType: 'relative' });
    expect(relativeResult.code).toContain('.as("n:clip").scale(');

    const kit = score((track) => {
      track.addNote({ midi: 36, ticks: 0, durationTicks: 480, velocity: 0.8 });
      track.addNote({ midi: 49, ticks: 0, durationTicks: 720, velocity: 0.8 });
      track.addNote({ midi: 38, ticks: 960, durationTicks: 120, velocity: 0.8 });
    }, true);
    const kitResult = await convertAndVerify(kit, { controlSyntax: 'colon' });
    expect(kitResult.code).toContain('.as("s:clip")');
    expect(kitResult.code).not.toContain('stack(');
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
  const passage = (code: string) => /: note\(`([\s\S]*?)`\)/.exec(code)![1];

  it('puts N measures on a line in measure mode', async () => {
    const result = await convertAndVerify(bytes, { formatPerLineBy: 'measure', measuresPerLine: 1 });
    const lines = passage(result.code).split('\n').map((line) => line.trim()).filter(Boolean);
    expect(lines[0]).toBe('<');
    expect(lines.at(-1)).toBe('>');
    expect(lines.slice(1, -1)).toHaveLength(3);
    lines.slice(1, -1).forEach((line) => expect(line).toMatch(/^\[\[.*\]\]$/));
  });

  it('breaks after N notes only between beats in note mode', async () => {
    const result = await convertAndVerify(bytes, { formatPerLineBy: 'note', measuresPerLine: 6 });
    const lines = passage(result.code).split('\n').map((line) => line.trim()).filter((line) => line && line !== '<' && line !== '>');
    expect(lines).toHaveLength(6);
    // Every line holds two whole triplet beats; no beat is split. Measure
    // brackets may open or close across lines.
    lines.forEach((line) => expect(line.match(/\[[^[\]]+\]/g)).toHaveLength(2));
    lines.forEach((line) => expect(line).toMatch(/^\[{0,2}[^[\]]+\] \[[^[\]]+\]{1,2}$/));
  });

  it('does not wrap a passage shorter than the line length', async () => {
    const result = await convertAndVerify(bytes, { formatPerLineBy: 'measure', measuresPerLine: 4 });
    expect(passage(result.code)).not.toContain('\n');
  });
});
