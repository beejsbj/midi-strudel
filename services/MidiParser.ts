
import MidiPackage from '@tonejs/midi';
import { Track, Note } from '../types';

const { Midi } = MidiPackage;

export interface ParsedMidi {
  tracks: Track[];
  bpm: number;
  timeSignature: { numerator: number; denominator: number };
}

export const parseMidiBuffer = (arrayBuffer: ArrayBuffer): ParsedMidi => {
  let midi;
  try {
    midi = new Midi(arrayBuffer);
  } catch {
    throw new Error("Failed to parse MIDI file. The file may be corrupt or in an unsupported format.");
  }

  const bpm = midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 120;
  const ts = midi.header.timeSignatures.length > 0 
    ? { numerator: midi.header.timeSignatures[0].timeSignature[0], denominator: midi.header.timeSignatures[0].timeSignature[1] }
    : { numerator: 4, denominator: 4 };

  const tracks: Track[] = midi.tracks.map((t, index) => {
    const notes: Note[] = t.notes.map(n => ({
      note: n.name,
      midi: n.midi,
      noteOn: n.time,
      noteOff: n.time + n.duration,
      velocity: n.velocity
    }));

    // Improved drum detection: Channel 10 (index 9) or explicit percussion flag or name
    const nameLower = t.name.toLowerCase();
    const isDrum = t.instrument.percussion || (t.channel === 9) || nameLower.includes('drum') || nameLower.includes('perc');

    return {
      id: `track-${index}`,
      name: t.name || `Track ${index + 1}`,
      instrumentFamily: t.instrument.family,
      notes: notes,
      hidden: notes.length === 0,
      isDrum: isDrum,
      drumBank: isDrum ? "RolandTR909" : undefined, // Default bank
      color: String(Math.round((index * 360) / Math.max(midi.tracks.length, 8))),
    };
  });

  return { tracks, bpm, timeSignature: ts };
};

export const parseMidiFile = async (file: File): Promise<ParsedMidi> =>
  parseMidiBuffer(await file.arrayBuffer());
