import * as Tone from "tone";
import { Midi } from "@tonejs/midi";
import { Note, MidiNote, ConversionSettings } from "@/types/music";
import { midiNumberToNoteName } from "./bracketNotation";
import {
  calculateKeySignature,
  KeySignature,
  formatKeySignature,
} from "./musicTheory";

// Default conversion settings
export const DEFAULT_CPS = 0.5; // Strudel default cycles-per-second
export const defaultSettings: ConversionSettings = {
  beatsPerMinute: 120,
  timeSignature: {
    numerator: 4,
    denominator: 4,
  },
  cyclesPerSecond: DEFAULT_CPS,
  selectedTracks: [],
  noteRange: {
    min: 21, // A0
    max: 108, // C8
  },
  velocityThreshold: 0.1,
};

// Calculate cycles per second based on BPM and time signature
// One cycle = one bar/measure, so CPS = bars per second
export function calculateCPS(
  bpm: number,
  timeSignature: { numerator: number; denominator: number }
): number {
  // bpm = beats per minute
  // timeSignature.numerator = beats per bar
  // bars per minute = bpm / timeSignature.numerator
  // bars per second (CPS) = bars per minute / 60
  return bpm / 60 / timeSignature.numerator;
}

// MIDI file analysis result
export interface MidiAnalysis {
  notes: Note[];
  tempo: number;
  timeSignature: { numerator: number; denominator: number };
  trackInfo: Array<{
    name: string;
    instrument: string;
    noteCount: number;
    isPercussion?: boolean; // Whether this track is percussion
    channel?: number; // MIDI channel number
  }>;
  keySignatures?: string[]; // extracted key signatures if present in MIDI header
  calculatedKeySignature?: KeySignature; // calculated key signature from note analysis
  effectiveKeySignature?: string; // the key signature to use (either from MIDI or calculated)
  cyclesPerSecond?: number; // calculated CPS based on tempo and time signature
}

// Analyze MIDI file and extract all information
export async function analyzeMidiFile(file: File): Promise<MidiAnalysis> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const midi = new Midi(arrayBuffer);
        console.log("midi", midi);

        // Extract tempo (first tempo change or default)
        const tempo =
          midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120;

        // Extract time signature (first time signature or default)
        const timeSignature =
          midi.header.timeSignatures.length > 0
            ? {
                numerator: midi.header.timeSignatures[0].timeSignature[0],
                denominator: midi.header.timeSignatures[0].timeSignature[1],
              }
            : { numerator: 4, denominator: 4 };

        // Extract track information
        const trackInfo = midi.tracks.map((track, index) => ({
          name: track.name || `Track ${index + 1}`,
          instrument: track.instrument?.name || "Unknown",
          noteCount: track.notes.length,
          isPercussion: track.instrument?.percussion || track.channel === 9,
          channel: track.channel,
        }));

        // Extract key signature events if available
        const keySignatures: string[] =
          (midi.header as any)?.keySignatures?.map((ks: any) => {
            const key = ks?.key ?? ks?.tonic ?? ks?.scale?.tonic;
            const scale = ks?.scale ?? ks?.mode;
            const keyStr =
              typeof key === "string"
                ? key.toUpperCase()
                : key != null
                ? String(key)
                : undefined;
            const scaleStr =
              typeof scale === "string"
                ? scale.toLowerCase()
                : scale != null
                ? String(scale)
                : undefined;
            return [keyStr, scaleStr].filter(Boolean).join(" ");
          }) || [];

        // Calculate CPS based on tempo and time signature
        // One cycle = one bar, so notes at @1.7778 will be one bar duration
        const cyclesPerSecond = calculateCPS(tempo, timeSignature);
        const allNotes: Note[] = [];

        midi.tracks.forEach((track) => {
          track.notes.forEach((midiNote) => {
            const note: Note = {
              name: midiNumberToNoteName(midiNote.midi),
              start: midiNote.time * cyclesPerSecond,
              release: (midiNote.time + midiNote.duration) * cyclesPerSecond,
              velocity: midiNote.velocity, // Preserve velocity from MIDI
              midiNumber: midiNote.midi, // Preserve MIDI number for drum mapping
            };
            allNotes.push(note);
          });
        });

        allNotes.sort((a, b) => a.start - b.start);
        console.log("Sorted Notes:", allNotes);

        // Calculate key signature if not present in MIDI or if we want to double-check
        const calculatedKeySignature = calculateKeySignature(allNotes);

        // Determine effective key signature (prefer MIDI metadata, fallback to calculated)
        let effectiveKeySignature: string | undefined;
        if (keySignatures && keySignatures.length > 0) {
          effectiveKeySignature = keySignatures[0];
        } else if (calculatedKeySignature) {
          effectiveKeySignature = formatKeySignature(calculatedKeySignature);
        }

        resolve({
          notes: allNotes,
          tempo,
          timeSignature,
          trackInfo,
          keySignatures,
          calculatedKeySignature,
          effectiveKeySignature,
          cyclesPerSecond,
        });
      } catch (error) {
        reject(
          new Error(
            `Failed to analyze MIDI file: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          )
        );
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    reader.readAsArrayBuffer(file);
  });
}

// Convert MIDI file to Note array (legacy function for backward compatibility)
export async function convertMidiToNotes(
  file: File,
  settings: ConversionSettings = defaultSettings
): Promise<Note[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;

        // Parse MIDI using Tone.js
        const midi = new Midi(arrayBuffer);

        // Extract actual tempo and time signature from MIDI file
        const actualTempo =
          midi.header.tempos.length > 0
            ? midi.header.tempos[0].bpm
            : settings.beatsPerMinute;
        const actualTimeSignature =
          midi.header.timeSignatures.length > 0
            ? {
                numerator: midi.header.timeSignatures[0].timeSignature[0],
                denominator: midi.header.timeSignatures[0].timeSignature[1],
              }
            : settings.timeSignature;

        // Calculate CPS from tempo/time signature if not explicitly provided
        // This allows manual override while defaulting to calculated value
        const cyclesPerSecond =
          settings.cyclesPerSecond ??
          calculateCPS(actualTempo, actualTimeSignature);

        const allNotes: Note[] = [];

        // Helper for optional quantization to a fixed cycle grid
        const quantizeCycle = (v: number) => {
          if (!settings.quantize) return v;
          const step = settings.quantizeStep ?? 1 / 32; // default 32nd-cycle grid
          return Math.round(v / step) * step;
        };

        // Helper to snap durations to a strict set of musical units
        const snapDuration = (d: number) => {
          if (!settings.quantizeStrict) return d;
          const allowed = settings.allowedDurations ?? [
            2, 1, 0.5, 0.25, 0.125, 0.0625, 0.03125,
          ];
          let best = allowed[0];
          let bestDiff = Math.abs(d - best);
          for (let i = 1; i < allowed.length; i++) {
            const diff = Math.abs(d - allowed[i]);
            if (diff < bestDiff) {
              bestDiff = diff;
              best = allowed[i];
            }
          }
          return best;
        };

        // Process each track
        midi.tracks.forEach((track, trackIndex) => {
          // Skip track if not selected (empty array means all tracks)
          if (
            settings.selectedTracks.length > 0 &&
            !settings.selectedTracks.includes(trackIndex)
          ) {
            return;
          }

          track.notes.forEach((midiNote) => {
            // Filter by note range
            if (
              midiNote.midi < settings.noteRange.min ||
              midiNote.midi > settings.noteRange.max
            ) {
              return;
            }

            // Filter by velocity threshold
            if (midiNote.velocity < settings.velocityThreshold) {
              return;
            }

            const startCycles = midiNote.time * cyclesPerSecond;
            const endCycles =
              (midiNote.time + midiNote.duration) * cyclesPerSecond;
            const qStart = quantizeCycle(startCycles);
            const qEnd = quantizeCycle(endCycles);
            const snappedDuration = snapDuration(qEnd - qStart);
            const note: Note = {
              name: midiNumberToNoteName(midiNote.midi),
              start: qStart,
              release: qStart + snappedDuration,
              velocity: midiNote.velocity, // Preserve velocity from MIDI
              midiNumber: midiNote.midi, // Preserve MIDI number for drum mapping
            };

            allNotes.push(note);
          });
        });

        // Sort notes by start time
        allNotes.sort((a, b) => a.start - b.start);

        resolve(allNotes);
      } catch (error) {
        reject(
          new Error(
            `Failed to parse MIDI file: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          )
        );
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    reader.readAsArrayBuffer(file);
  });
}

