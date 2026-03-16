import React, { useCallback, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

interface Props {
  onFileLoaded: (file: File) => void;
}

function isMidiFile(file: File): boolean {
  return (
    file.name.endsWith('.mid') ||
    file.name.endsWith('.midi') ||
    file.type === 'audio/midi' ||
    file.type === 'audio/x-midi'
  );
}

export const DropZone: React.FC<Props> = ({ onFileLoaded }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [typeError, setTypeError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Track drag enter/leave nesting to avoid flicker from child elements
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
    setTypeError(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!isMidiFile(file)) {
      setTypeError(true);
      setTimeout(() => setTypeError(false), 3000);
      return;
    }
    onFileLoaded(file);
  }, [onFileLoaded]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTypeError(false);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isMidiFile(file)) {
      setTypeError(true);
      setTimeout(() => setTypeError(false), 3000);
      return;
    }
    onFileLoaded(file);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload MIDI file"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-md flex flex-col items-center justify-center p-8 transition-all cursor-pointer group h-48 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 ${
        isDragOver
          ? 'border-gold-500 bg-gold-500/10'
          : typeError
          ? 'border-red-500/70 bg-red-500/5'
          : 'border-[rgba(245,158,11,0.14)] hover:border-gold-500/50 bg-noir-800/50'
      }`}
    >
      <div className={`bg-noir-900 p-3 rounded-full mb-4 border transition-transform ${
        isDragOver ? 'border-gold-500 scale-110' : 'border-[rgba(245,158,11,0.14)] group-hover:scale-110'
      }`}>
        <UploadCloud
          className={`transition-colors ${isDragOver ? 'text-gold-500' : 'text-zinc-400 group-hover:text-gold-500'}`}
          size={24}
        />
      </div>

      {typeError ? (
        <>
          <p className="text-red-400 font-medium text-sm mb-1">Please drop a .mid or .midi file</p>
          <p className="text-zinc-600 text-xs">Only MIDI files are supported</p>
        </>
      ) : (
        <>
          <p className="text-zinc-300 font-medium text-sm mb-1">
            {isDragOver ? 'Release to upload' : 'Drop MIDI file here'}
          </p>
          <p className="text-zinc-600 text-xs">or click / press Enter to browse</p>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".mid,.midi"
        className="sr-only"
        tabIndex={-1}
        onChange={handleChange}
        aria-hidden="true"
      />
    </div>
  );
};
