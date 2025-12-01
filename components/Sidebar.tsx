import React from 'react';
import { StrudelConfig, Track, KeySignature } from '../types';
import { Upload, Trash2 } from 'lucide-react';
import { SectionDivider } from './sidebar/SidebarShared';
import { PlaybackSettings } from './sidebar/PlaybackSettings';
import { FormatSettings } from './sidebar/FormatSettings';
import { QuantizationSettings } from './sidebar/QuantizationSettings';
import { GeneralOptions } from './sidebar/GeneralOptions';
import { TrackList } from './sidebar/TrackList';

interface Props {
  config: StrudelConfig;
  tracks: Track[];
  keySignature?: KeySignature;
  setConfig: React.Dispatch<React.SetStateAction<StrudelConfig>>;
  setTracks: React.Dispatch<React.SetStateAction<Track[]>>;
  onClear: () => void;
  onUpload: () => void;
}

export const Sidebar: React.FC<Props> = ({ config, setConfig, tracks, setTracks, keySignature, onClear, onUpload }) => {
  return (
    <aside className="w-80 bg-noir-900 border-r border-zinc-800 flex flex-col h-full overflow-hidden shrink-0 z-20 shadow-xl">
      <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-noir-900">
        <div>
            <h1 className="text-xl font-bold text-white tracking-tight font-mono">
            <span className="text-gold-500">STRUDEL</span>
            </h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Converter</p>
        </div>
        
        <div className="flex items-center space-x-2">
             <button 
                onClick={onUpload}
                className="p-2 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 rounded-md transition-colors border border-yellow-500/30"
                title="Upload New File (Overwrite)"
            >
                <Upload size={16} />
             </button>
             <button 
                onClick={onClear}
                className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-md transition-colors border border-red-500/30"
                title="Clear Project"
            >
                <Trash2 size={16} />
             </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tracks.length > 0 && (
            <PlaybackSettings config={config} setConfig={setConfig} />
        )}

        <SectionDivider />

        <FormatSettings config={config} setConfig={setConfig} />

        <SectionDivider />

        <QuantizationSettings config={config} setConfig={setConfig} />
        
        <SectionDivider />

        <GeneralOptions config={config} setConfig={setConfig} />

        <SectionDivider />

        <TrackList 
            config={config} 
            setConfig={setConfig} 
            tracks={tracks} 
            setTracks={setTracks} 
        />
      </div>
    </aside>
  );
};