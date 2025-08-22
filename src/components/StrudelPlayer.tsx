import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Play, Pause, Square, Copy, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface StrudelPlayerProps {
  bracketNotation: string;
  statistics?: {
    noteCount: number;
    restCount: number;
    totalDuration: number;
  };
}

export function StrudelPlayer({ bracketNotation, statistics }: StrudelPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const strudelCode = bracketNotation 
    ? `note(\`${bracketNotation}\`).piano()`
    : 'note("c d e f").piano()';

  useEffect(() => {
    let isMounted = true;

    const initStrudel = async () => {
      try {
        // Simple initialization without full Strudel editor
        const { evalScope } = await import('@strudel/core');
        const { initAudioOnFirstClick } = await import('@strudel/mini');

        if (!isMounted) return;

        // Initialize audio context on first click
        initAudioOnFirstClick();

        // Load core modules
        await evalScope(
          import('@strudel/core'),
          import('@strudel/mini'),
          import('@strudel/tonal'),
        );

        if (!isMounted) return;

        // Create a simple text editor instead of full CodeMirror
        const textarea = document.createElement('textarea');
        textarea.value = strudelCode;
        textarea.className = 'w-full h-32 p-3 bg-muted font-mono text-sm rounded border resize-none';
        textarea.readOnly = true;

        if (containerRef.current) {
          containerRef.current.innerHTML = '';
          containerRef.current.appendChild(textarea);
        }

        // Simple evaluation function
        editorRef.current = {
          evaluate: async () => {
            try {
              const { evaluate, Pattern } = await import('@strudel/core');
              // Create pattern from the bracket notation
              const pattern = evaluate(strudelCode);
              if (pattern && typeof pattern.play === 'function') {
                await pattern.play();
                setIsPlaying(true);
              }
            } catch (error) {
              console.error('Strudel evaluation error:', error);
            }
          },
          stop: async () => {
            try {
              const { Pattern } = await import('@strudel/core');
              // Stop any playing patterns
              Pattern.silence();
              setIsPlaying(false);
            } catch (error) {
              console.error('Strudel stop error:', error);
            }
          }
        };

        setIsLoaded(true);
      } catch (error) {
        console.error('Failed to initialize Strudel:', error);
      }
    };

    initStrudel();

    return () => {
      isMounted = false;
      if (editorRef.current?.stop) {
        editorRef.current.stop();
      }
    };
  }, [strudelCode]);

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
      await navigator.clipboard.writeText(bracketNotation);
      toast({
        description: "Bracket notation copied to clipboard!",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        description: "Failed to copy to clipboard",
      });
    }
  };

  const downloadAsText = () => {
    const blob = new Blob([bracketNotation], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bracket-notation.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAsJson = () => {
    const data = {
      notation: bracketNotation,
      statistics: statistics,
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bracket-notation.json';
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