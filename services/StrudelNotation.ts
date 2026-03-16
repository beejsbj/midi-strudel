/**
 * StrudelNotation — public entry point.
 *
 * Implementation is split across focused modules under services/notation/:
 *   NotationUtils   — pure helpers (math, formatting, isRest, etc.)
 *   GridBuilder     — LCM/GCD grid construction and subdivision rendering
 *   DrumRenderer    — drum track → Strudel notation
 *   MelodicRenderer — melody + harmony voice splitting and rendering
 */

import { StrudelConfig, Track } from '../types';
import { DRUM_MAP } from '../constants';
import { renderDrumTrack } from './notation/DrumRenderer';
import { renderMelodicTrack } from './notation/MelodicRenderer';
import { gcd, getMeasureDuration, prepareNotes } from './notation/NotationUtils';

export class StrudelNotation {
  private config: StrudelConfig;

  constructor(config: StrudelConfig) {
    this.config = config;
  }

  public generate(tracks: Track[]): string {
    const preparedTracks = tracks.map((track) => {
      const preparedNotes = track.isDrum
        ? prepareNotes(track.notes.filter((note) => DRUM_MAP[note.midi]), this.config)
        : prepareNotes(track.notes, this.config);

      return { track, preparedNotes };
    });

    // 1. Calculate Global Song Duration
    let maxDuration = preparedTracks.reduce((max, entry) => {
      const trackMax = entry.preparedNotes.reduce((m, n) => Math.max(m, n.noteOff), 0);
      return Math.max(max, trackMax);
    }, 0);

    const barDur = getMeasureDuration(this.config);
    if (maxDuration === 0) maxDuration = barDur;

    // 2. Generate CPS setup
    const cpsFormula = this.getCpsFormula();

    const timeSig = `${this.config.timeSignature.numerator}/${this.config.timeSignature.denominator}`;
    const title = this.config.fileName ?? 'MIDI Conversion';
    let output = [
      `// @title ${title}`,
      `// @by midi-strudel`,
      `// @details BPM: ${this.config.sourceBpm} | Time: ${timeSig}`,
      ``,
      `const BPM = ${this.config.bpm};`,
      `setcps(${cpsFormula});`,
      ``,
      ``,
    ].join('\n');

    preparedTracks.forEach(({ track, preparedNotes }) => {
      if (track.hidden) return;
      if (!preparedNotes.length) return;

      if (track.isDrum) {
        output += renderDrumTrack(track, maxDuration, this.config, preparedNotes);
      } else {
        output += renderMelodicTrack(track, maxDuration, this.config, preparedNotes);
      }
      output += '\n';
    });

    return output;
  }

  private getCpsFormula(): string {
    const numerator = this.config.timeSignature.numerator || 4;
    const denominator = this.config.timeSignature.denominator || 4;
    const quarterNotesPerCycle =
      this.config.cycleUnit === 'bar' ? numerator * 4 : 4;
    const commonFactor = gcd(denominator, quarterNotesPerCycle);
    const scaledNumerator = denominator / commonFactor;
    const scaledDenominator = quarterNotesPerCycle / commonFactor;

    if (scaledNumerator === 1 && scaledDenominator === 1) {
      return 'BPM / 60';
    }
    if (scaledNumerator === 1) {
      return `BPM / 60 / ${scaledDenominator}`;
    }
    if (scaledDenominator === 1) {
      return `BPM / 60 * ${scaledNumerator}`;
    }
    return `BPM / 60 * ${scaledNumerator} / ${scaledDenominator}`;
  }
}
