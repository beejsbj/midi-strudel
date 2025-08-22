import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Download, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { saveAs } from 'file-saver';

interface BracketNotationDisplayProps {
  notation: string;
  statistics: {
    noteCount: number;
    restCount: number;
    totalDuration: number;
  };
}

export function BracketNotationDisplay({ notation, statistics }: BracketNotationDisplayProps) {
  const { toast } = useToast();

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(notation);
      toast({
        title: "Copied to clipboard",
        description: "Bracket notation has been copied successfully",
      });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const downloadAsText = () => {
    const blob = new Blob([notation], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, 'bracket-notation.txt');
  };

  const downloadAsJson = () => {
    const data = {
      bracketNotation: notation,
      statistics,
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    saveAs(blob, 'bracket-notation.json');
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Bracket Notation Output</h3>
        {notation && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyToClipboard}>
              <Copy className="h-4 w-4" />
              Copy
            </Button>
            <Button variant="outline" size="sm" onClick={downloadAsText}>
              <FileText className="h-4 w-4" />
              Text
            </Button>
            <Button variant="outline" size="sm" onClick={downloadAsJson}>
              <Download className="h-4 w-4" />
              JSON
            </Button>
          </div>
        )}
      </div>

      {!notation ? (
        <div className="text-center py-8 text-muted-foreground">
          Upload a MIDI file to generate bracket notation
        </div>
      ) : (
        <div className="space-y-4">
          {/* Notation display */}
          <div className="bg-muted p-4 rounded-lg border">
            <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">
              {notation}
            </pre>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-background rounded border">
              <div className="text-2xl font-bold text-primary">{statistics.noteCount}</div>
              <div className="text-sm text-muted-foreground">Notes</div>
            </div>
            <div className="text-center p-3 bg-background rounded border">
              <div className="text-2xl font-bold text-accent">{statistics.restCount}</div>
              <div className="text-sm text-muted-foreground">Rests</div>
            </div>
            <div className="text-center p-3 bg-background rounded border">
              <div className="text-2xl font-bold text-secondary">{statistics.totalDuration.toFixed(2)}</div>
              <div className="text-sm text-muted-foreground">Duration (beats)</div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}