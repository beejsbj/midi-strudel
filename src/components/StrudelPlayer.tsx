import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Play, Pause, Square, Copy, Download, RotateCcw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  generateStrudelCode,
  extractFormattedVelocityPattern,
  generateFormattedBracketNotation,
} from "@/lib/bracketNotation";
import { groupNotesByMeasures, formatMeasuresPerLine } from "@/lib/measureGrouping";
import type { KeySignature } from "@/lib/musicTheory";
import type { Note } from "@/types/music";


interface StrudelPlayerProps {
  bracketNotation: string;
  codeOverride?: string; // when provided, use this code instead of generating from bracketNotation
  statistics?: {
    noteCount: number;
    restCount: number;
    totalDuration: number;
  };
  onSamplesChanged?: (names: string[]) => void;
  keySignature?: KeySignature;
  useScaleMode?: boolean;
  notes?: Note[]; // Optional notes for velocity extraction
  includeVelocity?: boolean; // Whether to include velocity in the code
  lineLength?: number; // Line length for velocity pattern formatting
  formatByMeasures?: boolean; // Whether to format by measures instead of notes per line
  measuresPerLine?: number; // Number of measures per line when formatByMeasures is true
  tempo?: number; // BPM for measure calculations
  timeSignature?: { numerator: number; denominator: number }; // Time signature for measure calculations
}

// Minimal type surface for the Strudel editor we use
type StrudelEditor = {
  evaluate: () => Promise<void>;
  stop: () => void;
  destroy?: () => void;
  setCode?: (code: string) => void;
  getCode?: () => string;
  repl?: { setCps?: (cps: number) => void };
  updateSettings?: (settings: Record<string, unknown>) => void;
};

type SoundMapStore = {
  get?: () => unknown;
  value?: unknown;
};

/**
 * React Strudel Player
 * - Pre-initialize editor and preload modules/samples on page load (no audio resume yet)
 * - Resume AudioContext and run audio-only registrations (synths, soundfonts) on first user action
 * - Suppress initial onCode event, debounce subsequent onCode while typing
 * - Status: "loading" during evaluate, "playing" on success, "stopped" on stop/error
 */
