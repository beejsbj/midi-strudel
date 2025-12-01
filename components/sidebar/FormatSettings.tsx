import React from 'react';
import { Settings } from 'lucide-react';
import { StrudelConfig } from '../../types';
import { SectionHeader, HelpText } from './SidebarShared';

interface Props {
  config: StrudelConfig;
  setConfig: React.Dispatch<React.SetStateAction<StrudelConfig>>;
}

export const FormatSettings: React.FC<Props> = ({ config, setConfig }) => {
  const updateConfig = <K extends keyof StrudelConfig>(key: K, value: StrudelConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-4">
        <SectionHeader 
            icon={<Settings size={14} />} 
            title="Format" 
        />
        
        <div className="space-y-4 px-1">
                {/* Notation Type */}
                <div>
                <label className="block text-xs text-zinc-300 font-medium mb-1.5">Notation Type</label>
                <div className="grid grid-cols-2 gap-1 bg-black p-1 rounded border border-zinc-800">
                    <button 
                        className={`text-xs py-1 rounded transition-colors ${config.notationType === 'absolute' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                        onClick={() => updateConfig('notationType', 'absolute')}
                    >Absolute</button>
                    <button 
                        className={`text-xs py-1 rounded transition-colors ${config.notationType === 'relative' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                        onClick={() => updateConfig('notationType', 'relative')}
                    >Relative</button>
                </div>
                <HelpText>
                    {config.notationType === 'absolute' 
                        ? "Uses pitch names like 'C4', 'A#3'. Good for preserving exact notes."
                        : "Uses scale degrees like '0', '2b'. Good for transposing and pattern manipulation."}
                </HelpText>
                </div>

                {/* Cycle Unit */}
                <div>
                <label className="block text-xs text-zinc-300 font-medium mb-1.5">Cycle Unit (@1)</label>
                <div className="grid grid-cols-2 gap-1 bg-black p-1 rounded border border-zinc-800">
                    <button 
                        className={`text-xs py-1 rounded transition-colors ${config.cycleUnit === 'bar' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                        onClick={() => updateConfig('cycleUnit', 'bar')}
                    >Whole Bar</button>
                    <button 
                        className={`text-xs py-1 rounded transition-colors ${config.cycleUnit === 'beat' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                        onClick={() => updateConfig('cycleUnit', 'beat')}
                    >Beat</button>
                </div>
                <HelpText>Defines what a duration of 1 means. Usually one full measure (bar) or one beat.</HelpText>
                </div>

                {/* Timing Style */}
                <div>
                <label className="block text-xs text-zinc-300 font-medium mb-1.5">Timing Syntax</label>
                    <div className="grid grid-cols-2 gap-1 bg-black p-1 rounded border border-zinc-800">
                    <button 
                        className={`text-xs py-1 rounded transition-colors ${config.timingStyle === 'absoluteDuration' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                        onClick={() => updateConfig('timingStyle', 'absoluteDuration')}
                    >Duration</button>
                    <button 
                        className={`text-xs py-1 rounded transition-colors ${config.timingStyle === 'relativeDivision' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                        onClick={() => updateConfig('timingStyle', 'relativeDivision')}
                    >Division</button>
                </div>
                <HelpText>
                    {config.timingStyle === 'absoluteDuration'
                        ? "Specifies exact length of each note. E.g. \"note@0.5\"."
                        : "Splits time into equal parts. E.g. \"[a b]\" plays two notes in the space of one."}
                </HelpText>
                </div>
        </div>
    </div>
  );
};