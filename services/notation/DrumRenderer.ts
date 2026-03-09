import { Track, StrudelConfig } from '../../types';
import { DRUM_MAP } from '../../constants';
import { prepareNotes, formatTrackName, buildVisualSuffix } from './NotationUtils';
import { renderSequence } from './MelodicRenderer';

export function renderDrumTrack(track: Track, globalMaxDuration: number, config: StrudelConfig): string {
  // Warn about and filter out notes that don't map to our drum kit
  track.notes.forEach(n => {
    if (!DRUM_MAP[n.midi]) {
      console.warn(`Unmapped MIDI drum note dropped: MIDI ${n.midi} (${n.note})`);
    }
  });
  const rawNotes = track.notes.filter(n => DRUM_MAP[n.midi]);
  const notes = prepareNotes(rawNotes, config);

  const sequence = renderSequence(notes, globalMaxDuration, true, config, DRUM_MAP);
  const bank = track.drumBank || "RolandTR909";
  const visualSuffix = buildVisualSuffix(config, track.color);

  return `$${formatTrackName(track.name)}: \`<\n${sequence}\n>\`\n  .as("s")` + visualSuffix + `;\n  // .bank("${bank}")\n\n`;
}
