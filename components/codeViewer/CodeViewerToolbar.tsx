import React from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Play,
  Square,
} from 'lucide-react';

interface Props {
  audioError: string | null;
  copied: boolean;
  copyError: boolean;
  isLoading: boolean;
  isPlaying: boolean;
  isReady: boolean;
  onCopy: () => void;
  onOpenStrudel: () => void;
  onTogglePlay: () => void;
  playerLabel: string;
  showCopyButton: boolean;
  showOpenExternalButton: boolean;
}

export const CodeViewerToolbar: React.FC<Props> = ({
  audioError,
  copied,
  copyError,
  isLoading,
  isPlaying,
  isReady,
  onCopy,
  onOpenStrudel,
  onTogglePlay,
  playerLabel,
  showCopyButton,
  showOpenExternalButton,
}) => (
  <div className="border-b border-[rgba(245,158,11,0.16)] bg-[linear-gradient(180deg,rgba(28,28,28,0.96),rgba(16,16,16,0.98))] px-4 py-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-display text-[10px] font-medium uppercase tracking-[0.26em] text-gold-500/70">
          strudel editor
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-zinc-100">{playerLabel}</span>
          {isLoading ? (
            <span className="inline-flex animate-pulse items-center gap-1 rounded-sm border border-[rgba(245,158,11,0.22)] bg-gold-500/10 px-2 py-0.5 text-[11px] text-gold-300">
              <Loader2 size={11} className="animate-spin" />
              Loading engine
            </span>
          ) : audioError ? (
            <span className="inline-flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300">
              <AlertTriangle size={11} />
              Audio error
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Ready
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onTogglePlay}
          disabled={!isReady}
          aria-label={isPlaying ? 'Stop playback' : 'Start playback'}
          className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.18em] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 ${
            isPlaying
              ? 'border-red-500/50 bg-red-500/12 text-red-300 hover:bg-red-500/18 focus-visible:outline-red-500'
              : 'border-emerald-500/50 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/18 focus-visible:outline-emerald-500'
          } ${!isReady ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          {isPlaying ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
          <span>{isPlaying ? 'Stop' : 'Play'}</span>
        </button>

        {showCopyButton && (
          <button
            onClick={onCopy}
            aria-label={copyError ? 'Copy failed — text selected' : copied ? 'Copied!' : 'Copy to clipboard'}
            className={`inline-flex items-center justify-center rounded-sm border px-2.5 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-500 ${
              copyError
                ? 'border-red-500/40 bg-red-500/10 text-red-300'
                : 'border-[rgba(245,158,11,0.18)] bg-zinc-900/80 text-zinc-400 hover:border-[rgba(245,158,11,0.34)] hover:text-gold-300'
            }`}
            title={copyError ? 'Copy failed' : 'Copy to clipboard'}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}

        {showOpenExternalButton && (
          <button
            onClick={onOpenStrudel}
            aria-label="Open in Strudel editor"
            className="inline-flex items-center gap-1 rounded-sm border border-[rgba(245,158,11,0.28)] bg-gold-500/12 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.16em] text-gold-200 transition-all hover:bg-gold-500/18 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-400"
          >
            <span>Open in Strudel</span>
            <ExternalLink size={12} />
          </button>
        )}
      </div>
    </div>
  </div>
);
