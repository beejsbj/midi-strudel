import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';
import { Note, MidiNote, ConversionSettings } from '@/types/music';
import { midiNumberToNoteName } from './bracketNotation';

// Default conversion settings
export const defaultSettings: ConversionSettings = {
  beatsPerMinute: 120,
  timeSignature: {
    numerator: 4,
    denominator: 4
  },
  selectedTracks: [],
  noteRange: {
    min: 21, // A0
    max: 108 // C8
  },
  velocityThreshold: 0.1
};

// Convert MIDI file to Note array
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
        
        // Calculate beats per second from BPM
        const beatsPerSecond = settings.beatsPerMinute / 60;
        
        const allNotes: Note[] = [];
        
        // Process each track
        midi.tracks.forEach((track, trackIndex) => {
          // Skip track if not selected (empty array means all tracks)
          if (settings.selectedTracks.length > 0 && !settings.selectedTracks.includes(trackIndex)) {
            return;
          }
          
          track.notes.forEach(midiNote => {
            // Filter by note range
            if (midiNote.midi < settings.noteRange.min || midiNote.midi > settings.noteRange.max) {
              return;
            }
            
            // Filter by velocity threshold
            if (midiNote.velocity < settings.velocityThreshold) {
              return;
            }
            
            const note: Note = {
              name: midiNumberToNoteName(midiNote.midi),
              start: midiNote.time * beatsPerSecond,
              release: (midiNote.time + midiNote.duration) * beatsPerSecond
            };
            
            allNotes.push(note);
          });
        });
        
        // Sort notes by start time
        allNotes.sort((a, b) => a.start - b.start);
        
        resolve(allNotes);
      } catch (error) {
        reject(new Error(`Failed to parse MIDI file: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
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
    if (Tone.getContext().state !== 'running') {
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
    this.notes.forEach(note => {
      const startTime = this.startTime + note.start;
      const duration = note.release - note.start;
      
      if (startTime >= Tone.now()) {
        this.synth.triggerAttackRelease(
          note.name,
          duration,
          startTime
        );
      }
    });
    
    // Start time update loop
    this.updateTime();
  }

  pause() {
    if (!this.isPlaying) return;
    
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
    const totalDuration = this.notes.length > 0 ? Math.max(...this.notes.map(n => n.release)) : 0;
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