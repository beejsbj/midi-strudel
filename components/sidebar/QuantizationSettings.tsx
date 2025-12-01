import React from 'react';
import { Clock } from 'lucide-react';
import { StrudelConfig } from '../../types';
import { SectionHeader, HelpText, ToggleSwitch } from './SidebarShared';

interface Props {
  config: StrudelConfig;
  setConfig: React.Dispatch<React.SetStateAction<StrudelConfig>>;
}

export const QuantizationSettings: React.FC<Props> = ({ config, setConfig }) => {
  const updateConfig = <K extends keyof StrudelConfig>(key: K, value: StrudelConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-4">
        <SectionHeader 
            icon={<Clock size={14} />} 
            title="Quantization" 
            action={
                <ToggleSwitch 
                    checked={config.isQuantized} 
                    onChange={(checked) => updateConfig('isQuantized', checked)} 
                />
            }
        />
        
        {config.isQuantized && (
            <div className="space-y-4 px-1">
                <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                        <span>Strength</span>
                        <span>{config.quantizationStrength}%</span>
                    </div>
                    <input 
                        type="range" min="0" max="100" 
                        value={config.quantizationStrength}
                        onChange={(e) => updateConfig('quantizationStrength', parseInt(e.target.value))}
                        className="w-full accent-gold-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
                    <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                        <span>Threshold (ms)</span>
                        <span>{config.quantizationThreshold}ms</span>
                    </div>
                    <input 
                        type="range" min="0" max="200" step="10"
                        value={config.quantizationThreshold}
                        onChange={(e) => updateConfig('quantizationThreshold', parseInt(e.target.value))}
                        className="w-full accent-gold-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                    />
                    <HelpText>Snaps notes to the nearest grid line if they are close enough.</HelpText>
                </div>
            </div>
        )}
        {!config.isQuantized && (
            <HelpText>Enable to fix timing irregularities and make the output code cleaner.</HelpText>
        )}
    </div>
  );
};