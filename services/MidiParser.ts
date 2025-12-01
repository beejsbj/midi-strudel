

import { Midi } from 'https://esm.sh/@tonejs/midi@2.0.28';
import { Track, Note } from '../types';

export const parseMidiFile = async (file: File): Promise<{ tracks: Track[], bpm: number, timeSignature: {numerator: number, denominator: number} }> => {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);

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
    const isDrum = t.instrument.percussion || (t.channel === 9) || t.name.toLowerCase().includes('drum');

    return {
      id: `track-${index}`,
      name: t.name || `Track ${index + 1}`,
      instrumentFamily: t.instrument.family,
      notes: notes,
      hidden: notes.length === 0,
      isDrum: isDrum,
      drumBank: isDrum ? "RolandTR909" : undefined // Default bank
    };
  });

  return { tracks, bpm, timeSignature: ts };
};