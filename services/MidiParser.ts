
import { pickDrumKit } from './drums/DrumKits';
import * as MidiPackage from '@tonejs/midi';
import { Track, Note, MidiSourceMetadata } from '../types';

// Vite resolves the package's named exports; Node resolves its CommonJS bundle.
const Midi = MidiPackage.Midi
  ?? (MidiPackage as unknown as { default: typeof MidiPackage }).default.Midi;

// Names of melodic instruments that merely contain "drum" or "perc".
const MELODIC_NAME = /steel|taiko|melodic|timpani|\borgan\b|piano|bass|\blead\b/;

export interface ParsedMidi {
  tracks: Track[];
  bpm: number;
  timeSignature: { numerator: number; denominator: number };
  source?: MidiSourceMetadata;
}

export const parseMidiBuffer = (arrayBuffer: ArrayBuffer): ParsedMidi => {
  let midi;
  try {
    midi = new Midi(arrayBuffer);
  } catch {
    throw new Error("Failed to parse MIDI file. The file may be corrupt or in an unsupported format.");
  }

  // MIDI starts at 120 BPM until its first tempo event, even when that event is delayed.
  // That only matters for notes starting strictly between tick 0 and the first tempo tick;
  // otherwise (typical DAW exports put the tempo a few ticks in) the tempo governing the
  // first onset is moved to tick 0 so it is not misread as a tempo change.
  const tempos = midi.header.tempos;
  if (tempos[0]?.ticks > 0) {
    const onsets = midi.tracks.flatMap((track) => track.notes.map((note) => note.ticks)).filter((ticks) => ticks > 0);
    const firstOnset = onsets.reduce((min, ticks) => Math.min(min, ticks), Infinity);
    if (firstOnset < tempos[0].ticks) {
      tempos.unshift({ ticks: 0, bpm: 120 });
    } else {
      // Without an onset after tick 0 there is nothing to govern, so the first tempo stands.
      const governing = firstOnset === Infinity
        ? 0
        : tempos.reduce((last, tempo, index) => (tempo.ticks <= firstOnset ? index : last), 0);
      tempos.splice(0, governing);
      tempos[0].ticks = 0;
    }
    midi.header.update();
  }

  const bpm = midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120;
  const ts = midi.header.timeSignatures.length > 0 
    ? { numerator: midi.header.timeSignatures[0].timeSignature[0], denominator: midi.header.timeSignatures[0].timeSignature[1] }
    : { numerator: 4, denominator: 4 };

  const source: MidiSourceMetadata = {
    ppq: midi.header.ppq,
    tempos: midi.header.tempos.map((tempo) => ({ ticks: tempo.ticks, bpm: tempo.bpm })),
    timeSignatures: midi.header.timeSignatures.map((entry) => ({
      ticks: entry.ticks,
      numerator: entry.timeSignature[0],
      denominator: entry.timeSignature[1],
    })),
  };

  const tracks: Track[] = midi.tracks.map((t, index) => {
    const notes: Note[] = t.notes.map((n, noteIndex) => ({
      note: n.name,
      midi: n.midi,
      noteOn: n.time,
      noteOff: n.time + n.duration,
      velocity: n.velocity,
      source: {
        id: `track-${index}:note-${noteIndex}:${n.ticks}`,
        ticks: n.ticks,
        durationTicks: n.durationTicks,
      },
    }));

    // Program 0 cannot tell a real piano from a track that never sent a program change, so a
    // drum-ish name is only trusted when it is not a melodic name and the notes sit on the kit.
    const nameLower = t.name.toLowerCase().replace(/bass[\s_-]*drum/g, 'kick drum');
    const drumName = (nameLower.includes('drum') || nameLower.includes('perc'))
      && !MELODIC_NAME.test(nameLower);
    // Hand percussion ("Percussion", "Latin Perc") legitimately reaches the top of the supported range (87).
    const kitMax = nameLower.includes('drum') ? 59 : 87;
    const kitNotes = notes.filter((note) => note.midi >= 35 && note.midi <= kitMax).length;
    const inferredDrums = drumName && t.instrument.number === 0
      && notes.every((note) => note.midi >= 27 && note.midi <= 87)
      && kitNotes * 2 >= notes.length;
    const isDrum = t.instrument.percussion || (t.channel === 9) || inferredDrums;

    return {
      id: `track-${index}`,
      name: t.name || `Track ${index + 1}`,
      instrumentFamily: t.instrument.family,
      notes: notes,
      hidden: notes.length === 0,
      isDrum: isDrum,
      // The kit with the most of this part's sounds; the sidebar can change it.
      drumBank: isDrum ? pickDrumKit(notes.map((note) => note.midi)) : undefined,
      color: String(Math.round((index * 360) / Math.max(midi.tracks.length, 8))),
      sourceTiming: source,
    };
  });

  return { tracks, bpm, timeSignature: ts, source };
};

export const parseMidiFile = async (file: File): Promise<ParsedMidi> =>
  parseMidiBuffer(await file.arrayBuffer());
