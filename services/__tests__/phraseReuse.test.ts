import { readFile } from 'node:fs/promises';
import MidiPackage from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { convertMidi, type ConversionOverrides } from '../convertMidi';
import { evaluateGeneratedStrudelCode, gateTolerance } from './helpers/strudelRuntime';
import { earNotes } from './helpers/earOracle';
import { DRUM_MAP } from '../../constants';
import { StrudelNotation } from '../StrudelNotation';

const { Midi } = MidiPackage;
const makeMidi = () => {
  const midi = new Midi();
  midi.header.setTempo(120);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4], measures: 0 });
  return midi;
};
const addRiff = (track: ReturnType<InstanceType<typeof Midi>['addTrack']>, start: number, variation = '') => {
  for (let index = 0; index < 12; index++) {
    track.addNote({ midi: 60 + index % 7 + (variation === 'pitch' && index === 3 ? 1 : 0),
      ticks: start + index * 160 + (variation === 'jitter' ? 20 : variation === 'inaudible' ? 5 : 0),
      durationTicks: 120 + (variation === 'release' && index === 3 ? 30 : 0),
      velocity: variation === 'velocity' ? 0.4 : 0.8 });
  }
  // A deliberate double differs in length; an identical one is an export artifact.
  if (variation === 'duplicate') track.addNote({ midi: 60, ticks: start, durationTicks: 60, velocity: 0.8 });
  if (variation === 'identical') track.addNote({ midi: 60, ticks: start, durationTicks: 120, velocity: 0.8 });
};
const numericPitch = (value: unknown): number => {
  if (typeof value === 'number') return value;
  const match = /^([A-Ga-g])([#b]*)(-?\d+)$/.exec(String(value))!;
  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1].toUpperCase()];
  return (Number(match[3]) + 1) * 12 + semitone + [...match[2]].reduce((sum, char) => sum + (char === '#' ? 1 : -1), 0);
};

/**
 * Fully identical doubles (pitch, start, length, velocity) are expected to
 * merge. A drum plays its sample once per instant, at the loudest hit.
 */