// Audio playback using Tone.js
export class MidiPlayback {
  private synth: Tone.PolySynth;
  private isPlaying = false;
  private startTime = 0;
  private pausedAt = 0;
  private notes: Note[] = [];
  private onTimeUpdate?: (time: number) => void;
  private animationFrame?: number;

  constructor() {
    this.synth = new Tone.PolySynth().toDestination();
  }

  async initialize() {
    // Ensure audio context is started
    if (Tone.getContext().state !== "running") {
      await Tone.start();
    }
  }

  setNotes(notes: Note[]) {
    this.notes = notes;
  }

  setTimeUpdateCallback(callback: (time: number) => void) {
    this.onTimeUpdate = callback;
  }

  async play() {
    if (this.isPlaying) return;

    await this.initialize();

    this.isPlaying = true;
    this.startTime = Tone.now() - this.pausedAt;

    // Schedule notes for playback
    this.notes.forEach((note) => {
      const startTime = this.startTime + note.start;
      const duration = note.release - note.start;

      if (startTime >= Tone.now()) {
        this.synth.triggerAttackRelease(note.name, duration, startTime);
      }
    });

    // Start time update loop
    this.updateTime();
  }

  pause() {
    if (!this.isPlaying) return;
    //
    this.isPlaying = false;
    this.pausedAt = Tone.now() - this.startTime;

    // Stop all scheduled notes
    this.synth.releaseAll();

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }

  reset() {
    this.pause();
    this.pausedAt = 0;
    this.onTimeUpdate?.(0);
  }

  private updateTime() {
    if (!this.isPlaying) return;

    const currentTime = Tone.now() - this.startTime;
    this.onTimeUpdate?.(currentTime);

    // Check if playback should stop
    const totalDuration =
      this.notes.length > 0 ? Math.max(...this.notes.map((n) => n.release)) : 0;
    if (currentTime >= totalDuration) {
      this.isPlaying = false;
      this.pausedAt = 0;
      this.onTimeUpdate?.(0);
      return;
    }

    this.animationFrame = requestAnimationFrame(() => this.updateTime());
  }

  dispose() {
    this.pause();
    this.synth.dispose();
  }
}
