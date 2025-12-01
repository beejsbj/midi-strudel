import React, { useCallback } from 'react';
import { UploadCloud } from 'lucide-react';

interface Props {
  onFileLoaded: (file: File) => void;
}

export const DropZone: React.FC<Props> = ({ onFileLoaded }) => {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onFileLoaded(file);
  }, [onFileLoaded]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileLoaded(file);
  };

  return (
    <div 
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="border-2 border-dashed border-zinc-800 hover:border-gold-500/50 rounded-xl bg-noir-800/50 flex flex-col items-center justify-center p-8 transition-all cursor-pointer group h-48"
    >
      <div className="bg-noir-900 p-3 rounded-full mb-4 border border-zinc-800 group-hover:scale-110 transition-transform">
        <UploadCloud className="text-zinc-400 group-hover:text-gold-500" size={24} />
      </div>
      <p className="text-zinc-300 font-medium text-sm mb-1">Drop MIDI file here</p>
      <p className="text-zinc-600 text-xs">or click to browse</p>
      <input 
        type="file" 
        accept=".mid,.midi" 
        className="absolute inset-0 opacity-0 cursor-pointer" 
        onChange={handleChange}
      />
    </div>
  );
};