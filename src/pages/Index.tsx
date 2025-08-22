import React, { useState, useRef, useEffect } from 'react';
import { MidiUpload } from '@/components/MidiUpload';
import { TimelineVisualization } from '@/components/TimelineVisualization';
import { StrudelPlayer } from '@/components/StrudelPlayer';
import { Note } from '@/types/music';
import { convertMidiToNotes, MidiPlayback } from '@/lib/midiProcessor';
import { generateBracketNotation, calculateStatistics } from '@/lib/bracketNotation';
import { useToast } from '@/hooks/use-toast';
import { Music } from 'lucide-react';

const Index = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [bracketNotation, setBracketNotation] = useState('');
  const [statistics, setStatistics] = useState({ noteCount: 0, restCount: 0, totalDuration: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  
  const playbackRef = useRef<MidiPlayback | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    playbackRef.current = new MidiPlayback();
    playbackRef.current.setTimeUpdateCallback(setCurrentTime);
    
    return () => {
      playbackRef.current?.dispose();
    };
  }, []);

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    
    try {
      const convertedNotes = await convertMidiToNotes(file);
      const notation = generateBracketNotation(convertedNotes);
      const stats = calculateStatistics(convertedNotes, notation);
      
      setNotes(convertedNotes);
      setBracketNotation(notation);
      setStatistics(stats);
      
      // Set up playback
      playbackRef.current?.setNotes(convertedNotes);
      
      toast({
        title: "MIDI file processed successfully",
        description: `Converted ${stats.noteCount} notes to bracket notation`,
      });
    } catch (error) {
      toast({
        title: "Error processing MIDI file",
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePlay = () => {
    playbackRef.current?.play();
    setIsPlaying(true);
  };

  const handlePause = () => {
    playbackRef.current?.pause();
    setIsPlaying(false);
  };

  const handleReset = () => {
    playbackRef.current?.reset();
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const totalDuration = notes.length > 0 ? Math.max(...notes.map(n => n.release)) : 0;

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg gradient-musical">
              <Music className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">MIDI to Bracket Notation</h1>
              <p className="text-muted-foreground">Convert MIDI files to custom bracket notation for musical timing</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Upload Section */}
        <MidiUpload 
          onFileUpload={handleFileUpload}
          isProcessing={isProcessing}
        />

        {/* Demo Example */}
        {notes.length === 0 && !isProcessing && (
          <div className="text-center py-8">
            <h2 className="text-xl font-semibold mb-4">How Bracket Notation Works</h2>
            <div className="max-w-2xl mx-auto space-y-4 text-left bg-card p-6 rounded-lg">
              <div>
                <h3 className="font-medium mb-2">Examples:</h3>
                <div className="font-mono text-sm space-y-1 bg-muted p-3 rounded">
                  <div><span className="text-accent">Single notes:</span> C4 D4 E4@0.25</div>
                  <div><span className="text-accent">Chord:</span> [C4, E4, G4]@1</div>
                  <div><span className="text-accent">With rests:</span> C4 ~@0.5 D4</div>
                  <div><span className="text-accent">Complex overlap:</span> [C4@2 ~@1, ~@0.5 E4@1.5]@3</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Visualization */}
        <TimelineVisualization
          notes={notes}
          totalDuration={totalDuration}
          isPlaying={isPlaying}
          currentTime={currentTime}
          onPlay={handlePlay}
          onPause={handlePause}
          onReset={handleReset}
        />

        {/* Strudel Player */}
        <StrudelPlayer 
          bracketNotation={bracketNotation}
          statistics={statistics}
        />
      </main>
    </div>
  );
};

export default Index;
