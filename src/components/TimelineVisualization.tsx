import React from 'react';
import { Note } from '@/types/music';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimelineVisualizationProps {
  notes: Note[];
  totalDuration: number;
  isPlaying: boolean;
  currentTime: number;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
}

export function TimelineVisualization({
  notes,
  totalDuration,
  isPlaying,
  currentTime,
  onPlay,
  onPause,
  onReset
}: TimelineVisualizationProps) {
  const TIMELINE_WIDTH = 800;
  const NOTE_HEIGHT = 20;
  const TRACK_HEIGHT = 30;
  
  // Group notes by octave for better visualization
  const noteGroups = notes.reduce((groups, note) => {
    const octave = parseInt(note.name.slice(-1));
    if (!groups[octave]) groups[octave] = [];
    groups[octave].push(note);
    return groups;
  }, {} as Record<number, Note[]>);

  const octaves = Object.keys(noteGroups).map(Number).sort((a, b) => b - a);

  const getTimelinePosition = (time: number) => {
    return (time / totalDuration) * TIMELINE_WIDTH;
  };

  const getNoteColor = (note: Note) => {
    const noteBase = note.name.replace(/\d/, '');
    const colors = {
      'C': 'bg-red-500',
      'C#': 'bg-red-400',
      'D': 'bg-orange-500',
      'D#': 'bg-orange-400',
      'E': 'bg-yellow-500',
      'F': 'bg-green-500',
      'F#': 'bg-green-400',
      'G': 'bg-blue-500',
      'G#': 'bg-blue-400',
      'A': 'bg-purple-500',
      'A#': 'bg-purple-400',
      'B': 'bg-pink-500'
    };
    return colors[noteBase as keyof typeof colors] || 'bg-gray-500';
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Timeline Visualization</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={isPlaying ? onPause : onPlay}
            disabled={notes.length === 0}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isPlaying ? 'Pause' : 'Play'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={notes.length === 0}
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Upload a MIDI file to see the timeline visualization
        </div>
      ) : (
        <div className="space-y-4">
          {/* Time ruler */}
          <div className="relative" style={{ width: TIMELINE_WIDTH }}>
            <div className="h-8 bg-musical-timeline-grid relative rounded">
              {Array.from({ length: Math.ceil(totalDuration) + 1 }, (_, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full w-px bg-border"
                  style={{ left: getTimelinePosition(i) }}
                >
                  <span className="absolute -top-6 -left-2 text-xs text-muted-foreground">
                    {i}
                  </span>
                </div>
              ))}
              
              {/* Current time indicator */}
              <div
                className="absolute top-0 h-full w-0.5 bg-accent shadow-glow transition-all duration-100"
                style={{ left: getTimelinePosition(currentTime) }}
              />
            </div>
          </div>

          {/* Note tracks by octave */}
          <div className="space-y-2">
            {octaves.map(octave => (
              <div key={octave} className="flex items-center gap-4">
                <div className="w-16 text-sm font-medium text-muted-foreground">
                  Octave {octave}
                </div>
                <div 
                  className="relative bg-muted rounded"
                  style={{ width: TIMELINE_WIDTH, height: TRACK_HEIGHT }}
                >
                  {noteGroups[octave].map((note, index) => {
                    const isActive = currentTime >= note.start && currentTime < note.release;
                    return (
                      <div
                        key={`${note.name}-${note.start}-${index}`}
                        className={cn(
                          "absolute rounded transition-all duration-200",
                          getNoteColor(note),
                          isActive && "ring-2 ring-accent shadow-glow scale-105"
                        )}
                        style={{
                          left: getTimelinePosition(note.start),
                          width: Math.max(2, getTimelinePosition(note.release - note.start)),
                          height: NOTE_HEIGHT,
                          top: (TRACK_HEIGHT - NOTE_HEIGHT) / 2
                        }}
                        title={`${note.name} (${note.start.toFixed(2)} - ${note.release.toFixed(2)})`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}