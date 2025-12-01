

import { Track } from "./types";

export const PITCH_CLASSES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export const INSTRUMENTS = [
  // Basic Waveforms
  "triangle", "sine", "square", "sawtooth", "pulse", "saw", "sqr", "tri", 
  "brown", "pink", "white", "sbd", "supersaw", 
  "z_noise", "z_sawtooth", "z_sine", "z_square", "z_tan", "z_triangle", "zzfx", "bytebeat",
  
  // GM Instruments
  "gm_accordion", "gm_acoustic_bass", "gm_acoustic_guitar_nylon", "gm_acoustic_guitar_steel", 
  "gm_agogo", "gm_alto_sax", "gm_applause", "gm_bagpipe", "gm_bandoneon", "gm_banjo", 
  "gm_baritone_sax", "gm_bassoon", "gm_bird_tweet", "gm_blown_bottle", "gm_brass_section", 
  "gm_breath_noise", "gm_celesta", "gm_cello", "gm_choir_aahs", "gm_church_organ", 
  "gm_clarinet", "gm_clavinet", "gm_contrabass", "gm_crackle", "gm_distortion_guitar", 
  "gm_drawbar_organ", "gm_dulcimer", "gm_electric_bass_finger", "gm_electric_bass_pick", 
  "gm_electric_guitar_clean", "gm_electric_guitar_jazz", "gm_electric_guitar_muted", 
  "gm_english_horn", "gm_epiano1", "gm_epiano2", "gm_fiddle", "gm_flute", "gm_french_horn", 
  "gm_fretless_bass", "gm_fx_atmosphere", "gm_fx_brightness", "gm_fx_crystal", "gm_fx_echoes", 
  "gm_fx_goblins", "gm_fx_rain", "gm_fx_sci_fi", "gm_fx_soundtrack", "gm_glockenspiel", 
  "gm_guitar_fret_noise", "gm_guitar_harmonics", "gm_gunshot", "gm_harmonica", "gm_harpsichord", 
  "gm_helicopter", "gm_kalimba", "gm_koto", "gm_lead_1_square", "gm_lead_2_sawtooth", 
  "gm_lead_3_calliope", "gm_lead_4_chiff", "gm_lead_5_charang", "gm_lead_6_voice", 
  "gm_lead_7_fifths", "gm_lead_8_bass_lead", "gm_marimba", "gm_melodic_tom", "gm_music_box", 
  "gm_muted_trumpet", "gm_oboe", "gm_ocarina", "gm_orchestra_hit", "gm_orchestral_harp", 
  "gm_overdriven_guitar", "gm_pad_bowed", "gm_pad_choir", "gm_pad_halo", "gm_pad_metallic", 
  "gm_pad_new_age", "gm_pad_poly", "gm_pad_sweep", "gm_pad_warm", "gm_pad_choir", "gm_pad_halo", "gm_pan_flute", 
  "gm_percussive_organ", "gm_piano", "gm_piccolo", "gm_pizzicato_strings", "gm_recorder", 
  "gm_reed_organ", "gm_reverse_cymbal", "gm_rock_organ", "gm_seashore", "gm_shakuhachi", 
  "gm_shamisen", "gm_shanai", "gm_sitar", "gm_slap_bass_1", "gm_slap_bass_2", "gm_soprano_sax", 
  "gm_steel_drums", "gm_string_ensemble_1", "gm_string_ensemble_2", "gm_synth_bass_1", 
  "gm_synth_bass_2", "gm_synth_brass_1", "gm_synth_brass_2", "gm_synth_choir", "gm_synth_drum", 
  "gm_synth_strings_1", "gm_synth_strings_2", "gm_taiko_drum", "gm_telephone", "gm_tenor_sax", 
  "gm_timpani", "gm_tinkle_bell", "gm_tremolo_strings", "gm_trombone", "gm_trumpet", "gm_tuba", 
  "gm_tubular_bells", "gm_vibraphone", "gm_viola", "gm_violin", "gm_voice_oohs", "gm_whistle", 
  "gm_woodblock", "gm_xylophone"
].sort();

export const DRUM_MAP: Record<number, string> = {
  35: "bd", 36: "bd", // Acoustic Bass Drum, Bass Drum 1
  38: "sd", 40: "sd", // Acoustic Snare, Electric Snare
  37: "rim",          // Side Stick
  42: "hh", 44: "hh", // Closed Hi Hat, Pedal Hi-Hat
  46: "oh",           // Open Hi-Hat
  41: "lt",           // Low Tom 
  45: "mt",           // Low-Mid Tom
  47: "ht",           // Hi-Mid Tom
  51: "rd",           // Ride Cymbal 1
  49: "cr", 57: "cr", // Crash Cymbal 1, Crash Cymbal 2
  56: "cb",           // Cowbell
  82: "sh",           // Shaker
};

export const DRUM_BANKS = [
  "RolandTR909", "RolandTR808", "RolandTR707", "LinnDrum", "GM"
];

/**
 * Heuristic to map MIDI track metadata to Strudel sounds
 * using dynamic scoring for closest name match.
 */
export const getAutoSound = (track: Track): string | null => {
  const name = track.name.toLowerCase();
  const family = (track.instrumentFamily || "").toLowerCase();
  const searchTerms = `${name} ${family}`;

  // 1. Explicit Override: Synth -> Triangle
  if (searchTerms.includes('synth') && !searchTerms.includes('bass') && !searchTerms.includes('strings') && !searchTerms.includes('brass')) {
      return 'triangle';
  }

  // 2. Explicit Override: "Strings" generic -> Ensemble
  if (name.trim() === 'strings' || (name.includes('string') && !name.includes('guitar') && !name.includes('bass') && !name.includes('quartet') && !name.includes('solo'))) {
       return 'gm_string_ensemble_1';
  }

  // 3. Dynamic Scoring System
  const trackWords = searchTerms.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  
  let bestInst: string | null = null;
  let maxScore = 0;

  for (const inst of INSTRUMENTS) {
    if (!inst.startsWith('gm_')) continue;

    const instNameClean = inst.replace(/^gm_/, '').replace(/_/g, ' ');
    const instWords = instNameClean.split(' ');
    
    let score = 0;
    
    if (searchTerms.includes(instNameClean)) {
        score += 20;
    }

    for (const iWord of instWords) {
        if (trackWords.includes(iWord)) {
            score += 5;
        } 
        else if (searchTerms.includes(iWord)) {
            score += 2;
        }
    }
    
    if (score > maxScore) {
        maxScore = score;
        bestInst = inst;
    }
  }

  if (maxScore >= 5) {
      return bestInst;
  }

  // Fallback
  if (searchTerms.includes('guitar')) {
     if (searchTerms.includes('electric')) return 'gm_electric_guitar_clean';
     if (searchTerms.includes('bass')) return 'gm_electric_bass_pick';
     return 'gm_acoustic_guitar_nylon';
  }
  
  if (searchTerms.includes('bass')) return 'gm_electric_bass_pick';
  if (searchTerms.includes('piano')) return 'gm_piano';
  if (searchTerms.includes('drum')) return 'gm_synth_drum';

  return null;
}