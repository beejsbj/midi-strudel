declare module 'https://esm.sh/@tonejs/midi@2.0.28' {
  export interface MidiHeaderTempo {
    bpm: number;
  }

  export interface MidiHeaderTimeSignature {
    timeSignature: [number, number];
  }

  export interface MidiNote {
    name: string;
    midi: number;
    time: number;
    duration: number;
    velocity: number;
  }

  export interface MidiTrack {
    name: string;
    channel: number;
    notes: MidiNote[];
    instrument: {
      family: string;
      percussion: boolean;
    };
  }

  export class Midi {
    header: {
      tempos: MidiHeaderTempo[];
      timeSignatures: MidiHeaderTimeSignature[];
    };
    tracks: MidiTrack[];

    constructor(data: ArrayBuffer);
  }
}
