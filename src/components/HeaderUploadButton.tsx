import React, { useCallback, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Music, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeaderUploadButtonProps {
  onFileUpload: (file: File) => Promise<void>;
  isProcessing: boolean;
}

export function HeaderUploadButton({ onFileUpload, isProcessing }: HeaderUploadButtonProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    
    const file = event.target.files?.[0];
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
      // Reset the input so the same file can be selected again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to process MIDI file');
    }
  }, [onFileUpload]);

  const handleClick = () => {
    if (isProcessing) return;
    fileInputRef.current?.click();
  };

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi,.mid.rtx,audio/midi,audio/x-midi"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <Button
        onClick={handleClick}
        disabled={isProcessing}
        variant="musical"
        size="sm"
        className={cn(
          "gap-2 transition-all",
          isProcessing && "animate-pulse"
        )}
      >
        {isProcessing ? (
          <>
            <div className="animate-spin">
              <Music className="h-4 w-4" />
            </div>
            Processing...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Upload MIDI
          </>
        )}
      </Button>

      {/* Error tooltip */}
      {uploadError && (
        <div className="absolute top-full right-0 mt-2 bg-destructive/10 border border-destructive/20 rounded-md p-3 max-w-sm z-50">
          <div className="flex items-start gap-2 text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span className="text-sm">{uploadError}</span>
          </div>
        </div>
      )}
    </div>
  );
}
