import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Upload, Music, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MidiUploadProps {
  onFileUpload: (file: File) => Promise<void>;
  isProcessing: boolean;
}

export function MidiUpload({ onFileUpload, isProcessing }: MidiUploadProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setUploadError(null);
    
    const file = acceptedFiles[0];
    if (!file) return;

    // Validate file type
    const validExtensions = ['.mid', '.midi'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!validExtensions.includes(fileExtension)) {
      setUploadError('Please upload a valid MIDI file (.mid or .midi)');
      return;
    }

    try {
      await onFileUpload(file);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to process MIDI file');
    }
  }, [onFileUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/midi': ['.mid', '.midi'],
      'audio/x-midi': ['.mid', '.midi']
    },
    maxFiles: 1,
    disabled: isProcessing
  });

  return (
    <Card className="p-8">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-smooth",
          "hover:border-accent hover:bg-accent/5",
          isDragActive && "border-accent bg-accent/10",
          isProcessing && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center gap-4">
          {isProcessing ? (
            <>
              <div className="animate-spin">
                <Music className="h-12 w-12 text-accent" />
              </div>
              <p className="text-lg font-medium">Processing MIDI file...</p>
              <p className="text-muted-foreground">Converting to bracket notation</p>
            </>
          ) : (
            <>
              <Upload className="h-12 w-12 text-muted-foreground" />
              <div>
                <p className="text-lg font-medium mb-2">
                  {isDragActive ? 'Drop your MIDI file here' : 'Upload MIDI File'}
                </p>
                <p className="text-muted-foreground">
                  Drag & drop a MIDI file, or click to browse
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Supports .mid and .midi files
                </p>
              </div>
              <Button variant="musical" size="lg">
                Choose File
              </Button>
            </>
          )}
        </div>
      </div>
      
      {uploadError && (
        <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-md">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">{uploadError}</span>
          </div>
        </div>
      )}
    </Card>
  );
}