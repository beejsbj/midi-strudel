import React from 'react';
import { Sliders } from 'lucide-react';
import { StrudelConfig } from '../../types';
import { SectionHeader, ToggleSwitch } from './SidebarShared';

interface Props {
  config: StrudelConfig;
  setConfig: React.Dispatch<React.SetStateAction<StrudelConfig>>;
}

export const GeneralOptions: React.FC<Props> = ({ config, setConfig }) => {
  const updateConfig = <K extends keyof StrudelConfig>(key: K, value: StrudelConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-4">
        <SectionHeader
            icon={<Sliders size={14} />}
            title="Options"
        />
            <div className="px-1 space-y-3">
            <div className="flex items-center justify-between cursor-pointer" onClick={() => updateConfig('includeVelocity', !config.includeVelocity)}>
                <div className="flex flex-col">
                    <span className="text-xs text-zinc-300 font-medium">Include Velocity</span>
                    <span className="text-[9px] text-zinc-500">Adds :velocity to notes</span>
                </div>
                <ToggleSwitch
                    checked={config.includeVelocity}
                    onChange={(checked) => updateConfig('includeVelocity', checked)}
                    aria-label="Include velocity"
                />
            </div>
                <label className="flex items-center justify-between cursor-pointer">
                <div className="flex flex-col">
                    <span className="text-xs text-zinc-300 font-medium">Measures Per Line</span>
                    <span className="text-[9px] text-zinc-500">Controls line wrapping</span>
                </div>
                <input
                    type="number" min="1" max="8"
                    aria-label="Measures per line"
                    value={config.measuresPerLine}
                    onChange={(e) => updateConfig('measuresPerLine', parseInt(e.target.value))}
                    className="w-12 bg-black border border-zinc-800 text-xs text-center rounded py-1 focus:border-gold-500 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
                />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
                <div className="flex flex-col">
                    <span className="text-xs text-zinc-300 font-medium">Duration Precision</span>
                    <span className="text-[9px] text-zinc-500">Decimal places on @durations</span>
                </div>
                <input
                    type="number" min="1" max="8"
                    aria-label="Duration precision"
                    value={config.durationPrecision}
                    onChange={(e) => updateConfig('durationPrecision', parseInt(e.target.value))}
                    className="w-12 bg-black border border-zinc-800 text-xs text-center rounded py-1 focus:border-gold-500 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
                />
            </label>
            </div>
    </div>
  );
};
