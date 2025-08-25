import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { cn } from '@/lib/utils';
import { Upload, Music } from 'lucide-react';

interface GlobalDragZoneProps {
  onFileUpload: (file: File) => Promise<void>;
  isProcessing: boolean;
  children: React.ReactNode;
}

export function GlobalDragZone({ onFileUpload, isProcessing, children }: GlobalDragZoneProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setUploadError(null);
    
    const file = acceptedFiles[0];
    if (!file) return;

    // Validate file type
    const validExtensions = ['.mid', '.midi', '.mid.rtx'];
    const fileName = file.name.toLowerCase();
    const isValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
    
    if (!isValidExtension) {
      setUploadError('Please upload a valid MIDI file (.mid, .midi, or .mid.rtx)');
      return;
    }

    try {
      await onFileUpload(file);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to process MIDI file');
    }
  }, [onFileUpload]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'audio/midi': ['.mid', '.midi', '.mid.rtx'],
      'audio/x-midi': ['.mid', '.midi', '.mid.rtx']
    },
    maxFiles: 1,
    disabled: isProcessing,
    noClick: true, // Prevent click events from bubbling to the global zone
    noKeyboard: true
  });

  return (
    <div {...getRootProps()} className="min-h-screen relative">
      <input {...getInputProps()} />
      
      {/* Drag overlay */}
      {isDragActive && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className={cn(
            "bg-card border-2 border-dashed rounded-xl p-12 text-center transition-all",
            isDragReject ? "border-destructive bg-destructive/10" : "border-accent bg-accent/10"
          )}>
            <div className="flex flex-col items-center gap-4">
              {isProcessing ? (
                <>
                  <div className="animate-spin">
                    <Music className="h-16 w-16 text-accent" />
                  </div>
                  <p className="text-xl font-medium">Processing MIDI file...</p>
                </>
              ) : isDragReject ? (
                <>
                  <Upload className="h-16 w-16 text-destructive" />
                  <p className="text-xl font-medium text-destructive">Invalid file type</p>
                  <p className="text-muted-foreground">Please drop a valid MIDI file (.mid, .midi, .mid.rtx)</p>
                </>
              ) : (
                <>
                  <Upload className="h-16 w-16 text-accent" />
                  <p className="text-xl font-medium">Drop MIDI file to upload</p>
                  <p className="text-muted-foreground">Release to process the file</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error toast */}
      {uploadError && (
        <div className="fixed top-4 right-4 z-50 bg-destructive/10 border border-destructive/20 rounded-md p-4 max-w-sm">
          <p className="text-destructive text-sm font-medium">{uploadError}</p>
        </div>
      )}

      {children}
    </div>
  );
}
