import React from 'react';

interface Props {
  error: string;
  onDismiss: () => void;
}

export const AppErrorBanner: React.FC<Props> = ({ error, onDismiss }) => (
  <div
    role="alert"
    className="flex items-center justify-between border-b border-red-700/50 bg-red-900/60 px-4 py-2 text-sm text-red-300"
  >
    <span>{error}</span>
    <button
      onClick={onDismiss}
      aria-label="Dismiss error"
      className="ml-4 rounded text-red-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
    >
      ✕
    </button>
  </div>
);
