import React, { useState } from "react";
import { StrudelPlayer } from "@/components/StrudelPlayer";
import { GlobalDragZone } from "@/components/GlobalDragZone";
import { HeaderUploadButton } from "@/components/HeaderUploadButton";
import { Note } from "@/types/music";
import {
  analyzeMidiFile,
  convertMidiToNotes,
  defaultSettings,
  type MidiAnalysis,
} from "@/lib/midiProcessor";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  generateFormattedBracketNotation,
  calculateStatistics,
  extractFormattedVelocityPattern,
  generateStrudelCode,
  generateDrumBracketNotation,
} from "@/lib/bracketNotation";
import { getDrumBank } from "@/lib/drumMapping";
import {
  assignToStreams,
  buildSequentialBracket,
  buildStrudelCode,
  wrapInAngles,
} from "@/lib/multiStream";
import { useToast } from "@/hooks/use-toast";
import { Music } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const Index = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [bracketNotation, setBracketNotation] = useState("");
  const [statistics, setStatistics] = useState({
    noteCount: 0,
    restCount: 0,
    totalDuration: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const [analysis, setAnalysis] = useState<MidiAnalysis | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<number[]>([]);
  const [codeOverride, setCodeOverride] = useState<string>("");
  const [useInstrumentSamples, setUseInstrumentSamples] =
    useState<boolean>(false);
  const [outMode, setOutMode] = useState<"single" | "multi">("single");
  const [currentCps, setCurrentCps] = useState<number>(0.5);
  const [availableSamples, setAvailableSamples] = useState<string[]>([]);
  const [lineLength, setLineLength] = useState<number>(8);
  const [useScaleMode, setUseScaleMode] = useState<boolean>(false);
  const [includeVelocity, setIncludeVelocity] = useState<boolean>(false);

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    setUploadedFile(file);

    try {
      // Analyze MIDI for metadata (tempo, time signature, tracks, keys)
      const res = await analyzeMidiFile(file);
      setAnalysis(res);
      // Select all tracks by default
      const allTracks = res.trackInfo.map((_, idx) => idx);
      setSelectedTracks(allTracks);

      // Use analyzed notes initially (cycles)
      const convertedNotes = res.notes;
      const notation = generateFormattedBracketNotation(convertedNotes, lineLength, res.calculatedKeySignature, useScaleMode);
      const stats = calculateStatistics(convertedNotes, notation);

      // Log analysis and initial conversion

      setNotes(convertedNotes);
      setBracketNotation(notation);
      setStatistics(stats);

      // If multi-stream selected, regenerate code
      if (outMode === "multi") {
        void regenerateMultiStream(useInstrumentSamples);
      }

      toast({
        title: "MIDI file processed successfully",
        description: `Converted ${stats.noteCount} notes to bracket notation`,
      });
    } catch (error) {
      toast({
        title: "Error processing MIDI file",
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleTrack = async (index: number) => {
    // Toggle selection state
    const isSelected = selectedTracks.includes(index);
    const newSelected = isSelected
      ? selectedTracks.filter((i) => i !== index)
      : [...selectedTracks, index].sort((a, b) => a - b);
    setSelectedTracks(newSelected);

    // Reprocess notes for selected tracks if a file is present
    if (!uploadedFile) return;
    setIsProcessing(true);
    try {
      const filteredNotes = await convertMidiToNotes(uploadedFile, {
        ...defaultSettings,
        cyclesPerSecond: currentCps,
        selectedTracks: newSelected,
      });
      const notation = generateFormattedBracketNotation(filteredNotes, lineLength, analysis?.calculatedKeySignature, useScaleMode);
      const stats = calculateStatistics(filteredNotes, notation);

      setNotes(filteredNotes);
      setBracketNotation(notation);
      setStatistics(stats);

      if (outMode === "multi") {
        void regenerateMultiStream(useInstrumentSamples);
      }
    } catch (error) {
      toast({
        title: "Error updating track selection",
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Map track instrument names to the closest available sample name using actual loaded sample names
  const mapInstrumentToSample = (name: string | undefined) => {
    const n = (name || "").toLowerCase();
    const lower = availableSamples.map((s) => s.toLowerCase());
    const has = (cand: string) => lower.includes(cand.toLowerCase());
    const firstAvail = (cands: string[]) => cands.find((c) => has(c));

    // DRUMS / PERCUSSION
    if (/(kick|bd|bass\s*drum)/.test(n))
      return (
        firstAvail([
          "bd",
          "bassdrum1",
          "bassdrum2",
          "mpc1000_bd",
          "rolandtr808_bd",
          "rolandtr909_bd",
        ]) || "bd"
      );
    if (/(snare|sd)/.test(n))
      return (
        firstAvail([
          "sd",
          "snare_modern",
          "snare_hi",
          "snare_low",
          "rolandtr808_sd",
          "rolandtr909_sd",
        ]) || "sd"
      );
    if (/(hi[- ]?hat|hh)/.test(n))
      return (
        firstAvail(["hh", "hihat", "rolandtr808_hh", "rolandtr909_hh"]) || "hh"
      );
    if (/(ride|rd)/.test(n))
      return firstAvail(["rd", "rolandtr808_rd", "rolandtr909_rd"]) || "rd";
    if (/(crash|cymbal|cr)/.test(n))
      return (
        firstAvail(["cr", "sus_cymbal", "rolandtr808_cr", "rolandtr909_cr"]) ||
        "cr"
      );
    if (/(tom)/.test(n))
      return (
        firstAvail(["tom_stick", "tom_mallet", "tom2_stick", "tom2_mallet"]) ||
        "tom_stick"
      );
    if (/(shaker)/.test(n))
      return firstAvail(["shaker_large", "shaker_small"]) || "shaker_large";
    if (/(clap)/.test(n))
      return firstAvail(["clap", "cp", "akaimpc60_cp"]) || "clap";
    if (/(cowbell|cb)/.test(n)) return firstAvail(["cb", "cowbell"]) || "cb";
    if (/(tambourine)/.test(n))
      return firstAvail(["tambourine", "tambourine2"]) || "tambourine";
    if (/(woodblock)/.test(n)) return firstAvail(["woodblock"]) || "woodblock";
    if (/(timpani)/.test(n))
      return (
        firstAvail(["timpani", "timpani2", "timpani_roll", "gm_timpani"]) ||
        "timpani"
      );

    // PIANO / KEYS
    if (/epiano|electric\s*piano|rhodes/.test(n))
      return (
        firstAvail(["gm_epiano1", "gm_epiano2", "fmpiano"]) ||
        (has("piano") ? "piano" : "gm_piano")
      );
    if (/clav|clavinet/.test(n))
      return firstAvail(["gm_clavinet", "clavisynth"]) || "gm_clavinet";
    if (/harpsichord/.test(n))
      return firstAvail(["gm_harpsichord"]) || "gm_harpsichord";
    if (/celesta/.test(n)) return firstAvail(["gm_celesta"]) || "gm_celesta";
    if (/glockenspiel/.test(n))
      return (
        firstAvail(["gm_glockenspiel", "glockenspiel"]) || "gm_glockenspiel"
      );
    if (/vibraphone/.test(n))
      return (
        firstAvail([
          "gm_vibraphone",
          "vibraphone",
          "vibraphone_soft",
          "vibraphone_bowed",
        ]) || "gm_vibraphone"
      );
    if (/marimba/.test(n))
      return firstAvail(["gm_marimba", "marimba"]) || "gm_marimba";
    if (/xylophone/.test(n))
      return (
        firstAvail([
          "gm_xylophone",
          "xylophone_medium_ff",
          "xylophone_soft_ff",
        ]) || "gm_xylophone"
      );
    if (/tubular\s*bells/.test(n))
      return (
        firstAvail(["gm_tubular_bells", "tubularbells", "tubularbells2"]) ||
        "gm_tubular_bells"
      );
    if (/music\s*box/.test(n))
      return firstAvail(["gm_music_box"]) || "gm_music_box";
    if (/piano|grand/.test(n))
      return (
        firstAvail(["piano", "gm_piano", "steinway", "kawai", "piano1"]) ||
        (has("gm_piano") ? "gm_piano" : "piano")
      );

    // ORGANS
    if (/drawbar|rock\s*organ/.test(n))
      return (
        firstAvail(["gm_drawbar_organ", "organ_8inch", "organ_full"]) ||
        "gm_drawbar_organ"
      );
    if (/church|pipe\s*organ/.test(n))
      return (
        firstAvail(["pipeorgan_quiet", "pipeorgan_loud", "gm_church_organ"]) ||
        "pipeorgan_quiet"
      );
    if (/percussive\s*organ/.test(n))
      return firstAvail(["gm_percussive_organ"]) || "gm_percussive_organ";

    // GUITARS
    if (/nylon\s*guitar/.test(n))
      return (
        firstAvail(["gm_acoustic_guitar_nylon"]) || "gm_acoustic_guitar_nylon"
      );
    if (/steel\s*guitar/.test(n))
      return (
        firstAvail(["gm_acoustic_guitar_steel"]) || "gm_acoustic_guitar_steel"
      );
    if (/overdriven/.test(n))
      return firstAvail(["gm_overdriven_guitar"]) || "gm_overdriven_guitar";
    if (/distortion/.test(n))
      return firstAvail(["gm_distortion_guitar"]) || "gm_distortion_guitar";
    if (/jazz\s*guitar/.test(n))
      return (
        firstAvail(["gm_electric_guitar_jazz"]) || "gm_electric_guitar_jazz"
      );
    if (/guitar/.test(n))
      return (
        firstAvail([
          "gm_electric_guitar_clean",
          "gm_acoustic_guitar_steel",
          "gm_acoustic_guitar_nylon",
        ]) || "gm_electric_guitar_clean"
      );

    // BASSES
    if (/fretless\s*bass/.test(n))
      return firstAvail(["gm_fretless_bass"]) || "gm_fretless_bass";
    if (/slap\s*bass/.test(n))
      return (
        firstAvail(["gm_slap_bass_1", "gm_slap_bass_2"]) || "gm_slap_bass_1"
      );
    if (/synth\s*bass/.test(n))
      return (
        firstAvail(["gm_synth_bass_1", "gm_synth_bass_2"]) || "gm_synth_bass_1"
      );
    if (/bass/.test(n))
      return (
        firstAvail([
          "gm_acoustic_bass",
          "gm_electric_bass_finger",
          "gm_electric_bass_pick",
        ]) || "gm_acoustic_bass"
      );

    // STRINGS & ENSEMBLES
    if (/violin/.test(n))
      return firstAvail(["gm_violin", "fiddle"]) || "gm_violin";
    if (/viola/.test(n)) return firstAvail(["gm_viola"]) || "gm_viola";
    if (/cello/.test(n)) return firstAvail(["gm_cello"]) || "gm_cello";
    if (/contrabass|double\s*bass/.test(n))
      return firstAvail(["gm_contrabass"]) || "gm_contrabass";
    if (/pizzicato/.test(n))
      return firstAvail(["gm_pizzicato_strings"]) || "gm_pizzicato_strings";
    if (/tremolo/.test(n))
      return firstAvail(["gm_tremolo_strings"]) || "gm_tremolo_strings";
    if (/string/.test(n))
      return (
        firstAvail([
          "gm_string_ensemble_1",
          "gm_string_ensemble_2",
          "gm_synth_strings_1",
        ]) || "gm_string_ensemble_1"
      );
    if (/harp/.test(n))
      return firstAvail(["harp", "gm_orchestral_harp", "folkharp"]) || "harp";

    // BRASS & WINDS
    if (/trumpet/.test(n))
      return firstAvail(["gm_trumpet", "gm_muted_trumpet"]) || "gm_trumpet";
    if (/trombone/.test(n)) return firstAvail(["gm_trombone"]) || "gm_trombone";
    if (/tuba/.test(n)) return firstAvail(["gm_tuba"]) || "gm_tuba";
    if (/horn/.test(n))
      return firstAvail(["gm_french_horn"]) || "gm_french_horn";
    if (/sax/.test(n))
      return (
        firstAvail([
          "gm_tenor_sax",
          "gm_alto_sax",
          "gm_soprano_sax",
          "gm_baritone_sax",
        ]) || "gm_tenor_sax"
      );
    if (/clarinet/.test(n)) return firstAvail(["gm_clarinet"]) || "gm_clarinet";
    if (/oboe/.test(n)) return firstAvail(["gm_oboe"]) || "gm_oboe";
    if (/bassoon/.test(n)) return firstAvail(["gm_bassoon"]) || "gm_bassoon";
    if (/flute/.test(n))
      return (
        firstAvail(["gm_flute", "gm_piccolo", "recorder_soprano_sus"]) ||
        "gm_flute"
      );
    if (/piccolo/.test(n)) return firstAvail(["gm_piccolo"]) || "gm_piccolo";
    if (/recorder/.test(n))
      return (
        firstAvail(["gm_recorder", "recorder_soprano_sus"]) || "gm_recorder"
      );
    if (/pan\s*flute/.test(n))
      return firstAvail(["gm_pan_flute"]) || "gm_pan_flute";
    if (/whistle/.test(n))
      return firstAvail(["gm_whistle", "trainwhistle"]) || "gm_whistle";
    if (/ocarina/.test(n))
      return firstAvail(["gm_ocarina", "ocarina"]) || "gm_ocarina";

    // VOICES / CHOIRS
    if (/choir/.test(n))
      return firstAvail(["gm_choir_aahs", "gm_voice_oohs"]) || "gm_choir_aahs";

    // SYNTH LEADS/PADS/FX
    if (/lead/.test(n))
      return (
        firstAvail([
          "gm_lead_2_sawtooth",
          "gm_lead_1_square",
          "gm_lead_8_bass_lead",
        ]) || "gm_lead_2_sawtooth"
      );
    if (/pad/.test(n))
      return (
        firstAvail(["gm_pad_warm", "gm_pad_poly", "gm_pad_sweep"]) ||
        "gm_pad_warm"
      );
    if (/fx/.test(n))
      return (
        firstAvail(["gm_fx_atmosphere", "gm_fx_echoes", "gm_fx_crystal"]) ||
        "gm_fx_atmosphere"
      );

    // ETHNIC / MISC
    if (/sitar/.test(n)) return firstAvail(["gm_sitar"]) || "gm_sitar";
    if (/banjo/.test(n)) return firstAvail(["gm_banjo"]) || "gm_banjo";
    if (/koto/.test(n)) return firstAvail(["gm_koto"]) || "gm_koto";
    if (/shamisen/.test(n)) return firstAvail(["gm_shamisen"]) || "gm_shamisen";
    if (/bagpipe/.test(n)) return firstAvail(["gm_bagpipe"]) || "gm_bagpipe";
    if (/harmonica/.test(n))
      return firstAvail(["harmonica", "gm_harmonica"]) || "harmonica";

    // ORCHESTRA HIT
    if (/orchestra\s*hit/.test(n))
      return firstAvail(["gm_orchestra_hit"]) || "gm_orchestra_hit";

    // Fallbacks
    if (has("triangle")) return "triangle";
    if (has("sine")) return "sine";
    if (has("sawtooth")) return "sawtooth";
    if (has("square")) return "square";
    return availableSamples[0] || "triangle";
  };

  // Regenerate multi-stream code based on current state
  const regenerateMultiStream = async (perInstrument: boolean) => {
    if (!uploadedFile || !analysis) {
      setCodeOverride("");
      return;
    }

    if (perInstrument) {
      // Build one stream per selected track with per-instrument sample mapping
      const tracks =
        selectedTracks.length > 0
          ? selectedTracks
          : analysis.trackInfo.map((_, i) => i);
      const lines: string[] = [];
      let drumTrackCount = 0;
      
      for (const idx of tracks) {
        const trackInfo = analysis.trackInfo[idx];
        const perTrackNotes = await convertMidiToNotes(uploadedFile, {
          ...defaultSettings,
          cyclesPerSecond: currentCps,
          selectedTracks: [idx],
        });
        
        if (trackInfo?.isPercussion) {
          // Handle percussion track
          const drumNotation = generateDrumBracketNotation(perTrackNotes);
          const wrapped = wrapInAngles(drumNotation);
          const drumBank = getDrumBank(
            trackInfo.name || trackInfo.instrument || '', 
            drumTrackCount
          );
          
          let drumCode = `s(\`${wrapped}\`)`;
          if (drumBank) {
            drumCode += `.bank("${drumBank}")`;
          }
          
          // Add velocity if enabled
          if (includeVelocity) {
            const velocityPattern = extractFormattedVelocityPattern(
              perTrackNotes, lineLength, undefined, false
            );
            if (velocityPattern && velocityPattern.trim()) {
              drumCode += `.velocity(\`<${velocityPattern}>\`)`;
            }
          }
          
          lines.push(`$: ${drumCode}`);
          drumTrackCount++;
        } else {
          // Handle pitched instrument track (existing logic)
          const seq = buildSequentialBracket(perTrackNotes, lineLength, analysis.calculatedKeySignature, useScaleMode);
          const wrapped = wrapInAngles(seq);
          const instrument = trackInfo?.instrument;
          // Try to map to a sample that actually exists
          let sample = mapInstrumentToSample(instrument);
          if (availableSamples.length > 0) {
            const lower = availableSamples.map((s) => s.toLowerCase());
            const tryNames = [
              sample,
              "bd",
              "sd",
              "hh",
              "piano",
              "bass",
              "organ",
              "guitar",
              "strings",
              "sawtooth",
              "triangle",
            ];
            sample =
              tryNames.find((n) => lower.includes(n.toLowerCase())) || sample;
          }
          // Generate code with velocity if enabled
          if (includeVelocity) {
            const strudelCode = buildStrudelCode(
              perTrackNotes,
              lineLength,
              analysis.calculatedKeySignature,
              useScaleMode,
              includeVelocity,
              sample
            );
            lines.push(`$: ${strudelCode}`);
          } else {
            lines.push(`$: note(\`${wrapped}\`).sound("${sample}")`);
          }
        }
      }
      const code = lines.join("\n\n");
      setCodeOverride(code);
    } else {
      // Greedy concurrency streams on current notes
      const assigned = assignToStreams(notes);
      const byStream = new Map<number, Note[]>();
      for (const n of assigned) {
        byStream.set(n.stream, [...(byStream.get(n.stream) || []), n]);
      }
      const lines: string[] = [];
      Array.from(byStream.keys())
        .sort((a, b) => a - b)
        .forEach((k) => {
          const streamNotes = byStream.get(k) || [];
          if (includeVelocity) {
            const strudelCode = buildStrudelCode(
              streamNotes,
              lineLength,
              analysis.calculatedKeySignature,
              useScaleMode,
              includeVelocity,
              "triangle"
            );
            lines.push(`$: ${strudelCode}`);
          } else {
            const seq = buildSequentialBracket(streamNotes, lineLength, analysis.calculatedKeySignature, useScaleMode);
            const wrapped = wrapInAngles(seq);
            lines.push(`$: note(\`${wrapped}\`).sound("triangle")`);
          }
        });
      const code = lines.join("\n\n");
      setCodeOverride(code);
    }
  };

  return (
    <GlobalDragZone onFileUpload={handleFileUpload} isProcessing={isProcessing}>
      <div className="min-h-screen bg-gradient-subtle">
        {/* Header */}
        <header className="border-b bg-card/50 backdrop-blur">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg gradient-musical">
                  <Music className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">MIDI to Bracket Notation</h1>
                  <p className="text-muted-foreground">
                    Convert MIDI files to custom bracket notation for musical timing
                  </p>
                </div>
              </div>
              
              {/* Header Upload Button */}
              <HeaderUploadButton
                onFileUpload={handleFileUpload}
                isProcessing={isProcessing}
              />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8 space-y-8">

        {/* Demo Example */}
        {notes.length === 0 && !isProcessing && (
          <div className="text-center py-8">
            <h2 className="text-xl font-semibold mb-4">
              How Bracket Notation Works
            </h2>
            <div className="max-w-2xl mx-auto space-y-4 text-left bg-card p-6 rounded-lg">
              <div>
                <h3 className="font-medium mb-2">Raw Notes Mode:</h3>
                <div className="font-mono text-sm space-y-1 bg-muted p-3 rounded">
                  <div>
                    <span className="text-accent">Single notes:</span> C4 D4 E4@0.25
                  </div>
                  <div>
                    <span className="text-accent">Chord:</span> [C4, E4, G4]@1
                  </div>
                  <div>
                    <span className="text-accent">With rests:</span> C4 ~@0.5 D4
                  </div>
                  <div>
                    <span className="text-accent">Complex overlap:</span> [C4@2 ~@1, ~@0.5 E4@1.5]@3
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-medium mb-2">Scale Degrees Mode (when key detected):</h3>
                <div className="font-mono text-sm space-y-1 bg-muted p-3 rounded">
                  <div>
                    <span className="text-accent">Scale degrees:</span> 0 1 2@0.25 (C major: C D E)
                  </div>
                  <div>
                    <span className="text-accent">Chord:</span> [0, 2, 4]@1 (C major triad)
                  </div>
                  <div>
                    <span className="text-accent">Octaves:</span> 0 7 -7 (C4, C5, C3)
                  </div>
                  <div>
                    <span className="text-accent">Strudel syntax:</span> {`n(\`<0 1 2>\`).scale("C4:major")`}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Player + Details layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sidebar: MIDI Details and Controls */}
          <aside className="lg:col-span-1">
            {analysis && (
              <Card className="p-6 space-y-4">
                <h3 className="text-lg font-semibold">MIDI Details</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-muted p-3 rounded">
                    <div className="text-xs text-muted-foreground">
                      Tempo (BPM)
                    </div>
                    <div className="text-lg font-semibold">
                      {analysis.tempo?.toFixed(2) ?? "—"}
                    </div>
                  </div>
                  <div className="bg-muted p-3 rounded">
                    <div className="text-xs text-muted-foreground">
                      Time Signature
                    </div>
                    <div className="text-lg font-semibold">
                      {analysis.timeSignature
                        ? `${analysis.timeSignature.numerator}/${analysis.timeSignature.denominator}`
                        : "—"}
                    </div>
                  </div>
                  <div className="bg-muted p-3 rounded sm:col-span-2">
                    <div className="text-xs text-muted-foreground">
                      Key Signature
                    </div>
                    <div className="text-lg font-semibold">
                      {analysis.effectiveKeySignature || "Unavailable"}
                      {analysis.calculatedKeySignature && !analysis.keySignatures?.length && (
                        <span className="text-xs text-muted-foreground block">
                          (Calculated: {Math.round(analysis.calculatedKeySignature.confidence * 100)}% confidence)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Notation Mode - Only show if key signature is available */}
                {analysis.effectiveKeySignature && (
                  <div className="space-y-3 p-4 border rounded">
                    <div>
                      <Label className="text-sm font-medium">Notation Mode</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Choose between note names (C4, D4) or scale degrees (0, 1, 2)
                      </p>
                    </div>
                    <ToggleGroup 
                      type="single" 
                      value={useScaleMode ? "scale" : "notes"}
                      onValueChange={async (value) => {
                        if (value) {
                          const newUseScaleMode = value === "scale";
                          setUseScaleMode(newUseScaleMode);
                          if (!notes.length) return;
                          setIsProcessing(true);
                          try {
                            const notation = generateFormattedBracketNotation(
                              notes, 
                              lineLength, 
                              analysis.calculatedKeySignature, 
                              newUseScaleMode
                            );
                            setBracketNotation(notation);
                            
                            if (outMode === "multi") {
                              await regenerateMultiStream(useInstrumentSamples);
                            }
                          } finally {
                            setIsProcessing(false);
                          }
                        }
                      }}
                      className="grid grid-cols-2 w-full"
                    >
                      <ToggleGroupItem value="notes" className="text-xs">
                        Raw Notes
                      </ToggleGroupItem>
                      <ToggleGroupItem value="scale" className="text-xs">
                        Scale Degrees  
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                )}

                {/* Velocity Switch - Show if notes have velocity data */}
                {notes.some(note => note.velocity !== undefined) && (
                  <div className="space-y-3 p-4 border rounded">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">Include Velocity</Label>
                        <p className="text-xs text-muted-foreground">
                          Add velocity patterns to the Strudel code (0.0-1.0 values)
                        </p>
                      </div>
                      <Switch
                        id="include-velocity"
                        checked={includeVelocity}
                        onCheckedChange={async (checked) => {
                          setIncludeVelocity(checked);
                          if (outMode === "multi") {
                            await regenerateMultiStream(useInstrumentSamples);
                          }
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Output Mode */}
                <div className="space-y-3 p-4 border rounded">
                  <div>
                    <Label className="text-sm font-medium">Output Mode</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Choose between single polyphonic stream or multiple monophonic streams
                    </p>
                  </div>
                  <ToggleGroup 
                    type="single" 
                    value={outMode}
                    onValueChange={async (value: "single" | "multi") => {
                      if (value) {
                        setOutMode(value);
                        if (value === "single") {
                          setCodeOverride("");
                        } else {
                          await regenerateMultiStream(useInstrumentSamples);
                        }
                      }
                    }}
                    className="grid grid-cols-2 w-full"
                  >
                    <ToggleGroupItem value="single" className="text-xs">
                      Single Stream
                    </ToggleGroupItem>
                    <ToggleGroupItem value="multi" className="text-xs">
                      Multi Stream
                    </ToggleGroupItem>
                  </ToggleGroup>
                  
                  {/* Instrument Samples Switch - Only show when multi-stream is selected */}
                  {outMode === "multi" && (
                    <div className="mt-4 pt-3 border-t">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <Label className="text-sm font-medium">Use Instrument Samples</Label>
                          <p className="text-xs text-muted-foreground">
                            Map each track to its detected instrument sound (including drums)
                          </p>
                        </div>
                        <Switch
                          id="instrument-samples"
                          checked={useInstrumentSamples}
                          onCheckedChange={async (checked) => {
                            setUseInstrumentSamples(checked);
                            await regenerateMultiStream(checked);
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* CPS Slider */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    Cycles per Second (cps)
                  </div>
                  <input
                    type="range"
                    min={0.25}
                    max={2}
                    step={0.05}
                    defaultValue={0.5}
                    onChange={async (e) => {
                      const cps = parseFloat(e.target.value);
                      setCurrentCps(cps);
                      if (!uploadedFile) return;
                      setIsProcessing(true);
                      try {
                        const filteredNotes = await convertMidiToNotes(
                          uploadedFile,
                          {
                            ...defaultSettings,
                            cyclesPerSecond: cps,
                            selectedTracks,
                          }
                        );
                        const notation =
                          generateFormattedBracketNotation(filteredNotes, lineLength, analysis?.calculatedKeySignature, useScaleMode);
                        const stats = calculateStatistics(
                          filteredNotes,
                          notation
                        );

                        setNotes(filteredNotes);
                        setBracketNotation(notation);
                        setStatistics(stats);

                        if (outMode === "multi") {
                          await regenerateMultiStream(useInstrumentSamples);
                        }
                      } finally {
                        setIsProcessing(false);
                      }
                    }}
                  />
                  <div className="text-xs text-muted-foreground">
                    Default cps is 0.5 (1 cycle = 2s)
                  </div>
                </div>

                {/* Line Length Slider */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    Notes per line ({lineLength})
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={1}
                    value={lineLength}
                    onChange={async (e) => {
                      const newLineLength = parseInt(e.target.value);
                      setLineLength(newLineLength);
                      if (!notes.length) return;
                      setIsProcessing(true);
                      try {
                        const notation = generateFormattedBracketNotation(notes, newLineLength, analysis?.calculatedKeySignature, useScaleMode);
                        setBracketNotation(notation);
                        
                        if (outMode === "multi") {
                          await regenerateMultiStream(useInstrumentSamples);
                        }
                      } finally {
                        setIsProcessing(false);
                      }
                    }}
                  />
                  <div className="text-xs text-muted-foreground">
                    Control how many notes appear per line in bracket notation
                  </div>
                </div>

                {/* Timing Mode */}
                <div className="space-y-3 p-4 border rounded">
                  <div>
                    <Label className="text-sm font-medium">Timing Mode</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Choose between raw seconds or normalized Strudel timing
                    </p>
                  </div>
                  <ToggleGroup 
                    type="single" 
                    value={currentCps === 1 ? "raw" : "normalized"}
                    onValueChange={async (value) => {
                      if (!value || !uploadedFile) return;
                      setIsProcessing(true);
                      try {
                        const newCps = value === "raw" ? 1 : 0.5;
                        setCurrentCps(newCps);
                        const newNotes = await convertMidiToNotes(
                          uploadedFile,
                          {
                            ...defaultSettings,
                            cyclesPerSecond: newCps,
                            selectedTracks,
                          }
                        );
                        const notation = generateFormattedBracketNotation(
                          newNotes, 
                          lineLength, 
                          analysis?.calculatedKeySignature, 
                          useScaleMode
                        );
                        const stats = calculateStatistics(newNotes, notation);

                        setNotes(newNotes);
                        setBracketNotation(notation);
                        setStatistics(stats);

                        if (outMode === "multi") {
                          await regenerateMultiStream(useInstrumentSamples);
                        }
                      } finally {
                        setIsProcessing(false);
                      }
                    }}
                    className="grid grid-cols-2 w-full"
                  >
                    <ToggleGroupItem value="raw" className="text-xs">
                      Raw (cps = 1)
                    </ToggleGroupItem>
                    <ToggleGroupItem value="normalized" className="text-xs">
                      Normalized (cps = 0.5)
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {/* Instruments / Tracks */}
                <div className="space-y-3 p-4 border rounded">
                  <div>
                    <Label className="text-sm font-medium">Track Selection</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Enable or disable individual tracks for processing
                    </p>
                  </div>
                  <div className="space-y-3">
                    {analysis.trackInfo.map((t, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 border rounded"
                      >
                        <div className="flex-1 mr-3">
                          <div className="font-medium">
                            Track {idx + 1}: {t.name || "Untitled"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Instrument: {t.instrument} • Notes: {t.noteCount}
                            {t.isPercussion && " • Percussion"}
                          </div>
                        </div>
                        <Switch
                          id={`track-${idx}`}
                          checked={selectedTracks.includes(idx)}
                          onCheckedChange={() => toggleTrack(idx)}
                          aria-label={`Toggle track ${idx + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
                  Bracket durations are in cycles. At cps=0.5, @1 lasts 2s.
                </div>

                {/* JSON viewers */}
                <details>
                  <summary className="text-sm font-medium cursor-pointer">
                    Analysis JSON
                  </summary>
                  <ScrollArea className="h-48 border rounded p-2 bg-muted">
                    <pre className="text-xs whitespace-pre-wrap">
                      {JSON.stringify(analysis, null, 2)}
                    </pre>
                  </ScrollArea>
                </details>
                <details>
                  <summary className="text-sm font-medium cursor-pointer">
                    Converted Notes JSON
                  </summary>
                  <ScrollArea className="h-48 border rounded p-2 bg-muted">
                    <pre className="text-xs whitespace-pre-wrap">
                      {JSON.stringify(notes, null, 2)}
                    </pre>
                  </ScrollArea>
                </details>
              </Card>
            )}
          </aside>
          {/* Main: Strudel Player + options */}
          <section className="lg:col-span-2 space-y-4">

            <StrudelPlayer
              bracketNotation={bracketNotation}
              codeOverride={codeOverride}
              statistics={statistics}
              keySignature={analysis?.calculatedKeySignature}
              useScaleMode={useScaleMode}
              notes={notes}
              includeVelocity={includeVelocity}
              lineLength={lineLength}
              onSamplesChanged={(names) => {
                setAvailableSamples(names);
              }}
            />
          </section>
        </div>
        </main>
      </div>
    </GlobalDragZone>
  );
};

export default Index;
