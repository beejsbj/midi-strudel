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
import { renderDrumTrack } from './notation/DrumRenderer';
import { renderMelodicTrack } from './notation/MelodicRenderer';

export class StrudelNotation {
  private config: StrudelConfig;

  constructor(config: StrudelConfig) {
    this.config = config;
  }

  public generate(tracks: Track[]): string {
    // 1. Calculate Global Song Duration
    let maxDuration = tracks.reduce((max, t) => {
      const trackMax = t.notes.reduce((m, n) => Math.max(m, n.noteOff), 0);
      return Math.max(max, trackMax);
    }, 0);

    const barDur = (60 / this.config.sourceBpm) * this.config.timeSignature.numerator;
    if (maxDuration === 0) maxDuration = barDur;

    // 2. Generate CPS setup
    let cpsFormula = "";
    if (this.config.cycleUnit === 'bar') {
      const numerator = this.config.timeSignature.numerator || 4;
      cpsFormula = `${this.config.bpm} / 60 / ${numerator}`;
    } else {
      cpsFormula = `${this.config.bpm} / 60`;
    }

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

    tracks.forEach(track => {
      if (track.hidden) return;
      if (!track.notes.length) return;

      if (track.isDrum) {
        output += renderDrumTrack(track, maxDuration, this.config);
      } else {
        output += renderMelodicTrack(track, maxDuration, this.config);
      }
      output += '\n';
    });

    return output;
  }
}
