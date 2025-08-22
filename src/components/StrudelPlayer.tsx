import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Play, Pause, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StrudelPlayerProps {
  bracketNotation: string;
}

export function StrudelPlayer({ bracketNotation }: StrudelPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const strudelCode = bracketNotation 
    ? `note(\`${bracketNotation}\`).piano()`
    : 'note("c d e f").piano()';

  useEffect(() => {
    let isMounted = true;

    const initStrudel = async () => {
      try {
        // Dynamic imports to handle potential loading issues
        const [
          { evalScope },
          { initAudioOnFirstClick },
          { getAudioContext, webaudioOutput, registerSynthSounds }
        ] = await Promise.all([
          import('@strudel/core'),
          import('@strudel/mini'), 
          import('@strudel/mini')
        ]);

        if (!isMounted) return;

        // Initialize audio context on first click
        initAudioOnFirstClick();

        // Load modules
        const loadModules = evalScope(
          import('@strudel/core'),
          import('@strudel/mini'),
          import('@strudel/tonal'),
        );

        await Promise.all([loadModules, registerSynthSounds()]);

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
              const { evaluate } = await import('@strudel/core');
              const pattern = evaluate(strudelCode);
              pattern.play();
              setIsPlaying(true);
            } catch (error) {
              console.error('Strudel evaluation error:', error);
            }
          },
          stop: async () => {
            try {
              const { getAudioContext } = await import('@strudel/mini');
              const ctx = getAudioContext();
              if (ctx.state !== 'closed') {
                await ctx.suspend();
              }
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