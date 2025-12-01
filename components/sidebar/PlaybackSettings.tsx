import React from 'react';
import { Activity, RotateCcw } from 'lucide-react';
import { StrudelConfig, KeySignature } from '../../types';
import { PITCH_CLASSES } from '../../constants';
import { SectionHeader } from './SidebarShared';

interface Props {
  config: StrudelConfig;
  setConfig: React.Dispatch<React.SetStateAction<StrudelConfig>>;
}

export const PlaybackSettings: React.FC<Props> = ({ config, setConfig }) => {
  const updateConfig = <K extends keyof StrudelConfig>(key: K, value: StrudelConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const updatePlaybackKey = (field: keyof KeySignature, value: any) => {
      if (!config.playbackKey) return;
      updateConfig('playbackKey', { ...config.playbackKey, [field]: value });
  };
  
  const updateTimeSig = (field: 'numerator' | 'denominator', value: number) => {
      updateConfig('timeSignature', { ...config.timeSignature, [field]: value });
  };

  return (
    <div className="space-y-4">
        <SectionHeader 
            icon={<Activity size={14} />} 
            title="Playback Settings" 
        />
        
        {/* Combined Tempo & Time Sig */}
        <div className="grid grid-cols-3 gap-2">
            {/* BPM Card */}
            <div className="col-span-2 bg-noir-800 p-3 rounded-lg border border-zinc-800/50 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">Tempo</span>
                    <span className="text-zinc-600 text-[9px] bg-noir-900 px-1 py-0.5 rounded border border-zinc-800">
                        Orig: {config.sourceBpm}
                    </span>
                </div>
                
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-baseline space-x-1">
                            <span className="text-2xl font-bold text-white tracking-tighter">{config.bpm}</span>
                            <span className="text-zinc-600 text-[10px] font-bold uppercase">BPM</span>
                        </div>
                        {config.bpm !== config.sourceBpm && (
                            <button 
                                onClick={() => updateConfig('bpm', config.sourceBpm)}
                                className="text-gold-500 hover:text-white p-1 rounded transition-colors"
                                title="Reset to Source BPM"
                            >
                                <RotateCcw size={12} />
                            </button>
                        )}
                    </div>
                    
                    <input 
                        type="range" min="20" max="300" 
                        value={config.bpm}
                        onChange={(e) => updateConfig('bpm', parseInt(e.target.value))}
                        className="w-full accent-gold-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>

            {/* Time Sig Card */}
            <div className="col-span-1 bg-noir-800 p-2 rounded-lg border border-zinc-800/50 flex flex-col items-center text-center relative">
            <span className="text-zinc-600 text-[9px] bg-noir-900 px-1 py-0.5 rounded border border-zinc-800 whitespace-nowrap">
                        Orig: {config.sourceTimeSignature?.numerator}/{config.sourceTimeSignature?.denominator}
                    </span>
                <div className="flex w-full justify-between items-start mb-1">
                        <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">Meter</span>
                        
                </div>
                
                <div className="flex flex-col items-center w-full max-w-[60px] relative mt-1">
                        {(config.timeSignature.numerator !== config.sourceTimeSignature?.numerator) && (
                        <button 
                            onClick={() => updateConfig('timeSignature', config.sourceTimeSignature!)}
                            className="absolute -right-6 top-1 text-gold-500 hover:text-white p-1 rounded transition-colors"
                            title="Reset"
                        >
                            <RotateCcw size={10} />
                        </button>
                    )}
                    <div className="flex items-baseline justify-center w-full mb-0.5">
                            <input 
                            type="number" 
                            value={config.timeSignature.numerator}
                            onChange={(e) => updateTimeSig('numerator', parseInt(e.target.value))}
                            className="bg-transparent text-xl font-bold text-white outline-none w-8 text-right p-0"
                        />
                        <span className="text-zinc-500 text-[9px] font-bold uppercase ml-1 translate-y-[1px]">Beats</span>
                    </div>
                    <div className="w-full h-px bg-zinc-700 my-0.5"></div>
                    <span className="text-zinc-500 text-[9px] font-bold uppercase">Cycle</span>
                </div>
            </div>
        </div>

        {/* Key Signature */}
        {config.playbackKey && config.key && (
            <div className={`bg-noir-800 p-3 rounded-lg border border-zinc-800/50 w-full space-y-3 relative group transition-opacity ${config.notationType !== 'relative' ? 'opacity-70' : ''}`}>
                <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                            <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-1">Key Center</span>
                    </div>
                    <span className="text-zinc-600 text-[9px] bg-noir-900 px-1.5 py-0.5 rounded border border-zinc-800">
                        Orig: {config.key.root} {config.key.type}
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <select 
                        value={config.playbackKey.root}
                        onChange={(e) => updatePlaybackKey('root', e.target.value)}
                        disabled={config.notationType !== 'relative'}
                        className="bg-noir-900 border border-zinc-700 text-lg font-bold text-white rounded px-2 py-2 focus:border-gold-500 outline-none appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {PITCH_CLASSES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                        <select 
                        value={config.playbackKey.type}
                        onChange={(e) => updatePlaybackKey('type', e.target.value)}
                        disabled={config.notationType !== 'relative'}
                        className="bg-noir-900 border border-zinc-700 text-lg font-bold text-white rounded px-2 py-2 focus:border-gold-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <option value="major">Major</option>
                        <option value="minor">Minor</option>
                    </select>
                </div>

                <div>
                    <div className="flex justify-between items-center mb-1">
                        <span className={`text-zinc-500 text-[10px] uppercase font-bold ${config.notationType !== 'relative' ? 'opacity-50' : ''}`}>Relative Root Octave</span>
                        <span className={`text-white text-xs font-mono ${config.notationType !== 'relative' ? 'opacity-50' : ''}`}>{config.playbackKey.averageOctave}</span>
                    </div>
                        <input 
                        type="range" min="0" max="8" 
                        value={config.playbackKey.averageOctave}
                        onChange={(e) => updatePlaybackKey('averageOctave', parseInt(e.target.value))}
                        disabled={config.notationType !== 'relative'}
                        className="w-full accent-gold-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed disabled:bg-zinc-800"
                    />
                        {config.notationType !== 'relative' && (
                            <div className="text-[9px] text-zinc-500 text-center mt-1 italic opacity-75">Only active in Relative Notation mode</div>
                        )}
                </div>
            </div>
        )}
    </div>
  );
};