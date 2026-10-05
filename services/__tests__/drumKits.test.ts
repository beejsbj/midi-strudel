import MidiPackage from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { convertMidi } from '../convertMidi';
import { DEFAULT_DRUM_KIT, DRUM_KITS, drumSample, indexedSampleKey, pickDrumKit } from '../drums/DrumKits';
import { evaluateGeneratedStrudelCode } from './helpers/strudelRuntime';

const { Midi } = MidiPackage;

describe('drum kits', () => {
  it('reads named files inside mixed folders by their index', () => {
    // RolandMC303_perc/Longguir.wav is the 25th file; Mutecuic.wav the 6th in misc.
    expect(DRUM_KITS.RolandMC303[74]).toBe('perc:24');
    expect(DRUM_KITS.RolandMC303[78]).toBe('misc:5');
    expect(drumSample(74, 'RolandMC303')).toEqual({ token: 'perc:24' });
  });

  it('plays a missing sound as its nearest stand-in, or nothing outside GM percussion', () => {
    expect(drumSample(85, 'RolandTR909')).toEqual({ token: 'rim', standIn: 37 });
    expect(drumSample(83, 'RolandMC303')).toEqual({ token: 'tb', standIn: 54 });
    expect(drumSample(20, 'RolandTR909')).toBeUndefined();
  });

  it('keeps the default kit when it already has every sound, and leaves it for one that has more', () => {
    expect(pickDrumKit([36, 38, 42, 42, 46, 49])).toBe(DEFAULT_DRUM_KIT);
    const kit = pickDrumKit([36, 38, 74, 78, 78]);
    expect(drumSample(74, kit)?.standIn).toBeUndefined();
    expect(drumSample(78, kit)?.standIn).toBeUndefined();
  });

  it('names indexed samples and stand-ins under a drum track header', () => {
    expect(indexedSampleKey([36, 74, 78, 83, 83], 'RolandMC303'))
      .toEqual(['misc:5 mute cuica', 'perc:24 long guiro', 'tb tambourine (for jingle bell)']);
    expect(indexedSampleKey([36, 38, 42], DEFAULT_DRUM_KIT)).toEqual([]);
    const midi = new Midi();
    const track = midi.addTrack();
    track.channel = 9;
    track.name = 'Kit';
    [36, 74, 78].forEach((note, index) => track.addNote({ midi: note, ticks: index * 480, durationTicks: 120 }));
    const { code } = convertMidi(midi.toArray().buffer, 'kit.mid');
    expect(code).toMatch(/\/\/ ── Kit ─+\n\/\/ misc:5 mute cuica · perc:24 long guiro\nconst kit = \{/);
  });

  it.each(['chained', 'colon'] as const)('makes sticks, jingle bells and castanets audible in %s syntax', async (controlSyntax) => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    track.channel = 9;
    [31, 83, 85, 36].forEach((note, index) =>
      track.addNote({ midi: note, ticks: index * 480, durationTicks: 120, velocity: 0.5 + index / 10 }));
    const bytes = midi.toArray().buffer;
    const stored = new Midi(bytes).tracks[0].notes.map((note) => Math.round(note.velocity * 1000) / 1000);
    const result = convertMidi(bytes, 'percussion.mid', { controlSyntax, includeVelocity: true });
    const kit = result.tracks[0].drumBank!;
    const runtime = await evaluateGeneratedStrudelCode(result.code, { exactBpm: result.config.bpm });
    try {
      const hits = runtime.querySeconds(0, result.sharedSpanSeconds);
      // Each hit plays the kit's sample for that note, at its own velocity.
      expect(hits.map((hit) => `${String(hit.value.s)}:${Number(hit.value.n ?? 0)}`)).toEqual([31, 83, 85, 36].map((note) => {
        const [sound, index = '0'] = drumSample(note, kit)!.token.split(':');
        return `${sound}:${index}`;
      }));
      expect(hits.map((hit) => hit.value.velocity)).toEqual(stored);
      expect(hits.every((hit) => hit.value.bank === kit)).toBe(true);
    } finally { runtime.stop(); }
  });
});
