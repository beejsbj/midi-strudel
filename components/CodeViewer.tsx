import React, { useState, useEffect, useRef } from 'react';
import { Copy, ExternalLink, Check, Play, Square, Loader2 } from 'lucide-react';
import { StrudelMirror } from '@strudel/codemirror';
import * as StrudelCore from '@strudel/core';
import { initAudioOnFirstClick, getAudioContext, webaudioOutput, registerSynthSounds } from '@strudel/webaudio';
import { transpiler } from '@strudel/transpiler';
import { registerSoundfonts } from "@strudel/soundfonts";

interface Props {
  code: string;
}

const DATA_SOURCES_BASE = "https://raw.githubusercontent.com/felixroos/dough-samples/main/";
const SAMPLE_JSON_FILES = [
  "tidal-drum-machines.json",
  "piano.json",
  "Dirt-Samples.json",
  "EmuSP12.json",
  "vcsl.json",
  "mridangam.json",
];

export const CodeViewer: React.FC<Props> = ({ code }) => {
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);

  // Helper to safely access code from the editor instance
  const getEditorContent = () => {
    if (!editorRef.current) return '';
    if (typeof editorRef.current.getCode === 'function') {
      return editorRef.current.getCode();
    }
    // Fallback for CodeMirror 6 view access
    if (editorRef.current.view?.state?.doc) {
      return editorRef.current.view.state.doc.toString();
    }
    return '';
  };

  // Helper to safely set code on the editor instance
  const setEditorContent = (newCode: string) => {
    if (!editorRef.current) return;
    
    const current = getEditorContent();
    if (current === newCode) return;

    if (typeof editorRef.current.setCode === 'function') {
        editorRef.current.setCode(newCode);
        return;
    }

    // CM6 Fallback
    if (editorRef.current.view) {
        editorRef.current.view.dispatch({
            changes: {from: 0, to: current.length, insert: newCode}
        });
    }
  };

  useEffect(() => {
    if (!editorContainerRef.current) return;
    if (editorRef.current) return; 

    const initStrudel = async () => {
      try {
        const editor = new StrudelMirror({
          defaultOutput: webaudioOutput,
          getTime: () => getAudioContext().currentTime,
          transpiler,
          root: editorContainerRef.current!,
          initialCode: code || "// Waiting for MIDI...",
          onCode: (newCode: string) => {
            // Optional: can sync back to parent if needed
          },
          onError: (error: unknown) => {
            console.error("Strudel error:", error);
          },
          prebake: async () => {
            try {
              initAudioOnFirstClick(); 
              
              const loadModules = StrudelCore.evalScope(
                import('@strudel/core'),
                import('@strudel/draw'),
                import('@strudel/mini'),
                import('@strudel/tonal'),
                import('@strudel/webaudio'),
              );

              const promises = [loadModules, registerSynthSounds(), registerSoundfonts()];

              if (typeof StrudelCore.samples === 'function') {
                  for (const file of SAMPLE_JSON_FILES) {
                      promises.push(StrudelCore.samples(`${DATA_SOURCES_BASE}${file}`));
                  }
              }
              
              await Promise.all(promises);
              setIsReady(true);
              setIsLoading(false);
            } catch (e) {
              console.error("Prebake error:", e);
              setIsLoading(false);
            }
          },
        });

        if (editor.updateSettings) {
          editor.updateSettings({
              fontSize: 13,
              fontFamily: "JetBrains Mono, monospace",
              theme: "dark",
              isLineNumbersDisplayed: true,
              isActiveLineHighlighted: true,
              isBracketMatchingEnabled: true,
              isLineWrappingEnabled: true,
          isBracketClosingEnabled: true,
          isAutoCompletionEnabled: true,
          isPatternHighlightingEnabled: true,
          isFlashEnabled: true,
          isTooltipEnabled: true,
          isTabIndentationEnabled: true,
          isMultiCursorEnabled: true,
          });
        }

        editorRef.current = editor;
      } catch (err) {
        console.error("Failed to init Strudel", err);
        setIsLoading(false);
      }
    };

    initStrudel();

    return () => {
       if (editorRef.current) {
           try {
             if (typeof editorRef.current.stop === 'function') {
                 editorRef.current.stop();
             }
             if (typeof editorRef.current.destroy === 'function') {
                 editorRef.current.destroy();
             }
           } catch(e) { console.error("Error destroying editor", e) }
           editorRef.current = null;
       }
    };
  }, []); 

  // Sync code prop updates to editor
  useEffect(() => {
    if (editorRef.current && code) {
        setEditorContent(code);
    }
  }, [code]);

  const handleCopy = () => {
    const currentCode = getEditorContent() || code;
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenStrudel = () => {
    const currentCode = getEditorContent() || code;
    const encoded = btoa(currentCode);
    const url = `https://strudel.cc/#${encoded}`;
    window.open(url, "_blank");
  };

  const togglePlay = () => {
      if (!editorRef.current) return;
      
      try {
        if (isPlaying) {
            if (typeof editorRef.current.stop === 'function') {
                editorRef.current.stop();
            }
            setIsPlaying(false);
        } else {
            if (typeof editorRef.current.evaluate === 'function') {
                editorRef.current.evaluate();
            }
            setIsPlaying(true);
        }
      } catch (err) {
        console.error("Playback error:", err);
        setIsPlaying(false);
      }
  };

  return (
    <div className="flex flex-col h-full bg-noir-800 border border-zinc-800 rounded-lg overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-4 py-2 bg-noir-900 border-b border-zinc-800">
        <div className="flex space-x-2 items-center">
          <div className="flex space-x-1.5 mr-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
          </div>
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest hidden sm:block">Strudel Player</span>
          
          {isLoading ? (
             <span className="flex items-center space-x-1 text-xs text-gold-500 animate-pulse ml-2">
                <Loader2 size={12} className="animate-spin" />
                <span>Loading Engine...</span>
             </span>
          ) : (
             <span className="text-xs text-green-500/80 ml-2">Ready</span>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
            <button 
                onClick={togglePlay}
                disabled={!isReady}
                className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold uppercase rounded transition-all shadow-lg ${
                    isPlaying 
                    ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/50' 
                    : 'bg-green-500/10 text-green-500 hover:bg-green-500/20 border border-green-500/50'
                } ${!isReady ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                {isPlaying ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                <span>{isPlaying ? 'Stop' : 'Play'}</span>
            </button>

            <div className="w-px h-4 bg-zinc-800 mx-1" />

            <button 
                onClick={handleCopy}
                className="p-1.5 text-zinc-400 hover:text-gold-400 transition-colors rounded hover:bg-white/5"
                title="Copy to clipboard"
            >
                {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <button 
                onClick={handleOpenStrudel}
                className="flex items-center space-x-1 px-3 py-1.5 bg-gold-600 text-white text-xs font-bold uppercase rounded hover:bg-gold-500 transition-all shadow-lg shadow-gold-600/20"
            >
                <span>Open External</span>
                <ExternalLink size={12} />
            </button>
        </div>
      </div>
      
      <div className="flex-1 relative bg-noir-900 overflow-hidden group">
        <div ref={editorContainerRef} className="h-full w-full text-sm" />
      </div>
    </div>
  );
};