const uniqueNotes = <T extends { midi: number; time: number; duration: number; velocity: number }>(notes: T[], drum = false): T[] => {
  const at = (seconds: number) => Math.round(seconds * 1e9);
  if (drum) {
    const loudest = new Map<string, T>();
    for (const note of notes) {
      const key = `${DRUM_MAP[note.midi] ?? note.midi}:${at(note.time)}`;
      if (!loudest.has(key) || note.velocity > loudest.get(key)!.velocity) loudest.set(key, note);
    }
    return [...loudest.values()];
  }
  const seen = new Set<string>();
  return notes.filter((note) => {
    const key = `${note.midi}:${at(note.time)}:${at(note.duration)}:${note.velocity}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
};

/** Independent source oracle: fresh parse, no converter event preparation. */
async function verify(bytes: ArrayBuffer, overrides: ConversionOverrides = {}) {
  const result = convertMidi(bytes, 'arbitrary.mid', { includeVelocity: true, ...overrides });
  const source = new Midi(bytes);
  const ratio = result.config.sourceBpm / result.config.bpm;
  const period = result.sharedSpanSeconds * ratio;
  const expected = [0, period].flatMap((offset) => source.tracks.flatMap((track) => uniqueNotes(earNotes(track.notes, result.config.sourceBpm, source.header.ppq), track.channel === 9).flatMap((note) => {
    const drum = track.channel === 9;
    if (drum && !DRUM_MAP[note.midi]) return [];
    const { time: onset, duration } = note;
    // Zero-length pitched notes are silent and dropped; drum hits are one-shots.
    if (!drum && duration <= 0) return [];
    return [{ onset: onset * ratio + offset, end: (onset + duration) * ratio + offset,
      pitch: drum ? DRUM_MAP[note.midi] : note.midi, velocity: note.velocity }];
  })));
  const runtime = await evaluateGeneratedStrudelCode(result.code, { exactBpm: result.config.bpm });
  try {
    const queried = period > 1000
      ? expected.flatMap((event) => runtime.querySeconds(event.onset - 1e-6, event.onset + 1e-6))
      : runtime.querySeconds(0, period * 2);
    const actual = queried.map((event) => ({
      event, pitch: event.value.note === undefined ? String(event.value.s) : numericPitch(event.value.note),
      velocity: Number(event.value.velocity ?? 1),
    }));
    expect(actual).toHaveLength(expected.length);
    // Pair within each pitch+onset group by nearest gate and velocity: rounded
    // gates can reorder duplicate attacks whose releases nearly coincide.
    const key = (onset: number, pitch: unknown) => `${Math.round(onset * 1e7)}:${String(pitch)}`;
    const groups = new Map<string, typeof expected>();
    for (const want of expected) {
      const group = groups.get(key(want.onset, want.pitch)) ?? [];
      group.push(want);
      groups.set(key(want.onset, want.pitch), group);
    }
    for (const { event, pitch, velocity } of actual) {
      const group = groups.get(key(event.onsetSeconds, pitch)) ?? [];
      expect(group.length, `unexpected ${String(pitch)} at ${event.onsetSeconds}`).toBeGreaterThan(0);
      let best = 0;
      group.forEach((want, index) => {
        const score = (candidate: typeof want) => Math.abs(event.gateEndSeconds - candidate.end) + Math.abs(velocity - candidate.velocity);
        if (score(want) < score(group[best])) best = index;
      });
      const want = group.splice(best, 1)[0];
      expect(Math.abs(event.onsetSeconds - want.onset)).toBeLessThan(1e-6);
      // Drum samples play out: only their onsets are part of the contract.
      if (typeof want.pitch === 'number') expect(Math.abs(event.gateEndSeconds - want.end)).toBeLessThanOrEqual(gateTolerance(event) + 1e-6);
      // Velocity is emitted with three decimals.
      if (result.config.includeVelocity) expect(Math.abs(velocity - want.velocity)).toBeLessThanOrEqual(0.0005 + 1e-12);
    }
    const occurrenceSample = result.patterns.occurrences.length <= 12 ? result.patterns.occurrences
      : result.patterns.occurrences.filter((_, index) => index % Math.ceil(result.patterns.occurrences.length / 12) === 0);
    for (const boundary of [period, period * 2, ...occurrenceSample.flatMap((occurrence) =>
      [occurrence.startSeconds * ratio, occurrence.endSeconds * ratio])]) {
      const observed = runtime.querySeconds(boundary - 0.000001, boundary + 0.000001);
      const expectedCount = expected.filter((event) => event.onset >= boundary - 0.000001 && event.onset < boundary + 0.000001).length;
      // The final loop boundary begins a third loop, outside the two-loop oracle.
      if (boundary < period * 2) expect(observed).toHaveLength(expectedCount);
    }
  } finally { runtime.stop(); }
  return result;
}

describe('exact phrase reuse through public conversion', () => {
  it('restarts nonadjacent phrases at local zero with intervening material and common silence', async () => {
    const midi = makeMidi();
    const track = midi.addTrack();
    addRiff(track, 1920); addRiff(track, 7680); addRiff(track, 9600);
    track.addNote({ midi: 47, ticks: 3900, durationTicks: 2500, velocity: 0.6 });
    const result = await verify(midi.toArray().buffer, { timeSignature: { numerator: 3, denominator: 4 }, bpm: 90 });
    expect(result.patterns.definitions).toHaveLength(1);
    expect(result.patterns.occurrences.map((occurrence) => occurrence.sourceStartMeasure)).toEqual([2, 5, 6]);
    expect(result.code).toContain('.pickRestart(');
    expect(result.code).toMatch(/^const [a-z0-9_]+ = \{$/m);
    expect(result.code).not.toMatch(/const track\d+(Phrase|Timeline)/);
    expect(result.patterns.definitions[0].id).toBe('track1Phrase1');
    expect(result.patterns.definitions[0].name).toMatch(/^[a-z0-9_]+\.a$/);
    expect(result.patterns.occurrences.flatMap((occurrence) => occurrence.sourceNoteIds)).toHaveLength(36);
    expect(result.code).toContain('<~ a b@2 a!2>');
    expect(result.code).toMatch(/"<~ a b@2 a!2>"(\.slow\([^)]+\))?\n {2}\.pickRestart\(\w+\)/);
    expect(result.code).not.toContain('cat(');
    expect(result.code).not.toContain('.slow(8)');
  });

  it('keeps one-off passages in one library without claiming discovered repetition', async () => {
    const midi = makeMidi(); const track = midi.addTrack(); track.name = 'Grand Piano (Classic)';
    // A duplicated attack and a gate crossing two bars must survive the passage.
    track.addNote({ midi: 60, ticks: 0, durationTicks: 4000, velocity: 0.6 });
    track.addNote({ midi: 60, ticks: 0, durationTicks: 4000, velocity: 0.6 });
    track.addNote({ midi: 67, ticks: 3840, durationTicks: 120, velocity: 0.8 });
    track.addNote({ midi: 72, ticks: 6 * 1920, durationTicks: 240, velocity: 0.7 });
    const result = await verify(midi.toArray().buffer);
    expect(result.patterns).toEqual({ definitions: [], occurrences: [] });
    expect(result.code.match(/^const /gm)).toEqual(['const ', 'const ']);
    expect(result.code).toContain('const piano = {');
    expect(result.code).toContain('<a@3 ~@3 b>');
    expect(result.code).toContain('.pickRestart(piano)');
    expect(result.code.match(/^\$piano:/gm)).toHaveLength(1);
    expect(result.code).not.toMatch(/_MELODY|_HARMONY|\.slow\(7\)/);
  });

  it('keeps colliding track names and object-sensitive names in separate namespaces', async () => {
    const midi = makeMidi();
    for (const [index, name] of ['Piano', 'Piano', 'piano_2', '__proto__', 'constructor', '123'].entries()) {
      const track = midi.addTrack(); track.name = name;
      track.addNote({ midi: 48 + index, ticks: index * 1920, durationTicks: 240, velocity: 0.5 + index / 20 });
    }
    const result = await verify(midi.toArray().buffer);
    const labels = [...result.code.matchAll(/^\$([a-z0-9_]+):/gm)].map((match) => match[1]);
    expect(labels).toHaveLength(6);
    expect(new Set(labels).size).toBe(6);
    expect(labels).toEqual(['piano', 'piano_2', 'piano_2_2', 'proto', 'constructor', 'track_123']);
    // Each track declares its own phrase object under its label.
    for (const label of labels) expect(result.code).toContain(`const ${label} = {`);
  });

  it('heads each track block with a full-width rule naming the track', async () => {
    const midi = makeMidi();
    for (const [index, name] of ['Grand Piano', 'Bass'].entries()) {
      const track = midi.addTrack(); track.name = name;
      track.addNote({ midi: 48 + index, ticks: index * 1920, durationTicks: 240, velocity: 0.5 });
    }
    const result = await verify(midi.toArray().buffer);
    const rules = result.code.split('\n').filter((line) => line.startsWith('// ── '));
    expect(rules.map((line) => /^\/\/ ── (.+?) ─+$/.exec(line)?.[1])).toEqual(['Grand Piano', 'Bass']);
    rules.forEach((line) => expect(line).toHaveLength(100));
    expect(result.code).toMatch(/\/\/ ── Bass ─+\nconst bass = \{/);
  });

  it('keeps labels clear of JS reserved words and the Strudel calls the code makes', async () => {
    const midi = makeMidi();
    for (const [index, name] of ['New', 'Note', 'Stack'].entries()) {
      const track = midi.addTrack(); track.name = name;
      track.addNote({ midi: 48 + index, ticks: index * 1920, durationTicks: 240, velocity: 0.5 });
    }
    const result = await verify(midi.toArray().buffer);
    expect([...result.code.matchAll(/^\$([a-z0-9_]+):/gm)].map((match) => match[1]))
      .toEqual(['track_new', 'track_note', 'track_stack']);
  });

  it('continues short passage keys beyond z without duplicating notes', async () => {
    const midi = makeMidi(); const track = midi.addTrack(); track.name = 'Piano';
    for (let index = 0; index < 28; index++) {
      track.addNote({ midi: 40 + index, ticks: index * 3840, durationTicks: 120, velocity: 0.7 });
    }
    const result = await verify(midi.toArray().buffer);
    expect(result.patterns.definitions).toEqual([]);
    expect(result.code).toContain('\n  aa:');
    expect(result.code).toContain('\n  ab:');
    expect(result.code).toContain('z ~ aa ~ ab\n>`');
    // The 56-bar timeline is wider than a line, so it wraps into a block.
    expect(result.code).toMatch(/\$piano: `<\n {2}a ~ b ~ /);
  });

  it('drops a silent zero-length pitched note without disturbing its neighbours', async () => {
    const midi = makeMidi(); const track = midi.addTrack(); track.name = 'Piano';
    addRiff(track, 0);
    track.addNote({ midi: 84, ticks: 480, durationTicks: 0, velocity: 0.4 });
    const result = await verify(midi.toArray().buffer);
    expect(result.code).not.toContain('.late(');
    expect(result.code).not.toContain('C6');
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'dropped-silent-notes', count: 1 })]);
  });

  it('keeps a zero-length drum hit audible as a one-shot without clip', async () => {
    const midi = makeMidi(); const track = midi.addTrack(); track.channel = 9;
    for (let beat = 0; beat < 4; beat++) track.addNote({ midi: 36, ticks: beat * 480, durationTicks: beat === 2 ? 0 : 60, velocity: 0.8 });
    const result = await verify(midi.toArray().buffer);
    expect(result.code).toContain('s(`bd!4`)');
    expect(result.code).not.toContain('.clip(');
    expect(result.diagnostics).toEqual([]);
  });

  it.each([2, 4])('extracts safe %i-measure phrases without severing internal sustains', async (measures) => {
    const midi = makeMidi();
    const track = midi.addTrack();
    const starts = [1920, (measures + 4) * 1920];
    for (const start of starts) {
      for (let bar = 0; bar < measures; bar++) {
        addRiff(track, start + bar * 1920);
        if (bar < measures - 1) track.addNote({ midi: 43 + bar, ticks: start + (bar + 1) * 1920 - 120,
          durationTicks: 240, velocity: 0.7 });
      }
    }
    const result = await verify(midi.toArray().buffer);
    expect(result.patterns.definitions).toHaveLength(1);
    expect(result.patterns.definitions[0].measureCount).toBe(measures);
    expect(result.patterns.occurrences).toHaveLength(2);
  });

  it.each(['pitch', 'release', 'duplicate', 'velocity', 'jitter'])('does not merge a changed %s', async (variation) => {
    const midi = makeMidi(); const track = midi.addTrack();
    addRiff(track, 0); addRiff(track, 3840, variation);
    const result = await verify(midi.toArray().buffer);
    expect(result.patterns.definitions).toEqual([]);
  });

  it('hears a riff played 5 ms late as the same phrase', async () => {
    const midi = makeMidi(); const track = midi.addTrack();
    addRiff(track, 0); addRiff(track, 3840, 'inaudible');
    const result = await verify(midi.toArray().buffer);
    expect(result.patterns.definitions).toHaveLength(1);
  });

  it('merges an identical double so the repeated phrase still matches', async () => {
    const midi = makeMidi(); const track = midi.addTrack();
    addRiff(track, 0); addRiff(track, 3840, 'identical');
    const result = await verify(midi.toArray().buffer);
    expect(result.patterns.definitions).toHaveLength(1);
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'merged-duplicate-notes', count: 1 })]);
  });

  it('matches only retained velocity and ear-snapped timings', async () => {
    const midi = makeMidi(); const track = midi.addTrack();
    addRiff(track, 0); addRiff(track, 3840, 'velocity'); addRiff(track, 7680, 'velocity');
    expect((await verify(midi.toArray().buffer, { includeVelocity: false })).patterns.definitions).toHaveLength(1);
    // Each legato occurrence is played 5, 7 and 9 ms late: heard on the grid, one phrase.
    const played = makeMidi(); const pt = played.addTrack();
    for (const start of [0, 3840, 7680]) for (let index = 0; index < 12; index++) {
      pt.addNote({ midi: 60 + index % 7, ticks: start + index * 120 + 5 + start / 3840 * 2, durationTicks: 120, velocity: 0.7 });
    }
    const snapped = await verify(played.toArray().buffer);
    expect(snapped.patterns.definitions).toHaveLength(1);
    expect(snapped.diagnostics).toContainEqual(expect.objectContaining({ code: 'snapped-to-ear', count: 36 }));
  });

  it('keeps musical matches stable under file and source identity changes', () => {
    const midi = makeMidi(); const track = midi.addTrack(); addRiff(track, 0); addRiff(track, 3840);
    const first = convertMidi(midi.toArray().buffer, 'first.mid');
    const renamed = convertMidi(midi.toArray().buffer, 'renamed.mid');
    expect(renamed.patterns).toEqual(first.patterns);
    const tracks = first.tracks.map((item) => ({ ...item, id: `new-${item.id}`, notes: [...item.notes].reverse()
      .map((note) => ({ ...note, source: { ...note.source!, id: `new-${note.source!.id}` } })) }));
    const changed = new StrudelNotation(first.config).generateWithDiagnostics(tracks);
    expect(changed.patterns.definitions.map(({ name }) => name)).toEqual(first.patterns.definitions.map(({ name }) => name));
    expect(changed.patterns.occurrences.map(({ sourceStartMeasure }) => sourceStartMeasure))
      .toEqual(first.patterns.occurrences.map(({ sourceStartMeasure }) => sourceStartMeasure));
  });

  it('matches simultaneous event permutations in a different PPQ and source meter', async () => {
    const midi = makeMidi();
    midi.header.fromJSON({ ...midi.header.toJSON(), ppq: 960 });
    midi.header.timeSignatures = [{ ticks: 0, timeSignature: [7, 8], measures: 0 }];
    const track = midi.addTrack();
    for (const [occurrence, start] of [3360, 10080, 13440].entries()) {
      for (let index = 0; index < 14; index++) {
        const chord = occurrence % 2 ? [67, 60, 64] : [60, 64, 67];
        chord.forEach((pitch) => track.addNote({ midi: pitch + index % 3, ticks: start + index * 240,
          durationTicks: pitch === 67 ? 180 : 120, velocity: 0.6 }));
      }
    }
    const result = await verify(midi.toArray().buffer, { timeSignature: { numerator: 3, denominator: 4 } });
    expect(result.patterns.definitions).toHaveLength(1);
    expect(result.patterns.occurrences.map((occurrence) => occurrence.sourceStartMeasure)).toEqual([2, 4, 5]);
  });

  it('falls back faithfully when the deterministic source-span budget is exhausted', async () => {
    const midi = makeMidi(); const track = midi.addTrack();
    track.addNote({ midi: 60, ticks: 9000 * 1920, durationTicks: 120, velocity: 0.8 });
    const result = await verify(midi.toArray().buffer);
    expect(result.patterns.definitions).toEqual([]);
    expect(result.diagnostics.filter(({ code }) => code === 'phrase-analysis-budget')).toHaveLength(1);
  });

  it('names a short one-bar figure repeated in adjacent bars as one phrase', async () => {
    const midi = makeMidi();
    const track = midi.addTrack();
    for (let bar = 2; bar < 10; bar++) {
      track.addNote({ midi: 33, ticks: bar * 1920, durationTicks: 480, velocity: 0.8 });
      track.addNote({ midi: 40, ticks: bar * 1920, durationTicks: 480, velocity: 0.8 });
    }
    const result = await verify(midi.toArray().buffer, { includeVelocity: false });
    expect(result.patterns.definitions).toHaveLength(1);
    expect(result.patterns.occurrences).toHaveLength(8);
    expect(result.code).toContain('"<~@2 a!8>"');
  });

  describe.each([
    ['a repeated 4-bar phrase is not chopped around a bar recurring inside it', 'XYXZXYXZ', '"<a@4 a@4>"', 1],
    ['a 2-bar unit repeated four times is named at its own size', 'XYXYXYXY', '"<a@2 a@2 a@2 a@2>"', 1],
    ['one bar repeated eight times is one phrase with one selector', 'XXXXXXXX', '"<a!8>"', 1],
  ])('phrase choice: %s', (_, form, selector, definitions) => {
    it('prefers the smallest unit that explains the most bars', async () => {
      const bars: Record<string, number[]> = { X: [60, 62, 64, 65], Y: [67, 65, 64, 62], Z: [60, 55, 57, 59] };
      const midi = makeMidi();
      const track = midi.addTrack();
      [...form].forEach((name, bar) => bars[name].forEach((pitch, beat) =>
        track.addNote({ midi: pitch, ticks: bar * 1920 + beat * 480, durationTicks: 480, velocity: 0.8 })));
      const result = await verify(midi.toArray().buffer);
      expect(result.code).toContain(`${selector}\n  .pickRestart(`);
      expect(result.patterns.definitions).toHaveLength(definitions);
    });
  });

  it('does not emit duplicate library entries with identical expressions', async () => {
    // Regression test: identical expressions should share one library key
    const midi = makeMidi();
    const track = midi.addTrack();
    track.name = 'Bass';
    const pattern = [60, 62, 64, 65];
    for (const passageStart of [1920 * 2, 1920 * 5]) {
      for (let noteIndex = 0; noteIndex < 4; noteIndex++) {
        track.addNote({
          midi: pattern[noteIndex],
          ticks: passageStart + noteIndex * 480,
          durationTicks: 360,
          velocity: 0.7,
        });
      }
    }
    const result = await verify(midi.toArray().buffer);
    const libraryMatch = result.code.match(/const bass = \{([^}]+)\}/s);
    expect(libraryMatch).toBeDefined();
    const definitions = libraryMatch![1].match(/^\s+[a-z]+:/gm);
    // Should have at most 1 definition (one-off passages with identical expressions)
    expect(definitions?.length).toBeLessThanOrEqual(1);
  });

  it.each([
    ['ruthlessness', 'Grand Piano (Classic)', [3, 4, 5, 7, 8, 9]],
    ['warrior-of-the-mind', 'Grand Piano', [2, 4, 6, 8]],
  ] as const)('recovers required source-linked phrases in %s', async (file, name, bars) => {
    const bytes = await readFile(new URL(`../../public/examples/${file}-epic-the-musical.mid`, import.meta.url));
    const result = await verify(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const track = result.tracks.find((entry) => entry.name === name)!;
    const group = result.patterns.definitions.find((definition) => definition.trackId === track.id &&
      result.patterns.occurrences.filter((occurrence) => occurrence.definitionId === definition.id)
        .map((occurrence) => occurrence.sourceStartMeasure).join(',') === bars.join(','));
    expect(group).toBeDefined();
    if (file === 'warrior-of-the-mind') {
      const drum = result.tracks.find((entry) => entry.name === '2013 Drum Kit')!;
      const hiHat = result.patterns.definitions.find((definition) => definition.trackId === drum.id && definition.sourceNoteIds.length === 8
        // The 18 known repeats; merging identical doubles lets two more bars match.
        && result.patterns.occurrences.filter((occurrence) => occurrence.definitionId === definition.id).length >= 18);
      expect(hiHat).toBeDefined();
    }
  }, 60000);
});
