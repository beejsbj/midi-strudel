import React, { useState } from "react";
import { StrudelPlayer } from "@/components/StrudelPlayer";
import { GlobalDragZone } from "@/components/GlobalDragZone";
import { HeaderUploadButton } from "@/components/HeaderUploadButton";
import { Note } from "@/types/music";
import {
  analyzeMidiFile,
  convertMidiToNotes,
  defaultSettings,
  calculateCPS,
  DEFAULT_CPS,
  type MidiAnalysis,
} from "@/lib/midiProcessor";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  generateFormattedBracketNotation,
  generateBarBracketNotation,
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
import { formatScaleForStrudel } from "@/lib/musicTheory";
import { groupNotesByMeasures, formatMeasuresPerLine } from "@/lib/measureGrouping";
import { useToast } from "@/hooks/use-toast";
import { Music } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  detectPatterns,
  detectMultiTrackPatterns,
  getPatternStatistics,
  getMultiTrackPatternStatistics,
  type DetectedPattern
} from "@/lib/patternDetection";
import {
  generatePatternizedCode,
  generateMultiStreamPatternCode
} from "@/lib/patternGeneration";
import { generateMultiStreamPatternCodeV2 } from "@/lib/patternGenerationV2";

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
  const [outMode, setOutMode] = useState<"single" | "multi" | "patternize">("single");
  const [availableSamples, setAvailableSamples] = useState<string[]>([]);
  const [lineLength, setLineLength] = useState<number>(8);
  const [useScaleMode, setUseScaleMode] = useState<boolean>(false);
  const [includeVelocity, setIncludeVelocity] = useState<boolean>(false);
  
  // Pattern detection state
  const [patternMinLength, setPatternMinLength] = useState<number>(2);
  const [patternMinRepetitions, setPatternMinRepetitions] = useState<number>(2);
  const [patternSimilarityThreshold, setPatternSimilarityThreshold] = useState<number>(0.6); // Match the lowered default
  const [detectedPatterns, setDetectedPatterns] = useState<any[]>([]);
  const [patternStats, setPatternStats] = useState<any>(null);
  
  // Timing mode state
  const [timingMode, setTimingMode] = useState<"auto" | "manual">("auto");
  const [manualCps, setManualCps] = useState<number>(DEFAULT_CPS);
  const [currentCps, setCurrentCps] = useState<number>(DEFAULT_CPS);
  const [useBarSyntax, setUseBarSyntax] = useState<boolean>(false);
  const [lineMeasureMode, setLineMeasureMode] = useState<"notes" | "measures">("notes");

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

      // Calculate CPS based on timing mode
      const calculatedCps = res.cyclesPerSecond ?? calculateCPS(res.tempo, res.timeSignature);
      const effectiveCps = timingMode === "auto" ? calculatedCps : manualCps;
      setCurrentCps(effectiveCps);

      // Use analyzed notes initially (cycles)
      const convertedNotes = res.notes;
      const notation = generateFormattedBracketNotation(convertedNotes, lineLength, res.calculatedKeySignature, useScaleMode);
      const stats = calculateStatistics(convertedNotes, notation);

      // Log analysis and initial conversion

      setNotes(convertedNotes);
      setBracketNotation(notation);
      setStatistics(stats);

      // If multi-stream or patternize selected, regenerate code
      if (outMode === "multi") {
        void regenerateMultiStream(useInstrumentSamples, allTracks);
      } else if (outMode === "patternize") {
        void regeneratePatternized(allTracks);
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
        void regenerateMultiStream(useInstrumentSamples, newSelected);
      } else if (outMode === "patternize") {
        void regeneratePatternized(newSelected);
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

  // Map track instrument names to Strudel sample names with variation
  // Takes track index to provide different samples for similar instruments
  const mapInstrumentToSample = (name: string | undefined, trackIndex: number = 0) => {
    const n = (name || "").toLowerCase();
    
    // Helper to rotate through options based on track index
    const pickByIndex = (options: string[]) => {
      return options[trackIndex % options.length];
    };

    // DRUMS / PERCUSSION
    if (/(kick|bd|bass\s*drum)/.test(n)) return "bd";
    if (/(snare|sd)/.test(n)) return "sd";
    if (/(hi[- ]?hat|hh)/.test(n)) return "hh";
    if (/(ride|rd)/.test(n)) return "rd";
    if (/(crash|cymbal|cr)/.test(n)) return "cr";
    if (/(tom)/.test(n)) return "tom_stick";
    if (/(shaker)/.test(n)) return "shaker_large";
    if (/(clap)/.test(n)) return "clap";
    if (/(cowbell|cb)/.test(n)) return "cb";
    if (/(tambourine)/.test(n)) return "tambourine";
    if (/(woodblock)/.test(n)) return "woodblock";
    if (/(timpani)/.test(n)) return "gm_timpani";

    // PIANO / KEYS
    if (/epiano|electric\s*piano|rhodes/.test(n))
      return pickByIndex(["gm_epiano1", "gm_epiano2", "gm_piano"]);
    if (/clav|clavinet/.test(n))
      return "gm_clavinet";
    if (/harpsichord/.test(n))
      return "gm_harpsichord";
    if (/celesta/.test(n)) return "gm_celesta";
    if (/glockenspiel/.test(n))
      return "gm_glockenspiel";
    if (/vibraphone/.test(n))
      return pickByIndex(["gm_vibraphone", "gm_marimba", "gm_xylophone"]);
    if (/marimba/.test(n))
      return "gm_marimba";
    if (/xylophone/.test(n))
      return "gm_xylophone";
    if (/tubular\s*bells/.test(n))
      return "gm_tubular_bells";
    if (/music\s*box/.test(n))
      return "gm_music_box";
    if (/piano|grand/.test(n))
      return pickByIndex(["gm_piano", "gm_piano2", "gm_honky_tonk"]);

    // ORGANS
    if (/drawbar|rock\s*organ/.test(n))
      return "gm_drawbar_organ";
    if (/church|pipe\s*organ/.test(n))
      return "gm_church_organ";
    if (/percussive\s*organ/.test(n))
      return "gm_percussive_organ";

    // GUITARS
    if (/nylon\s*guitar/.test(n))
      return "gm_acoustic_guitar_nylon";
    if (/steel\s*guitar/.test(n))
      return "gm_acoustic_guitar_steel";
    if (/overdriven/.test(n))
      return "gm_overdriven_guitar";
    if (/distortion/.test(n))
      return "gm_distortion_guitar";
    if (/jazz\s*guitar/.test(n))
      return "gm_electric_guitar_jazz";
    if (/guitar/.test(n))
      return pickByIndex([
        "gm_electric_guitar_clean",
        "gm_acoustic_guitar_steel",
        "gm_acoustic_guitar_nylon",
        "gm_electric_guitar_jazz",
        "gm_electric_guitar_muted"
      ]);

    // BASSES
    if (/fretless\s*bass/.test(n))
      return "gm_fretless_bass";
    if (/slap\s*bass/.test(n))
      return pickByIndex(["gm_slap_bass_1", "gm_slap_bass_2"]);
    if (/synth\s*bass/.test(n))
      return pickByIndex(["gm_synth_bass_1", "gm_synth_bass_2"]);
    if (/bass/.test(n))
      return pickByIndex([
        "gm_acoustic_bass",
        "gm_electric_bass_finger",
        "gm_electric_bass_pick",
        "gm_fretless_bass",
        "gm_slap_bass_1"
      ]);

    // STRINGS & ENSEMBLES
    if (/violin/.test(n))
      return "gm_violin";
    if (/viola/.test(n)) return "gm_viola";
    if (/cello/.test(n)) return "gm_cello";
    if (/contrabass|double\s*bass/.test(n))
      return "gm_contrabass";
    if (/pizzicato/.test(n))
      return "gm_pizzicato_strings";
    if (/tremolo/.test(n))
      return "gm_tremolo_strings";
    if (/string/.test(n))
      return pickByIndex([
        "gm_string_ensemble_1",
        "gm_string_ensemble_2",
        "gm_synth_strings_1",
        "gm_synth_strings_2"
      ]);
    if (/harp/.test(n))
      return "gm_orchestral_harp";

    // BRASS & WINDS
    if (/trumpet/.test(n))
      return pickByIndex(["gm_trumpet", "gm_muted_trumpet"]);
    if (/trombone/.test(n)) return "gm_trombone";
    if (/tuba/.test(n)) return "gm_tuba";
    if (/horn/.test(n))
      return "gm_french_horn";
    if (/sax/.test(n))
      return pickByIndex([
        "gm_tenor_sax",
        "gm_alto_sax",
        "gm_soprano_sax",
        "gm_baritone_sax"
      ]);
    if (/clarinet/.test(n)) return "gm_clarinet";
    if (/oboe/.test(n)) return "gm_oboe";
    if (/bassoon/.test(n)) return "gm_bassoon";
    if (/flute/.test(n))
      return pickByIndex(["gm_flute", "gm_piccolo", "gm_pan_flute"]);
    if (/piccolo/.test(n)) return "gm_piccolo";
    if (/recorder/.test(n))
      return "gm_recorder";
    if (/pan\s*flute/.test(n))
      return "gm_pan_flute";
    if (/whistle/.test(n))
      return "gm_whistle";
    if (/ocarina/.test(n))
      return "gm_ocarina";

    // VOICES / CHOIRS
    if (/choir/.test(n))
      return pickByIndex(["gm_choir_aahs", "gm_voice_oohs", "gm_synth_voice"]);

    // SYNTH LEADS/PADS/FX
    if (/lead/.test(n))
      return pickByIndex([
        "gm_lead_2_sawtooth",
        "gm_lead_1_square",
        "gm_lead_8_bass_lead",
        "gm_lead_3_calliope",
        "gm_lead_4_chiff"
      ]);
    if (/pad/.test(n))
      return pickByIndex(["gm_pad_warm", "gm_pad_poly", "gm_pad_sweep", "gm_pad_new_age", "gm_pad_choir"]);
    if (/fx/.test(n))
      return pickByIndex(["gm_fx_atmosphere", "gm_fx_echoes", "gm_fx_crystal", "gm_fx_goblins", "gm_fx_sci_fi"]);

    // ETHNIC / MISC
    if (/sitar/.test(n)) return "gm_sitar";
    if (/banjo/.test(n)) return "gm_banjo";
    if (/koto/.test(n)) return "gm_koto";
    if (/shamisen/.test(n)) return "gm_shamisen";
    if (/bagpipe/.test(n)) return "gm_bagpipe";
    if (/harmonica/.test(n))
      return "gm_harmonica";

    // ORCHESTRA HIT
    if (/orchestra\s*hit/.test(n))
      return "gm_orchestra_hit";

    // Fallback - use a simple synth sound
    return "triangle";
  };

  // Regenerate multi-stream code based on current state
  const regenerateMultiStream = async (perInstrument: boolean, overrideSelectedTracks?: number[]) => {
    return regenerateMultiStreamWithScaleMode(perInstrument, overrideSelectedTracks, useScaleMode);
  };
  
  // Regenerate multi-stream code with explicit scale mode
  const regenerateMultiStreamWithScaleMode = async (perInstrument: boolean, overrideSelectedTracks?: number[] | undefined, explicitScaleMode?: boolean) => {
    const scaleMode = explicitScaleMode !== undefined ? explicitScaleMode : useScaleMode;
    console.log("[regenerateMultiStream] Using scale mode:", scaleMode);
    if (!uploadedFile || !analysis) {
      setCodeOverride("");
      return;
    }

    if (perInstrument) {
      // Build one stream per selected track with per-instrument sample mapping
      const tracksToUse = overrideSelectedTracks || selectedTracks;
      const tracks =
        tracksToUse.length > 0
          ? tracksToUse
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
        
        // Skip empty tracks
        if (perTrackNotes.length === 0) continue;
        
        // Generate clean instrument name for the variable
        const getInstrumentName = () => {
          if (trackInfo?.isPercussion) return 'DRUMS';
          const inst = (trackInfo?.instrument || 'UNKNOWN').toUpperCase();
          // Clean up common instrument names  
          if (inst.includes('PIANO')) return 'PIANO';
          if (inst.includes('BASS')) return 'BASS';
          if (inst.includes('GUITAR')) return 'GUITAR';
          if (inst.includes('VIOLIN')) return 'VIOLIN';
          if (inst.includes('CELLO')) return 'CELLO';
          if (inst.includes('VIOLA')) return 'VIOLA';
          if (inst.includes('SYNTH')) return 'SYNTH';
          if (inst.includes('STRING')) return 'STRINGS';
          if (inst.includes('BRASS')) return 'BRASS';
          if (inst.includes('FLUTE')) return 'FLUTE';
          if (inst.includes('SAX')) return 'SAX';
          if (inst.includes('TRUMPET')) return 'TRUMPET';
          if (inst.includes('ORGAN')) return 'ORGAN';
          if (inst.includes('DRUM')) return 'DRUMS';
          // Fallback: clean the name
          return inst.replace(/[^A-Z0-9]/g, '_').substring(0, 20);
        };
        
        const instrumentName = getInstrumentName();
        const varName = `T${idx}_${instrumentName}`;
        
        if (trackInfo?.isPercussion) {
          // Handle percussion track
          const drumNotation = generateDrumBracketNotation(perTrackNotes);
          const wrapped = wrapInAngles(drumNotation);
          const drumBank = getDrumBank(
            trackInfo.name || trackInfo.instrument || '', 
            drumTrackCount
          );
          
          let drumCode = `${varName}: s(\`${wrapped}\`)`;
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
          
          lines.push(`// ${varName}: ${trackInfo.name || trackInfo.instrument || 'Percussion'}`);
          lines.push(drumCode);
          drumTrackCount++;
        } else {
          // Handle pitched instrument track
          let seq: string;
          if (timingMode === "auto" && useBarSyntax) {
            // Use bar syntax
            seq = generateBarBracketNotation(
              perTrackNotes,
              lineLength,
              analysis.timeSignature,
              analysis.calculatedKeySignature,
              scaleMode
            );
          } else {
            // Use regular notation
            seq = buildSequentialBracket(perTrackNotes, lineLength, analysis.calculatedKeySignature, scaleMode);
          }
          const wrapped = wrapInAngles(seq);
          const instrument = trackInfo?.instrument;
          // Map to a sample using the instrument mapper
          const sample = mapInstrumentToSample(instrument);
          console.log(`Track ${idx} instrument: "${instrument}" mapped to sample: "${sample}"`);
          
          // Don't check availability - just use the exact sample name
          // Strudel will load these from soundfonts as needed
          
          // Generate code with velocity if enabled
          lines.push(`// ${varName}: ${trackInfo?.instrument || trackInfo?.name || 'Unknown'}`);
          
          // Debug: Log the final sample name being used
          console.log(`Final sample for track ${idx}: "${sample}"`);
          
          if (includeVelocity) {
            const strudelCode = buildStrudelCode(
              perTrackNotes,
              lineLength,
              analysis.calculatedKeySignature,
              scaleMode,
              includeVelocity,
              sample
            );
            console.log(`Generated Strudel code with velocity for ${varName}: ${strudelCode}`);
            // Use named label instead of $:
            lines.push(`${varName}: ${strudelCode}`);
          } else {
            // Generate proper code based on scale mode
            let codeWithoutVelocity: string;
            if (scaleMode && analysis.calculatedKeySignature) {
              const scaleString = formatScaleForStrudel(analysis.calculatedKeySignature);
              codeWithoutVelocity = `${varName}: n(\`${wrapped}\`).scale("${scaleString}").sound("${sample}")`;
            } else {
              codeWithoutVelocity = `${varName}: note(\`${wrapped}\`).sound("${sample}")`;
            }
            console.log(`Generated Strudel code without velocity for ${varName}: ${codeWithoutVelocity}`);
            lines.push(codeWithoutVelocity);
          }
        }
      }
      
      // Join all lines with proper spacing
      const code = lines.length > 0 ? lines.join('\n\n') : '// No tracks selected or no notes found';
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
              scaleMode,
              includeVelocity,
              "triangle"
            );
            lines.push(`$: ${strudelCode}`);
          } else {
            let seq: string;
            if (timingMode === "auto" && useBarSyntax) {
              // Use bar syntax
              seq = generateBarBracketNotation(
                streamNotes,
                lineLength,
                analysis.timeSignature,
                analysis.calculatedKeySignature,
                scaleMode
              );
            } else {
              // Use regular notation
              seq = buildSequentialBracket(streamNotes, lineLength, analysis.calculatedKeySignature, scaleMode);
            }
            const wrapped = wrapInAngles(seq);
            
            // Generate proper code based on scale mode
            let codeWithoutVelocity: string;
            if (scaleMode && analysis.calculatedKeySignature) {
              const scaleString = formatScaleForStrudel(analysis.calculatedKeySignature);
              codeWithoutVelocity = `$: n(\`${wrapped}\`).scale("${scaleString}").sound("triangle")`;
            } else {
              codeWithoutVelocity = `$: note(\`${wrapped}\`).sound("triangle")`;
            }
            lines.push(codeWithoutVelocity);
          }
        });
      const code = lines.join("\n\n");
      setCodeOverride(code);
    }
  };

  // Regenerate patternized code based on current state
  const regeneratePatternized = async (overrideSelectedTracks?: number[]) => {
    return regeneratePatternizedWithScaleMode(overrideSelectedTracks, useScaleMode);
  };
  
  // Regenerate patternized code with explicit scale mode
  const regeneratePatternizedWithScaleMode = async (overrideSelectedTracks?: number[] | undefined, explicitScaleMode?: boolean) => {
    const scaleMode = explicitScaleMode !== undefined ? explicitScaleMode : useScaleMode;
    console.log("[regeneratePatternized] Using scale mode:", scaleMode);
    if (!uploadedFile || !analysis || notes.length === 0) {
      setCodeOverride("");
      setDetectedPatterns([]);
      setPatternStats(null);
      return;
    }

    try {
      setIsProcessing(true);

      if (selectedTracks.length <= 1) {
        // Single track pattern detection
        const patterns = detectPatterns(notes, {
          minLength: patternMinLength,
          minRepetitions: patternMinRepetitions,
          similarityThreshold: patternSimilarityThreshold,
        });

        const stats = getPatternStatistics(patterns);
        setDetectedPatterns(patterns);
        setPatternStats(stats);

        if (patterns.length > 0) {
          const patternizedCode = generatePatternizedCode(patterns, notes, {
            keySignature: analysis.calculatedKeySignature,
            useScaleMode,
            includeVelocity,
            lineLength,
            sound: "triangle"
          });
          setCodeOverride(patternizedCode);
        } else {
          // Fallback to regular notation if no patterns found
          const notation = generateFormattedBracketNotation(notes, lineLength, analysis.calculatedKeySignature, scaleMode);
          const strudelCode = generateStrudelCode(notation, analysis.calculatedKeySignature, scaleMode, "triangle");
          setCodeOverride(strudelCode);
        }
      } else {
        // Multi-track pattern detection
        const trackNotes = new Map<number, Note[]>();
        const tracksToUse = overrideSelectedTracks || selectedTracks;
        
        for (const trackId of tracksToUse) {
          const perTrackNotes = await convertMidiToNotes(uploadedFile, {
            ...defaultSettings,
            cyclesPerSecond: currentCps,
            selectedTracks: [trackId],
          });
          trackNotes.set(trackId, perTrackNotes);
        }

        const trackPatterns = detectMultiTrackPatterns(trackNotes, analysis.trackInfo, {
          minLength: patternMinLength,
          minRepetitions: patternMinRepetitions,
          similarityThreshold: patternSimilarityThreshold,
        });

        const stats = getMultiTrackPatternStatistics(trackPatterns);
        setPatternStats(stats);
        
        // Flatten patterns for display
        const allPatterns: DetectedPattern[] = [];
        trackPatterns.forEach(patterns => allPatterns.push(...patterns));
        setDetectedPatterns(allPatterns);

        if (allPatterns.length > 0) {
          // Use V2 pattern generation with proper instrument support
          // Always use instrument samples for patternize mode
          const multiStreamCode = generateMultiStreamPatternCodeV2(
            trackPatterns,
            trackNotes,
            analysis.trackInfo,
            {
              keySignature: analysis.calculatedKeySignature,
              useScaleMode,
              includeVelocity,
              lineLength,
              sound: undefined,  // Always use instrument samples in patternize mode
              mapInstrumentToSample: mapInstrumentToSample,  // Always map instruments
              availableSamples
            },
            tracksToUse  // Pass selected tracks for toggle constants
          );
          console.log("[Index] Generated multi-stream pattern code:", multiStreamCode);
          console.log("[Index] Code length:", multiStreamCode.length);
          setCodeOverride(multiStreamCode);
        } else {
          // Fallback to multi-stream without patterns
          await regenerateMultiStream(useInstrumentSamples);
        }
      }

      toast({
        title: "Pattern analysis complete",
        description: `Found ${detectedPatterns.length} patterns`,
      });
    } catch (error) {
      console.error("Pattern detection error:", error);
      toast({
        title: "Error analyzing patterns",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
      // Fallback to regular code
      setCodeOverride("");
      setDetectedPatterns([]);
      setPatternStats(null);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <GlobalDragZone onFileUpload={handleFileUpload} isProcessing={isProcessing}>
      <div className="min-h-screen bg-gradient-subtle">
        {/* Header */}
        <header className="border-b border-primary/20 bg-card/90 backdrop-blur-xl shadow-tech cyber-grid">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl gradient-musical shadow-glow transition-glow hover:shadow-neon-glow">
                  <Music className="h-8 w-8 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    MIDI → Bracket Notation
                  </h1>
                  <p className="text-muted-foreground">
                    🚀 Convert MIDI files to Strudel's bracket notation with AI-powered pattern detection
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
              How This Tool Works
            </h2>
            <div className="max-w-4xl mx-auto space-y-6">
               {/* Overview */}
               <div className="tech-card p-6 text-left gradient-tech">
                <h3 className="font-semibold mb-3">What is Bracket Notation?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Bracket notation is a time-based musical notation system used by Strudel. 
                  This tool converts MIDI files into bracket notation, allowing you to play complex 
                  musical pieces in Strudel's live coding environment.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Basic Notation */}
                   <div>
                     <h4 className="font-medium mb-2">Basic Notation:</h4>
                     <div className="font-mono text-sm space-y-1 bg-muted/50 p-3 rounded-lg border border-primary/20">
                       <div>
                         <span className="text-primary font-medium">Notes:</span> C4 D4 E4
                       </div>
                       <div>
                         <span className="text-primary font-medium">Durations:</span> C4@0.5 D4@0.25
                       </div>
                       <div>
                         <span className="text-primary font-medium">Rests:</span> C4 ~@0.5 D4
                       </div>
                       <div>
                         <span className="text-primary font-medium">Chords:</span> [C4, E4, G4]@1
                       </div>
                     </div>
                     
                     <h4 className="font-medium mt-4 mb-2">Duration Values:</h4>
                     <div className="font-mono text-xs space-y-1 bg-muted/30 p-3 rounded-lg border border-accent/20">
                       <div className="text-accent font-medium mb-2">@ = Duration in beats</div>
                       <div><span className="text-secondary">@1</span> = Whole note (1 beat)</div>
                       <div><span className="text-secondary">@0.5</span> = Half note (1/2 beat)</div>
                       <div><span className="text-secondary">@0.25</span> = Quarter note (1/4 beat)</div>
                       <div><span className="text-secondary">@0.125</span> = Eighth note (1/8 beat)</div>
                       <div><span className="text-secondary">@0.0625</span> = Sixteenth note (1/16 beat)</div>
                     </div>
                   </div>
                  {/* Advanced Notation */}
                   <div>
                     <h4 className="font-medium mb-2">Advanced Features:</h4>
                     <div className="font-mono text-sm space-y-1 bg-muted/50 p-3 rounded-lg border border-secondary/20">
                       <div>
                         <span className="text-primary font-medium">Overlaps:</span> {`{C4@2, ~@0.5 E4@1.5}@2`}
                       </div>
                       <div>
                         <span className="text-primary font-medium">Patterns:</span> {`<C4 D4 E4>`}
                       </div>
                       <div>
                         <span className="text-primary font-medium">Velocity:</span> .velocity(`0.8 0.7 0.9`)
                       </div>
                       <div>
                         <span className="text-primary font-medium">Drums:</span> s(`bd sd hh`).bank("TR909")
                       </div>
                     </div>
                   </div>
                </div>
              </div>

              {/* Feature Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Notation Modes */}
                <div className="tech-card p-4 text-left">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <span className="text-lg">🎵</span> Notation Modes
                  </h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Choose how notes are represented:
                  </p>
                  <ul className="text-sm space-y-1">
                    <li>• <strong>Raw Notes</strong>: C4, D#3, F5</li>
                    <li>• <strong>Scale Degrees</strong>: 0, 1, 2 (with key)</li>
                  </ul>
                </div>

                {/* Output Modes */}
                <div className="tech-card p-4 text-left">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <span className="text-lg">📊</span> Output Modes
                  </h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Organize your music:
                  </p>
                  <ul className="text-sm space-y-1">
                    <li>• <strong>Single</strong>: One combined pattern</li>
                    <li>• <strong>Multi</strong>: Separate tracks</li>
                    <li>• <strong>Patternize</strong>: Detect loops</li>
                  </ul>
                </div>

                {/* Smart Features */}
                <div className="tech-card p-4 text-left">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <span className="text-lg">✨</span> Smart Features
                  </h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Automatic enhancements:
                  </p>
                  <ul className="text-sm space-y-1">
                    <li>• Key signature detection</li>
                    <li>• Instrument mapping</li>
                    <li>• Pattern recognition</li>
                  </ul>
                </div>
              </div>

              {/* Quick Start */}
              <div className="bg-gradient-musical text-primary-foreground p-6 rounded-lg text-center">
                <h3 className="font-semibold mb-2">Ready to Start?</h3>
                <p className="text-sm mb-3 opacity-90">
                  Simply drag & drop a MIDI file onto this page, or click the upload button above.
                </p>
                <p className="text-xs opacity-75">
                  Supported formats: .mid, .midi, .mid.rtx
                </p>
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
                        // Add debug logging
                        console.log("[Toggle] Value changed to:", value);
                        console.log("[Toggle] Current useScaleMode:", useScaleMode);
                        console.log("[Toggle] Current outMode:", outMode);
                        
                        if (!value) return; // Guard against undefined
                        
                        const newUseScaleMode = value === "scale";
                        console.log("[Toggle] Setting useScaleMode to:", newUseScaleMode);
                        
                        // Update state immediately
                        setUseScaleMode(newUseScaleMode);
                        
                        // Don't process if no notes
                        if (!notes.length) {
                          console.log("[Toggle] No notes to process");
                          return;
                        }
                        
                        setIsProcessing(true);
                        
                        // Small delay to ensure state is updated
                        await new Promise(resolve => setTimeout(resolve, 10));
                        
                        try {
                          const notation = generateFormattedBracketNotation(
                            notes, 
                            lineLength, 
                            analysis.calculatedKeySignature, 
                            newUseScaleMode
                          );
                          setBracketNotation(notation);
                          const stats = calculateStatistics(notes, notation);
                          setStatistics(stats);
                          
                          console.log("[Toggle] Regenerated notation, first few chars:", notation.substring(0, 50));
                          console.log("[Toggle] useScaleMode is now:", newUseScaleMode);
                          
                          // Force code regeneration for all modes - pass newUseScaleMode explicitly
                          if (outMode === "multi") {
                            await regenerateMultiStreamWithScaleMode(useInstrumentSamples, undefined, newUseScaleMode);
                          } else if (outMode === "patternize") {
                            await regeneratePatternizedWithScaleMode(undefined, newUseScaleMode);
                          } else {
                            // For single mode, clear the codeOverride to let StrudelPlayer regenerate from bracketNotation
                            setCodeOverride("");
                            console.log("[Toggle] Cleared codeOverride for single mode");
                          }
                        } catch (error) {
                          console.error("[Toggle] Error processing:", error);
                        } finally {
                          setIsProcessing(false);
                        }
                      }}
                      className="flex flex-col gap-2 w-full"
                    >
                      <ToggleGroupItem value="notes" className="text-xs justify-start" disabled={isProcessing}>
                        <div className="text-left">
                          <div className="font-medium">Raw Notes</div>
                          <div className="text-xs text-muted-foreground">Example: C4 D#4 F5</div>
                        </div>
                      </ToggleGroupItem>
                      <ToggleGroupItem value="scale" className="text-xs justify-start" disabled={isProcessing}>
                        <div className="text-left">
                          <div className="font-medium">Scale Degrees</div>
                          <div className="text-xs text-muted-foreground">Example: 0 1 2 (based on key)</div>
                        </div>
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
                          } else if (outMode === "patternize") {
                            await regeneratePatternized();
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
                    onValueChange={async (value: "single" | "multi" | "patternize") => {
                      if (value) {
                        console.log("[OutputMode] Switching to:", value);
                        setOutMode(value);
                        if (value === "single") {
                          setCodeOverride("");
                          console.log("[OutputMode] Cleared codeOverride for single mode");
                        } else if (value === "multi") {
                          await regenerateMultiStream(useInstrumentSamples);
                        } else if (value === "patternize") {
                          await regeneratePatternized();
                        }
                      }
                    }}
                    className="flex flex-col gap-2 w-full"
                  >
                    <ToggleGroupItem value="single" className="text-xs justify-start">
                      <div className="text-left">
                        <div className="font-medium">Single Stream</div>
                        <div className="text-xs text-muted-foreground">All tracks combined into one pattern</div>
                      </div>
                    </ToggleGroupItem>
                    <ToggleGroupItem value="multi" className="text-xs justify-start">
                      <div className="text-left">
                        <div className="font-medium">Multi Stream</div>
                        <div className="text-xs text-muted-foreground">Separate pattern for each track</div>
                      </div>
                    </ToggleGroupItem>
                    <ToggleGroupItem value="patternize" className="text-xs justify-start">
                      <div className="text-left">
                        <div className="font-medium">Patternize</div>
                        <div className="text-xs text-muted-foreground">Detect and use repeated patterns</div>
                      </div>
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
                  
                  {/* Pattern Detection Controls - Only show when patternize is selected */}
                  {outMode === "patternize" && (
                    <div className="mt-4 pt-3 border-t space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Pattern Detection Parameters</Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Adjust how patterns are detected and analyzed
                        </p>
                      </div>
                      
                      {/* Pattern Length */}
                      <div className="space-y-2">
                        <div className="text-xs font-medium">Min Pattern Length ({patternMinLength} notes)</div>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={patternMinLength}
                          onChange={async (e) => {
                            const newLength = parseInt(e.target.value);
                            setPatternMinLength(newLength);
                            if (notes.length > 0) {
                              await regeneratePatternized();
                            }
                          }}
                        />
                        <div className="text-xs text-muted-foreground">
                          Minimum number of notes required for a pattern
                        </div>
                      </div>
                      
                      {/* Pattern Repetitions */}
                      <div className="space-y-2">
                        <div className="text-xs font-medium">Min Repetitions ({patternMinRepetitions})</div>
                        <input
                          type="range"
                          min={2}
                          max={10}
                          step={1}
                          value={patternMinRepetitions}
                          onChange={async (e) => {
                            const newReps = parseInt(e.target.value);
                            setPatternMinRepetitions(newReps);
                            if (notes.length > 0) {
                              await regeneratePatternized();
                            }
                          }}
                        />
                        <div className="text-xs text-muted-foreground">
                          How many times a pattern must repeat to be detected
                        </div>
                      </div>
                      
                      {/* Similarity Threshold */}
                      <div className="space-y-2">
                        <div className="text-xs font-medium">Similarity Threshold ({(patternSimilarityThreshold * 100).toFixed(0)}%)</div>
                        <input
                          type="range"
                          min={0.5}
                          max={1.0}
                          step={0.05}
                          value={patternSimilarityThreshold}
                          onChange={async (e) => {
                            const newThreshold = parseFloat(e.target.value);
                            setPatternSimilarityThreshold(newThreshold);
                            if (notes.length > 0) {
                              await regeneratePatternized();
                            }
                          }}
                        />
                        <div className="text-xs text-muted-foreground">
                          How similar pattern repetitions must be (higher = more strict)
                        </div>
                      </div>
                      
                      {/* Pattern Statistics Display */}
                      {patternStats && (
                        <div className="mt-4 p-3 bg-muted rounded text-xs space-y-1">
                          <div className="font-medium">Pattern Analysis Results:</div>
                          <div>Patterns found: {patternStats.totalPatterns}</div>
                          <div>Total repetitions: {patternStats.totalRepetitions}</div>
                          <div>Average similarity: {(patternStats.averageSimilarity * 100).toFixed(1)}%</div>
                          <div>Coverage: {(patternStats.totalCoverage * 100).toFixed(1)}% of music</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Timing Mode */}
                <div className="space-y-3 p-4 border rounded">
                  <div>
                    <Label className="text-sm font-medium">Timing Mode</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Choose between automatic bar-based timing or manual CPS control
                    </p>
                  </div>
                   <ToggleGroup 
                     type="single" 
                     value={timingMode}
                     onValueChange={async (value: "auto" | "manual") => {
                       if (!value || !uploadedFile || !analysis) return;
                       setTimingMode(value);
                       setIsProcessing(true);
                       try {
                         const calculatedCps = analysis.cyclesPerSecond ?? calculateCPS(analysis.tempo, analysis.timeSignature);
                         const newCps = value === "auto" ? calculatedCps : manualCps;
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
                           analysis.calculatedKeySignature, 
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
                     className="flex flex-col gap-2 w-full"
                   >
                     <ToggleGroupItem value="auto" className="text-xs justify-start">
                       <div className="text-left">
                         <div className="font-medium">Auto</div>
                         <div className="text-xs text-muted-foreground">Use MIDI tempo & time signature</div>
                       </div>
                     </ToggleGroupItem>
                     <ToggleGroupItem value="manual" className="text-xs justify-start">
                       <div className="text-left">
                         <div className="font-medium">Manual</div>
                         <div className="text-xs text-muted-foreground">Set your own CPS value</div>
                       </div>
                     </ToggleGroupItem>
                   </ToggleGroup>
                  
                  {/* Auto mode display */}
                  {timingMode === "auto" && analysis && (
                    <>
                      <div className="mt-3 space-y-2 p-3 bg-muted rounded text-xs">
                        <div>
                          <span className="font-medium">CPS Formula:</span> {analysis.tempo} / 60 / {analysis.timeSignature.numerator} = {currentCps.toFixed(4)}
                        </div>
                        <div>
                          <span className="font-medium">Cycle length:</span> {(1/currentCps).toFixed(3)}s (1 bar)
                        </div>
                        <div>
                          <span className="font-medium">Bar duration @{analysis.tempo} BPM:</span> {(1/currentCps).toFixed(3)}s
                        </div>
                      </div>
                      
                      {/* Bar Syntax Switch - DISABLED: Bar syntax implementation not working correctly yet */}
                      {/* TODO: Fix the bar syntax implementation - timing issues with Strudel's bracket subdivision */}
                      {false && (
                        <div className="mt-3 flex items-center justify-between p-3 border rounded">
                          <div className="space-y-1">
                            <Label className="text-sm font-medium">Bar Syntax</Label>
                            <p className="text-xs text-muted-foreground">
                              Use [...] brackets for bars with automatic note durations
                            </p>
                          </div>
                          <Switch
                            id="bar-syntax"
                            checked={useBarSyntax}
                            onCheckedChange={async (checked) => {
                              setUseBarSyntax(checked);
                              if (!notes.length) return;
                              setIsProcessing(true);
                              try {
                                const notation = checked
                                  ? generateBarBracketNotation(
                                      notes,
                                      lineLength,
                                      analysis.timeSignature,
                                      analysis.calculatedKeySignature,
                                      useScaleMode
                                    )
                                  : generateFormattedBracketNotation(
                                      notes,
                                      lineLength,
                                      analysis.calculatedKeySignature,
                                      useScaleMode
                                    );
                                setBracketNotation(notation);
                                
                                if (outMode === "multi") {
                                  await regenerateMultiStream(useInstrumentSamples);
                                }
                              } finally {
                                setIsProcessing(false);
                              }
                            }}
                          />
                        </div>
                      )}
                    </>
                  )}
                  
                  {/* Manual mode controls */}
                  {timingMode === "manual" && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">CPS:</Label>
                        <input
                          type="number"
                          min="0.1"
                          max="10"
                          step="0.0001"
                          value={manualCps}
                          onChange={async (e) => {
                            const newManualCps = parseFloat(e.target.value) || DEFAULT_CPS;
                            setManualCps(newManualCps);
                            setCurrentCps(newManualCps);
                            
                            if (!uploadedFile) return;
                            setIsProcessing(true);
                            try {
                              const newNotes = await convertMidiToNotes(
                                uploadedFile,
                                {
                                  ...defaultSettings,
                                  cyclesPerSecond: newManualCps,
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
                          className="flex-1 px-2 py-1 text-xs border rounded"
                        />
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="2"
                        step="0.05"
                        value={manualCps}
                        onChange={async (e) => {
                          const newManualCps = parseFloat(e.target.value);
                          setManualCps(newManualCps);
                          setCurrentCps(newManualCps);
                          
                          if (!uploadedFile) return;
                          setIsProcessing(true);
                          try {
                            const newNotes = await convertMidiToNotes(
                              uploadedFile,
                              {
                                ...defaultSettings,
                                cyclesPerSecond: newManualCps,
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
                      />
                      <div className="text-xs text-muted-foreground">
                        Cycle length: {(1/manualCps).toFixed(3)}s • Default: 0.5 (1 cycle = 2s)
                      </div>
                    </div>
                  )}
                </div>

                {/* Line/Measure Mode Toggle */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Line Content Mode</div>
                  <ToggleGroup
                    type="single"
                    value={lineMeasureMode}
                    onValueChange={(value) => {
                      if (value) setLineMeasureMode(value as "notes" | "measures");
                    }}
                    className="grid grid-cols-2 w-full"
                  >
                    <ToggleGroupItem value="notes" className="text-xs">
                      Notes per line
                    </ToggleGroupItem>
                    <ToggleGroupItem value="measures" className="text-xs">
                      Measures per line
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {/* Line Length Slider */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {lineMeasureMode === "measures" ? `Measures per line (${lineLength})` : `Notes per line (${lineLength})`}
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={lineMeasureMode === "measures" ? 8 : 20}
                    step={1}
                    value={lineLength}
                    onChange={async (e) => {
                      const newLineLength = parseInt(e.target.value);
                      setLineLength(newLineLength);
                      if (!notes.length) return;
                      setIsProcessing(true);
                       try {
                         let notation: string;
                         if (lineMeasureMode === "measures" && analysis) {
                           // Group by measures and format
                           const measureGroups = groupNotesByMeasures(
                             notes,
                             analysis.timeSignature,
                             currentCps,
                             analysis.tempo
                           );
                           notation = formatMeasuresPerLine(
                             measureGroups,
                             newLineLength,
                             (measureNotes) => generateFormattedBracketNotation(
                               measureNotes,
                               8, // Fixed notes per measure notation
                               analysis.calculatedKeySignature,
                               useScaleMode
                             )
                           );
                         } else if (timingMode === "auto" && useBarSyntax && analysis) {
                           notation = generateBarBracketNotation(
                             notes,
                             newLineLength,
                             analysis.timeSignature,
                             analysis.calculatedKeySignature,
                             useScaleMode
                           );
                         } else {
                           notation = generateFormattedBracketNotation(
                             notes,
                             newLineLength,
                             analysis?.calculatedKeySignature,
                             useScaleMode
                           );
                         }
                         setBracketNotation(notation);
                         const stats = calculateStatistics(notes, notation);
                         setStatistics(stats);
                         if (outMode === "multi") {
                           void regenerateMultiStream(useInstrumentSamples);
                         } else if (outMode === "patternize") {
                           void regeneratePatternized();
                         }
                       } catch (error) {
                         console.error("Error updating line length:", error);
                       } finally {
                         setIsProcessing(false);
                       }
                    }}
                  />
                  <div className="text-xs text-muted-foreground">
                    {timingMode === "auto" && useBarSyntax 
                      ? "Control how many bars appear per line in bracket notation"
                      : "Control how many notes appear per line in bracket notation"}
                  </div>
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
              codeOverride={outMode === "patternize" ? codeOverride : (outMode === "multi" ? codeOverride : "")}
              statistics={statistics}
              keySignature={analysis?.calculatedKeySignature}
              useScaleMode={useScaleMode}
              notes={notes}
              includeVelocity={includeVelocity}
              lineLength={lineLength}
              formatByMeasures={lineMeasureMode === "measures"}
              measuresPerLine={lineLength}
              tempo={analysis?.tempo || 120}
              timeSignature={analysis?.timeSignature || { numerator: 4, denominator: 4 }}
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
