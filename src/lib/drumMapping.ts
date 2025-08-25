// GM Percussion Standard MIDI number to Strudel drum token mapping
export const MIDI_TO_DRUM_TOKEN: Record<number, string> = {
  35: "bd",  // Acoustic Bass Drum
  36: "bd",  // Bass Drum 1
  37: "rim", // Side Stick/Rimshot
  38: "sd",  // Acoustic Snare
  39: "cp",  // Hand Clap
  40: "sd",  // Electric Snare
  41: "lt",  // Low Floor Tom
  42: "hh",  // Closed Hi-Hat
  43: "lt",  // High Floor Tom
  44: "hh",  // Pedal Hi-Hat
  45: "lt",  // Low Tom
  46: "oh",  // Open Hi-Hat
  47: "mt",  // Low-Mid Tom
  48: "mt",  // Hi-Mid Tom
  49: "cr",  // Crash Cymbal 1
  50: "ht",  // High Tom
  51: "rd",  // Ride Cymbal 1
  53: "rd",  // Ride Bell
  54: "tb",  // Tambourine
  55: "cr",  // Splash Cymbal
  56: "cb",  // Cowbell
  57: "cr",  // Crash Cymbal 2
  59: "rd",  // Ride Cymbal 2
  69: "sh",  // Cabasa
  70: "sh",  // Maracas
  82: "sh",  // Shaker
  // Add more mappings as needed
};

export function midiToDrumToken(midiNumber: number): string {
  return MIDI_TO_DRUM_TOKEN[midiNumber] || "sh"; // Default to shaker for unmapped
}

// Map drum kit names to Strudel bank names
export function getDrumBank(trackName: string, trackIndex: number): string | null {
  if (trackIndex === 0) return null; // First drum track uses default kit
  
  const name = trackName.toLowerCase();
  if (name.includes("808") || name.includes("tr-808")) return "RolandTR808";
  if (name.includes("909") || name.includes("tr-909")) return "RolandTR909";
  if (name.includes("707")) return "RolandTR707";
  if (name.includes("727")) return "RolandTR727";
  if (name.includes("linn") || name.includes("lm-1")) return "LinnDrum";
  if (name.includes("sp12") || name.includes("sp-12")) return "EmuSP12";
  if (name.includes("mpc60")) return "AkaiMPC60";
  if (name.includes("mpc1000")) return "MPC1000";
  if (name.includes("sr16")) return "AlesisSR16";
  if (name.includes("hr16")) return "AlesisHR16";
  
  return "RolandTR808"; // Default fallback
}

// Export a helper to check if a track should use drum notation
export function shouldUseDrumNotation(trackInfo: any): boolean {
  return trackInfo?.isPercussion === true || trackInfo?.channel === 9;
}
