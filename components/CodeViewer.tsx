import React, { useState } from 'react';
import { CodeViewerAlerts } from './codeViewer/CodeViewerAlerts';
import { CodeViewerToolbar } from './codeViewer/CodeViewerToolbar';
import { useStrudelEditor } from './codeViewer/useStrudelEditor';

interface Props {
  code: string;
  durationTagStyle?: string;
  isNoteColoringEnabled?: boolean;
  isProgressiveFillEnabled?: boolean;
  isPatternTextColoringEnabled?: boolean;
  showCopyButton?: boolean;
  showOpenExternalButton?: boolean;
  playerLabel?: string;
}

export const CodeViewer: React.FC<Props> = ({
  code,
  durationTagStyle,
  isNoteColoringEnabled,
  isProgressiveFillEnabled,
  isPatternTextColoringEnabled,
  showCopyButton = true,
  showOpenExternalButton = true,
  playerLabel = 'Strudel Player',
}) => {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const {
    audioError,
    editorContainerRef,
    getEditorContent,
    isLoading,
    isPlaying,
    isReady,
    strudelError,
    togglePlay,
  } = useStrudelEditor({
    code,
    durationTagStyle,
    isNoteColoringEnabled,
    isProgressiveFillEnabled,
    isPatternTextColoringEnabled,
  });

  const handleCopy = async () => {
    const currentCode = getEditorContent() || code;
    setCopyError(false);

    try {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
      window.setTimeout(() => setCopyError(false), 2000);

      try {
        const selection = window.getSelection();
        if (selection && editorContainerRef.current) {
          const range = document.createRange();
          range.selectNodeContents(editorContainerRef.current);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } catch {
        // Selection fallback also unavailable.
      }
    }
  };

  const handleOpenStrudel = () => {
    const currentCode = getEditorContent() || code;

    try {
      const encoded = btoa(unescape(encodeURIComponent(currentCode)));
      window.open(`https://strudel.cc/#${encoded}`, '_blank');
    } catch (err) {
      console.error('Failed to encode code for Strudel URL:', err);
      window.open('https://strudel.cc/', '_blank');
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[8px] border border-[rgba(245,158,11,0.18)] bg-[linear-gradient(180deg,rgba(20,20,20,0.98),rgba(10,10,10,1))] shadow-[0_28px_90px_rgba(0,0,0,0.34)]">
      <CodeViewerToolbar
        audioError={audioError}
        copied={copied}
        copyError={copyError}
        isLoading={isLoading}
        isPlaying={isPlaying}
        isReady={isReady}
        onCopy={() => void handleCopy()}
        onOpenStrudel={handleOpenStrudel}
        onTogglePlay={togglePlay}
        playerLabel={playerLabel}
        showCopyButton={showCopyButton}
        showOpenExternalButton={showOpenExternalButton}
      />

      <CodeViewerAlerts audioError={audioError} strudelError={strudelError} />

      <div className="group relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.06),transparent_30%),linear-gradient(180deg,rgba(9,9,9,0.98),rgba(6,6,6,1))]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-gold-500/5 to-transparent" />
        <div
          ref={editorContainerRef}
          className="h-full w-full text-sm"
          data-duration-style={durationTagStyle ?? 'sup'}
        />
      </div>
    </div>
  );
};
