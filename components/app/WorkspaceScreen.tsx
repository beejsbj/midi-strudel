import React, { Suspense } from 'react';
import { Loader2, Menu } from 'lucide-react';
import { AppErrorBanner } from './AppErrorBanner';
import { Sidebar } from '../Sidebar';
import { LazyCodeViewer } from '../codeViewer/LazyCodeViewer';
import { StrudelConfig, Track } from '../../types';

interface Props {
  code: string;
  config: StrudelConfig;
  error: string | null;
  isMobileSidebarOpen: boolean;
  onCloseMobileSidebar: () => void;
  onDismissError: () => void;
  onOpenMobileSidebar: () => void;
  onClear: () => void;
  onUpload: () => void;
  setConfig: React.Dispatch<React.SetStateAction<StrudelConfig>>;
  setTracks: React.Dispatch<React.SetStateAction<Track[]>>;
  tracks: Track[];
}

export const WorkspaceScreen: React.FC<Props> = ({
  code,
  config,
  error,
  isMobileSidebarOpen,
  onClear,
  onCloseMobileSidebar,
  onDismissError,
  onOpenMobileSidebar,
  onUpload,
  setConfig,
  setTracks,
  tracks,
}) => (
  <>
    <Sidebar
      config={config}
      setConfig={setConfig}
      tracks={tracks}
      setTracks={setTracks}
      onClear={onClear}
      onUpload={onUpload}
      isMobileOpen={isMobileSidebarOpen}
      onCloseMobile={onCloseMobileSidebar}
    />

    <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      {error && <AppErrorBanner error={error} onDismiss={onDismissError} />}

      <div className="flex items-center justify-between border-b border-[rgba(245,158,11,0.14)] bg-noir-900/95 px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1.5 text-xs font-display font-medium uppercase tracking-[0.22em] text-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
        >
          <Menu size={14} />
          Controls
        </button>
        <span className="max-w-[58vw] truncate text-right font-display text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
          {config.fileName ?? 'Loaded MIDI'}
        </span>
      </div>

      <div className="flex h-full flex-col p-4 lg:p-6">
        <div className="min-h-0 flex-1">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center rounded-lg border border-[rgba(245,158,11,0.16)] bg-noir-800 text-zinc-400">
                <div className="flex items-center gap-2 font-display text-sm font-medium uppercase tracking-[0.14em]">
                  <Loader2 size={16} className="animate-spin text-gold-500" />
                  <span>Loading editor...</span>
                </div>
              </div>
            }
          >
            <LazyCodeViewer
              code={code}
              durationTagStyle={config.durationTagStyle}
              isNoteColoringEnabled={config.isNoteColoringEnabled}
              isProgressiveFillEnabled={config.isProgressiveFillEnabled}
              isPatternTextColoringEnabled={config.isPatternTextColoringEnabled}
            />
          </Suspense>
        </div>
      </div>
    </main>
  </>
);
