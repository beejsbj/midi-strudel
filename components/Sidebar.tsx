import React, { useState } from 'react';
import { StrudelConfig, Track, KeySignature } from '../types';
import { Upload, Trash2, Check, X } from 'lucide-react';
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
  const [confirmingClear, setConfirmingClear] = useState(false);

  const handleClearClick = () => {
    setConfirmingClear(true);
  };

  const handleConfirmClear = () => {
    setConfirmingClear(false);
    onClear();
  };

  const handleCancelClear = () => {
    setConfirmingClear(false);
  };

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
          {confirmingClear ? (
            <div className="flex items-center space-x-1 bg-red-900/30 border border-red-700/50 rounded-md px-2 py-1">
              <span className="text-xs text-red-300 mr-1">Clear?</span>
              <button
                onClick={handleConfirmClear}
                aria-label="Confirm clear project"
                className="p-1 text-green-400 hover:text-green-300 transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-400"
                title="Yes, clear"
              >
                <Check size={13} />
              </button>
              <button
                onClick={handleCancelClear}
                aria-label="Cancel clear"
                className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-400"
                title="Cancel"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={onUpload}
                aria-label="Upload new MIDI file"
                className="p-2 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 rounded-md transition-colors border border-yellow-500/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-400"
                title="Upload New File (Overwrite)"
              >
                <Upload size={16} />
              </button>
              <button
                onClick={handleClearClick}
                aria-label="Clear project"
                className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-md transition-colors border border-red-500/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
                title="Clear Project"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
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
