import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Play, Pause, Square, Copy, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface StrudelPlayerProps {
  bracketNotation: string;
  codeOverride?: string; // when provided, use this code instead of generating from bracketNotation
  statistics?: {
    noteCount: number;
    restCount: number;
    totalDuration: number;
  };
  onSamplesChanged?: (names: string[]) => void;
}

export function StrudelPlayer({ bracketNotation, codeOverride, statistics, onSamplesChanged }: StrudelPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const editorRef = useRef<any>(null);
  const editorInstanceRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const strudelCode = codeOverride && codeOverride.trim().length > 0
    ? codeOverride
    : (bracketNotation 
      ? `note(\`${bracketNotation}\`).s("triangle")`
      : 'note("c d e f").s("triangle")');

  // Initialize Strudel editor once
  useEffect(() => {
    let isMounted = true;
    const initStrudel = async () => {
      try {
        const [
          { StrudelMirror },
          { evalScope },
          WA,
          { registerSoundfonts },
          { transpiler },
        ] = await Promise.all([
          import("@strudel/codemirror"),
          import("@strudel/core"),
          import("@strudel/webaudio"),
          import("@strudel/soundfonts"),
          import("@strudel/transpiler"),
        ]);

        if (!isMounted) return;

        // Initialize audio context on first user interaction
        WA.initAudioOnFirstClick();

        // Ensure core modules and webaudio backend are available
        await evalScope(
          import("@strudel/core"),
          import("@strudel/mini"),
          import("@strudel/tonal"),
          import("@strudel/webaudio")
        );

        // Load common sample sets and best-effort registration of synths and soundfonts
        try {
          const ds = 'https://raw.githubusercontent.com/felixroos/dough-samples/main/';
          await Promise.all([
            WA.samples(`${ds}/tidal-drum-machines.json`),
            WA.samples(`${ds}/piano.json`),
            WA.samples(`${ds}/Dirt-Samples.json`),
            WA.samples(`${ds}/EmuSP12.json`),
            WA.samples(`${ds}/vcsl.json`),
            WA.samples(`${ds}/mridangam.json`),
            WA.registerSynthSounds?.(),
            registerSoundfonts?.(),
          ]);
        } catch (err) {
          console.warn("Strudel optional registration step failed:", err);
        }

        // Report available sample names to parent if requested
        try {
          const names = (() => {
            const store: any = (WA as any).soundMap;
            if (!store) return [] as string[];
            if (typeof store.get === 'function') return Object.keys(store.get() || {});
            if ('value' in store) return Object.keys(store.value || {});
            return [] as string[];
          })();
          if (onSamplesChanged) onSamplesChanged(names);
        } catch (e) {
          console.warn('Failed to read soundMap', e);
        }

        const root = containerRef.current;
        if (!root) return;

        // Keep track of the current code so copy works even after edits
        const currentCodeRef = { current: strudelCode } as { current: string };

        const editor = new StrudelMirror({
          defaultOutput: WA.webaudioOutput,
          getTime: () => WA.getAudioContext().currentTime,
          transpiler,
          root,
          initialCode: strudelCode,
          onCode: (code: string) => {
            currentCodeRef.current = code;
          },
          onError: (error: any) => {
            console.error("Strudel editor error:", error);
          },
          prebake: async () => {
            // Already baked via evalScope above; keep this hook in case library expects it
            return;
          },
        } as any);

        // Keep instance for future code updates
        editorInstanceRef.current = editor;

        // Expose evaluate/stop using the editor API
        editorRef.current = {
          evaluate: async () => {
            try {
              await editor.evaluate();
              setIsPlaying(true);
            } catch (error) {
              console.error("Strudel evaluate() failed:", error);
            }
          },
          stop: async () => {
            try {
              editor.stop();
              setIsPlaying(false);
            } catch (error) {
              console.error("Strudel stop() failed:", error);
            }
          },
          getCode: () => currentCodeRef.current,
          destroy: () => editor.destroy?.(),
        };

        setIsLoaded(true);
      } catch (error) {
        console.error("Failed to initialize Strudel:", error);
      }
    };

    initStrudel();

    return () => {
      isMounted = false;
      if (editorRef.current?.destroy) {
        editorRef.current.destroy();
      }
    };
  }, []);

  // Update editor code when strudelCode changes without recreating the editor
  useEffect(() => {
    if (!isLoaded) return;
    const inst = editorInstanceRef.current;
    try {
      if (inst && typeof inst.setCode === 'function') {
        inst.setCode(strudelCode);
      }
    } catch {}
  }, [strudelCode, isLoaded]);

  const handlePlay = () => {
    if (editorRef.current?.evaluate) {
      editorRef.current.evaluate();
    }
  };

  const handleStop = () => {
    if (editorRef.current?.stop) {
      editorRef.current.stop();
    }
  };

  const copyToClipboard = async () => {
    try {
      const code = editorRef.current?.getCode
        ? editorRef.current.getCode()
        : strudelCode;
      await navigator.clipboard.writeText(code);
      toast({
        description: "Strudel code copied to clipboard!",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        description: "Failed to copy to clipboard",
      });
    }
  };

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

  if (!bracketNotation) {
    return (
      <Card className="p-6">
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
          <Button
            onClick={handlePlay}
            disabled={!isLoaded}
            variant="musical"
            size="sm"
            className={cn(isPlaying && "bg-accent")}
          >
            <Play className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleStop}
            disabled={!isLoaded}
            variant="outline"
            size="sm"
          >
            <Square className="h-4 w-4" />
          </Button>
          <Button
            onClick={copyToClipboard}
            disabled={!bracketNotation}
            variant="outline"
            size="sm"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            onClick={downloadAsText}
            disabled={!bracketNotation}
            variant="outline"
            size="sm"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">
          Generated Strudel Code:
        </label>
        <div ref={containerRef} className="min-h-32">
          {!isLoaded && (
            <div className="w-full h-32 bg-muted rounded flex items-center justify-center">
              <div className="text-muted-foreground">Loading Strudel...</div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
