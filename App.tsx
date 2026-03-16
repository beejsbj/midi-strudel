import React, { useState } from 'react';
import { AppErrorBanner } from './components/app/AppErrorBanner';
import { AppErrorBoundary } from './components/app/AppErrorBoundary';
import { EmptyStateScreen } from './components/app/EmptyStateScreen';
import { EXAMPLE_MIDIS } from './components/app/examples';
import { WorkspaceScreen } from './components/app/WorkspaceScreen';
import { useProjectState } from './hooks/useProjectState';

const App: React.FC = () => {
  const {
    activeExampleId,
    clearProject,
    code,
    config,
    error,
    fileInputRef,
    handleExampleLoad,
    handleFileInputChange,
    handleFileLoaded,
    isProcessing,
    setConfig,
    setError,
    setTracks,
    tracks,
    triggerFileUpload,
  } = useProjectState({ examples: EXAMPLE_MIDIS });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-noir-900 font-sans text-gray-200">
      {tracks.length === 0 ? (
        <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          {error && <AppErrorBanner error={error} onDismiss={() => setError(null)} />}
          <EmptyStateScreen
            activeExampleId={activeExampleId}
            config={config}
            isProcessing={isProcessing}
            onExampleLoad={(exampleId) => void handleExampleLoad(exampleId)}
            onFileLoaded={handleFileLoaded}
          />
        </main>
      ) : (
        <WorkspaceScreen
          code={code}
          config={config}
          error={error}
          isMobileSidebarOpen={isMobileSidebarOpen}
          onClear={() => {
            setIsMobileSidebarOpen(false);
            clearProject();
          }}
          onCloseMobileSidebar={() => setIsMobileSidebarOpen(false)}
          onDismissError={() => setError(null)}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onUpload={triggerFileUpload}
          setConfig={setConfig}
          setTracks={setTracks}
          tracks={tracks}
        />
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept=".mid,.midi"
        className="hidden"
      />
    </div>
  );
};

const AppWithBoundary: React.FC = () => (
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);

export default AppWithBoundary;
