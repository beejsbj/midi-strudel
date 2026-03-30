import React, { useCallback, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
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

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
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
      className={`group flex min-h-[174px] cursor-pointer flex-col items-center justify-center rounded-[4px] border-[1.5px] border-dashed px-5 py-[30px] text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c8922a] ${
        isDragOver
          ? 'border-[#c8922a] bg-[rgba(200,146,42,0.08)]'
          : typeError
          ? 'border-red-500/70 bg-red-500/5'
          : 'border-[rgba(200,146,42,0.5)] bg-transparent hover:border-[#c8922a] hover:bg-[rgba(200,146,42,0.08)]'
      }`}
    >
      <UploadCloud
        className={`mb-[10px] transition-colors ${isDragOver ? 'text-[#c8922a]' : 'text-[#7a5c1a]'}`}
        size={32}
        strokeWidth={1.4}
      />

      {typeError ? (
        <>
          <p className="mb-1 font-display text-sm font-bold text-red-400">
            this needs a `.mid` or `.midi` file
          </p>
          <p className="font-mono text-[10px] tracking-[0.04em] text-[#565450]">
            only MIDI files are supported here
          </p>
        </>
      ) : (
        <>
          <p className="mb-[3px] font-display text-[14px] font-bold text-[#ddd9c8]">
            {isDragOver ? 'Drop a .mid file here' : 'Drop a .mid file here'}
          </p>
          <p className="font-mono text-[10px] tracking-[0.04em] text-[#565450]">
            or click / press Enter to browse
          </p>
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
