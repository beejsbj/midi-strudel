import React, { useState } from 'react';
import { StrudelConfig, Track } from '../types';
import { Upload, Trash2, Check, X } from 'lucide-react';
import { PlaybackSettings } from './sidebar/PlaybackSettings';
import { FormatSettings } from './sidebar/FormatSettings';
import { QuantizationSettings } from './sidebar/QuantizationSettings';
import { GeneralOptions } from './sidebar/GeneralOptions';
import { VisualsSection } from './sidebar/VisualsSection';
import { TrackList } from './sidebar/TrackList';

type SidebarSectionId = 'playback' | 'format' | 'quantization' | 'options' | 'visuals' | 'tracks';

const SIDEBAR_COLLAPSE_STORAGE_KEY = 'midi-strudel-sidebar-collapsed';

function loadCollapsedSections(): Record<SidebarSectionId, boolean> {
  const fallback: Record<SidebarSectionId, boolean> = {
    playback: false,
    format: false,
    quantization: false,
    options: false,
    visuals: false,
    tracks: false,
  };

  try {
    const raw = localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<Record<SidebarSectionId, boolean>>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

interface Props {
  config: StrudelConfig;
  tracks: Track[];
  setConfig: React.Dispatch<React.SetStateAction<StrudelConfig>>;
  setTracks: React.Dispatch<React.SetStateAction<Track[]>>;
  onClear: () => void;
  onUpload: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<Props> = ({
  config,
  setConfig,
  tracks,
  setTracks,
  onClear,
  onUpload,
  isMobileOpen,
  onCloseMobile,
}) => {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<SidebarSectionId, boolean>>(() => loadCollapsedSections());

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

  const toggleSection = (sectionId: SidebarSectionId) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [sectionId]: !prev[sectionId] };
      try {
        localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  return (
    <>
    <div
      className={`fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden ${
        isMobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
      onClick={onCloseMobile}
      aria-hidden="true"
    />
    <aside className={`fixed inset-y-0 left-0 z-40 flex h-full w-[min(88vw,20rem)] flex-col overflow-hidden border-r border-[rgba(245,158,11,0.12)] bg-noir-900 shadow-xl transition-transform duration-200 ease-out lg:static lg:z-20 lg:w-80 lg:shrink-0 lg:translate-x-0 ${
      isMobileOpen ? 'translate-x-0' : '-translate-x-full'
    }`}>
      <div className="flex items-center justify-between border-b border-[rgba(245,158,11,0.12)] bg-noir-900 px-4 py-4">
        <div>
            <h1 className="font-display text-xl font-semibold uppercase tracking-[0.18em] text-white">
            <span className="text-gold-500">STRUDEL</span>
            </h1>
            <p className="font-display text-[10px] font-medium uppercase tracking-[0.26em] text-zinc-500">Converter</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onCloseMobile}
            aria-label="Close sidebar"
            className="p-2 text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500 lg:hidden"
          >
            <X size={16} />
          </button>
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
                className="rounded-sm p-1 text-zinc-400 transition-colors hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
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
                className="rounded-sm border border-yellow-500/30 bg-yellow-500/10 p-2 text-yellow-500 transition-colors hover:bg-yellow-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-400"
                title="Upload New File (Overwrite)"
              >
                <Upload size={16} />
              </button>
              <button
                onClick={handleClearClick}
                aria-label="Clear project"
                className="rounded-sm border border-red-500/30 bg-red-500/10 p-2 text-red-500 transition-colors hover:bg-red-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
                title="Clear Project"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-2">
        {tracks.length > 0 && (
            <PlaybackSettings
              config={config}
              setConfig={setConfig}
              isCollapsed={collapsedSections.playback}
              onToggleCollapse={() => toggleSection('playback')}
            />
        )}

        <FormatSettings
          config={config}
          setConfig={setConfig}
          isCollapsed={collapsedSections.format}
          onToggleCollapse={() => toggleSection('format')}
        />

        <QuantizationSettings
          config={config}
          setConfig={setConfig}
          isCollapsed={collapsedSections.quantization}
          onToggleCollapse={() => toggleSection('quantization')}
        />

        <GeneralOptions
          config={config}
          setConfig={setConfig}
          isCollapsed={collapsedSections.options}
          onToggleCollapse={() => toggleSection('options')}
        />

        <VisualsSection
          config={config}
          setConfig={setConfig}
          isCollapsed={collapsedSections.visuals}
          onToggleCollapse={() => toggleSection('visuals')}
        />

        <TrackList
          config={config}
          setConfig={setConfig}
          tracks={tracks}
          setTracks={setTracks}
          isCollapsed={collapsedSections.tracks}
          onToggleCollapse={() => toggleSection('tracks')}
        />
      </div>
    </aside>
    </>
  );
};