export function StrudelPlayer({
  bracketNotation,
  codeOverride,
  statistics, // eslint-disable-line @typescript-eslint/no-unused-vars
  onSamplesChanged,
  keySignature,
  useScaleMode = false,
  notes,
  includeVelocity = false,
  lineLength = 8,
  formatByMeasures = false,
  measuresPerLine = 1,
  tempo = 120,
  timeSignature = { numerator: 4, denominator: 4 },
}: StrudelPlayerProps) {
  const { toast } = useToast();

  // Derived initial code
  const strudelCode = useMemo(() => {
    if (codeOverride && codeOverride.trim().length > 0) return codeOverride;
    if (bracketNotation) {
      let finalNotation = bracketNotation;
      
      // If we have notes and formatByMeasures is enabled, regenerate notation by measures
      if (formatByMeasures && notes && notes.length > 0) {
        const cyclesPerSecond = 0.5; // Default cycles per second
        const measureGroups = groupNotesByMeasures(
          notes,
          timeSignature,
          cyclesPerSecond,
          tempo
        );
        
        finalNotation = formatMeasuresPerLine(
          measureGroups,
          measuresPerLine,
          (measureNotes: Note[]) => generateFormattedBracketNotation(
            measureNotes,
            lineLength,
            keySignature,
            useScaleMode
          )
        );
      }
      
      let velocityPattern: string | undefined;
      if (includeVelocity && notes && notes.length > 0) {
        velocityPattern = extractFormattedVelocityPattern(
          notes,
          lineLength,
          keySignature,
          useScaleMode
        );
      }
      return generateStrudelCode(
        finalNotation,
        keySignature,
        useScaleMode,
        "triangle",
        velocityPattern,
        includeVelocity
      );
    }
    return 'note("<c d e f>").s("triangle")';
  }, [
    bracketNotation,
    codeOverride,
    keySignature,
    useScaleMode,
    notes,
    includeVelocity,
    lineLength,
    formatByMeasures,
    measuresPerLine,
    tempo,
    timeSignature,
  ]);

  // Component state
  type Status = "idle" | "loading" | "playing" | "stopped";
  const [status, setStatus] = useState<Status>("idle");
  const isPlaying = status === "playing";
  const [editorReady, setEditorReady] = useState(true);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<StrudelEditor | null>(null);
  const replRef = useRef<{ setCps?: (cps: number) => void } | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const suppressInitialOnCodeRef = useRef(true);
  const currentCodeRef = useRef<string>(strudelCode);
  const statusRef = useRef<Status>(status);
  statusRef.current = status;

  // Track whether audio-specific registrations have run (synths/fonts)
  const audioReadyRef = useRef(false);

  // Pre-wire audio policy handler so first click on page will resume AudioContext
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { initAudioOnFirstClick } = await import("@strudel/webaudio");
        if (!cancelled) initAudioOnFirstClick(); // registers a one-time click handler
      } catch (e) {
        console.warn("[Strudel] Failed to register initAudioOnFirstClick()", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep current code ref in sync for copy/download/update operations
  useEffect(() => {
    currentCodeRef.current = strudelCode;
    // Push code into editor if it already exists
    try {
      if (editorRef.current?.setCode) {
        editorRef.current.setCode(strudelCode);
        // Also reset the suppress flag to allow immediate re-evaluation
        suppressInitialOnCodeRef.current = false;
      }
    } catch (e) {
      console.error("[StrudelPlayer] setCode failed:", e);
    }
  }, [strudelCode]);

  // Utility: trailing debounce
  const debounce = (fn: () => void | Promise<void>, delay = 300) => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      void fn();
    }, delay);
  };

  // Evaluate/Update handler
  const evaluateEditor = async (editor: StrudelEditor) => {
    setStatus("loading");
    try {
      await editor.evaluate();
      setStatus("playing");
    } catch (error) {
      console.error("Strudel evaluate() failed:", error);
      setStatus("stopped");
    }
  };

  // Ensure editor is created and prebaked.
  // On initial page-load we call with resumeAudio=false to avoid autoplay issues.
  // On first user interaction (Play/Update) we call with resumeAudio=true to finish audio setup.
  const ensureEditor = async (opts?: { resumeAudio?: boolean }) => {
    const resumeAudio = opts?.resumeAudio ?? true;

    // Imports needed for prebake and editor construction
    const [
      { StrudelMirror },
      { evalScope },
      { transpiler },
      webaudio,
      soundfontsMod,
    ] = await Promise.all([
      import("@strudel/codemirror"),
      import("@strudel/core"),
      import("@strudel/transpiler"),
      import("@strudel/webaudio"),
      import("@strudel/soundfonts"),
    ]);

    const {
      getAudioContext,
      webaudioOutput,
      registerSynthSounds,
      samples,
      soundMap,
    } = webaudio;

    // @strudel/soundfonts export shape can vary (cjs/esm), normalize it
    const registerSoundfonts =
      (
        soundfontsMod as unknown as {
          registerSoundfonts?: () => Promise<unknown>;
          default?: () => Promise<unknown>;
        }
      ).registerSoundfonts ??
      (soundfontsMod as unknown as { default?: () => Promise<unknown> })
        .default;

    // If we already have an editor, optionally complete audio registrations and return it
    if (editorRef.current) {
      if (resumeAudio && !audioReadyRef.current) {
        try {
          await getAudioContext().resume();
        } catch (e) {
          console.debug(
            "[Strudel] getAudioContext().resume() failed/blocked",
            e
          );
        }
        // Complete audio-specific registrations now
        const regs: Promise<unknown>[] = [];
        if (typeof registerSynthSounds === "function")
          regs.push(registerSynthSounds());
        if (typeof registerSoundfonts === "function")
          regs.push(registerSoundfonts());
        if (regs.length) {
          await Promise.all(regs);
        }
        audioReadyRef.current = true;
      }
      return editorRef.current;
    }

    const root = containerRef.current;
    if (!root) {
      throw new Error("Editor root container not found");
    }

    // Prebake: modules and samples are safe before audio resume
    try {
      const loadModules = evalScope(
        import("@strudel/core"),
        import("@strudel/mini"),
        import("@strudel/tonal"),
        import("@strudel/webaudio")
      );

      const ds =
        "https://raw.githubusercontent.com/felixroos/dough-samples/main/";

      // Always load modules + samples
      const promises: Promise<unknown>[] = [
        loadModules,
        samples(`${ds}/tidal-drum-machines.json`),
        samples(`${ds}/piano.json`),
        samples(`${ds}/Dirt-Samples.json`),
        samples(`${ds}/EmuSP12.json`),
        samples(`${ds}/vcsl.json`),
        samples(`${ds}/mridangam.json`),
      ];

      // Only run audio-specific registrations when allowed (first user gesture)
      if (resumeAudio) {
        try {
          await getAudioContext().resume();
        } catch (e) {
          console.debug(
            "[Strudel] getAudioContext().resume() failed/blocked",
            e
          );
        }
        if (typeof registerSynthSounds === "function")
          promises.push(registerSynthSounds());
        if (typeof registerSoundfonts === "function")
          promises.push(registerSoundfonts());
      }

      await Promise.all(promises);
      audioReadyRef.current = !!resumeAudio;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Failed to prebake Strudel:", msg);
      throw new Error(`Failed to prebake Strudel: ${msg}`);
    }

    // Create editor AFTER prebake to avoid premature internal work
    const editorInstance = new StrudelMirror({
      defaultOutput: webaudioOutput,
      getTime: () => getAudioContext().currentTime,
      transpiler,
      root,
      initialCode: currentCodeRef.current,
      extensions: [],
      onCode: (code: string) => {
        currentCodeRef.current = code;

        // Suppress the very first onCode fire from initialCode
        if (suppressInitialOnCodeRef.current) {
          suppressInitialOnCodeRef.current = false;
          return;
        }

        // Debounce updates while typing; if playing, re-evaluate
        debounce(async () => {
          try {
            if (statusRef.current === "playing" && editorRef.current) {
              await evaluateEditor(editorRef.current);
            }
          } catch (e) {
            console.error("[Strudel] Debounced evaluate failed:", e);
          }
        }, 300);
      },
      onError: (err: unknown) => {
        console.error("[Strudel] Editor error:", err);
        setStatus("stopped");
      },
      prebake: async () => {
        // No-op since we already prebaked above - but StrudelMirror expects this function
        return Promise.resolve();
      },
    }) as unknown as StrudelEditor;

    // Optional: tweak UX settings similarly to Vue example
    try {
      editorInstance.updateSettings?.({
        fontSize: 14,
        fontFamily: "monospace",
        theme: "strudelTheme",
        isBracketMatchingEnabled: true,
        isBracketClosingEnabled: true,
        isLineNumbersDisplayed: true,
        isActiveLineHighlighted: true,
        isAutoCompletionEnabled: true,
        isPatternHighlightingEnabled: true,
        isFlashEnabled: true,
        isTooltipEnabled: true,
        isLineWrappingEnabled: true,
        isTabIndentationEnabled: true,
        isMultiCursorEnabled: true,
      });
    } catch (e) {
      console.debug("[Strudel] updateSettings failed", e);
    }

    // Hold references
    editorRef.current = editorInstance;
    replRef.current = editorInstance.repl ?? null;


    // Report available sample names back up after a short delay
    if (onSamplesChanged) {
      setTimeout(() => {
        try {
          const store = soundMap as unknown as SoundMapStore;
          let names: string[] = [];
          if (store && typeof store.get === "function") {
            const obj = store.get();
            if (obj && typeof obj === "object") {
              names = Object.keys(obj as Record<string, unknown>);
            }
          } else if (store && "value" in store) {
            const v = (store as { value?: unknown }).value;
            if (v && typeof v === "object") {
              names = Object.keys(v as Record<string, unknown>);
            }
          }
          if (names.length > 0) onSamplesChanged(names);
        } catch (e) {
          console.warn("Failed to read soundMap", e);
        }
      }, 500);
    }

    setEditorReady(true);
    // Not playing yet; show stopped/idle state
    setStatus("stopped");

    return editorInstance;
  };

  // Auto-initialize editor when bracket notation is provided (after MIDI upload)
  useEffect(() => {
    if (!bracketNotation) return;

    // Small delay to ensure container is ready
    const timer = setTimeout(async () => {
      try {
        // Initialize editor without audio (safe for autoplay)
        await ensureEditor({ resumeAudio: false });
      } catch (e) {
        console.error("[Strudel] Auto-initialization failed:", e);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [bracketNotation]);

  // Pre-initialize editor on page load without resuming audio (safe under autoplay policy)
  // Wait until the container ref exists to avoid "root not found"
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const maxTries = 120; // ~2s with rAF

    const attempt = () => {
      if (cancelled) return;
      const root = containerRef.current;
      if (root) {
        (async () => {
          try {
            const ed = await ensureEditor({ resumeAudio: false });
            if (!cancelled && ed) {
              ed.setCode?.(currentCodeRef.current);
            }
          } catch (e) {
            // If this fails because of a transient race, retry until maxTries
            if (tries < maxTries) {
              tries++;
              requestAnimationFrame(attempt);
            } else {
              console.error("[Strudel] initial ensureEditor(false) failed:", e);
            }
          }
        })();
        return;
      }
      if (tries < maxTries) {
        tries++;
        requestAnimationFrame(attempt);
      } else {
        console.warn("[Strudel] Editor container not available after waiting.");
      }
    };

    attempt();

    return () => {
      cancelled = true;
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      try {
        editorRef.current?.destroy?.();
      } catch (e) {
        console.debug("[Strudel] destroy() failed", e);
      }
      editorRef.current = null;
      replRef.current = null;
    };
    // Only run once on mount - let setCode handle notation changes
  }, []);

  // Public handlers
  const handleTogglePlay = async () => {
    try {
      if (statusRef.current === "playing") {
        editorRef.current?.stop?.();
        setStatus("stopped");
        return;
      }
      const editor = await ensureEditor({ resumeAudio: true });
      await evaluateEditor(editor);
    } catch (e) {
      console.error("[Strudel] Toggle play failed:", e);
      setStatus("stopped");
    }
  };

  const handleUpdate = async () => {
    try {
      const editor = await ensureEditor({ resumeAudio: true });
      await evaluateEditor(editor);
    } catch (e) {
      console.error("[Strudel] Update failed:", e);
      setStatus("stopped");
    }
  };

  const handleStop = () => {
    try {
      editorRef.current?.stop?.();
    } finally {
      setStatus("stopped");
    }
  };

  // Optional: set CPS tempo if available (currently unused)
  const _setCps = (cps: number) => {
    try {
      replRef.current?.setCps?.(cps);
    } catch (e) {
      console.debug("[Strudel] setCps failed", e);
    }
  };
  void _setCps;

  // Copy helpers
  const copyToClipboard = async () => {
    try {
      const code = editorRef.current?.getCode
        ? editorRef.current.getCode()
        : currentCodeRef.current;
      // navigator.clipboard may require https context
      await navigator.clipboard.writeText(code);
      toast({ description: "Strudel code copied to clipboard!" });
    } catch (error) {
      toast({
        variant: "destructive",
        description: "Failed to copy to clipboard",
      });
    }
  };

  // Downloads
  const downloadAsText = () => {
    const blob = new Blob([bracketNotation], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bracket-notation.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAsJson = () => {
    const data = {
      notation: bracketNotation,
      statistics: statistics,
      timestamp: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bracket-notation.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openInStrudel = () => {
    try {
      // Get current code from editor or use currentCodeRef
      const code = editorRef.current?.getCode
        ? editorRef.current.getCode()
        : currentCodeRef.current;
      
      // Encode the content as base64 for the URL
      const encodedContent = btoa(code);
      const strudelUrl = `https://strudel.cc/#${encodedContent}`;
      
      // Open in new tab
      window.open(strudelUrl, '_blank');
      
      toast({ description: "Opening Strudel in new tab..." });
    } catch (error) {
      console.error("Failed to open in Strudel:", error);
      toast({
        variant: "destructive",
        description: "Failed to open in Strudel",
      });
    }
  };

  if (!bracketNotation) {
    return (
      <Card className="p-6 opacity-0 transition-opacity duration-300">
        <div className="text-center text-muted-foreground">
          Upload a MIDI file to generate Strudel code
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Strudel Player</h3>
        <div className="flex gap-2">
          {/* Play/Pause toggle */}
          <Button
            onClick={handleTogglePlay}
            variant="musical"
            size="sm"
            className={cn(isPlaying && "bg-accent")}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          {/* Explicit Update (re-evaluate current code) */}
          <Button
            onClick={handleUpdate}
            variant="outline"
            size="sm"
            disabled={status === "loading"}
            title="Evaluate / Update"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>

          {/* Stop */}
          <Button onClick={handleStop} variant="outline" size="sm">
            <Square className="h-4 w-4" />
          </Button>

          {/* Copy code */}
          <Button
            onClick={copyToClipboard}
            disabled={!bracketNotation}
            variant="outline"
            size="sm"
          >
            <Copy className="h-4 w-4" />
          </Button>

          {/* Download text */}
          <Button
            onClick={downloadAsText}
            disabled={!bracketNotation}
            variant="outline"
            size="sm"
          >
            <Download className="h-4 w-4" />
          </Button>

          {/* Open in Strudel */}
          <Button
            onClick={openInStrudel}
            disabled={!bracketNotation}
            variant="outline"
            size="sm"
            title="Open on Strudel"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">
          Generated Strudel Code:
        </label>
        <div className="relative min-h-32">
          {/* Loading overlay only during evaluate */}
          {status === "loading" && (
            <div className="absolute inset-0 w-full h-32 bg-muted rounded flex items-center justify-center z-20">
              <div className="text-muted-foreground">Loading Strudel…</div>
            </div>
          )}

          {/* Editor container */}
          <div ref={containerRef} className="min-h-32" />
        </div>
      </div>
    </Card>
  );
}
