import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  audioError: string | null;
  strudelError: string | null;
}

export const CodeViewerAlerts: React.FC<Props> = ({ audioError, strudelError }) => (
  <>
    {audioError && (
      <div
        role="alert"
        className="flex items-center space-x-2 border-b border-red-800/50 bg-red-900/40 px-4 py-2 text-xs text-red-300"
      >
        <AlertTriangle size={12} />
        <span>{audioError}</span>
      </div>
    )}

    {strudelError && (
      <div
        role="alert"
        className="flex items-center space-x-2 border-b border-red-800/50 bg-red-900/40 px-4 py-2 font-mono text-xs text-red-300"
      >
        <AlertTriangle size={12} className="shrink-0" />
        <span className="truncate">{strudelError}</span>
      </div>
    )}
  </>
);
