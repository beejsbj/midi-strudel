import React from 'react';
import { Clock } from 'lucide-react';
import { StrudelConfig } from '../../types';
import {
  SidebarSection,
  HelpText,
  ToggleSwitch,
  sliderClass,
  valuePillClass,
  getBoundedNumberInputValue,
} from './SidebarShared';

interface Props {
  config: StrudelConfig;
  setConfig: React.Dispatch<React.SetStateAction<StrudelConfig>>;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const QuantizationSettings: React.FC<Props> = ({
  config,
  setConfig,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const updateConfig = <K extends keyof StrudelConfig>(key: K, value: StrudelConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <SidebarSection
      icon={<Clock size={14} />}
      title="Quantization"
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      action={
        <ToggleSwitch
          checked={config.isQuantized}
          onChange={(checked) => updateConfig('isQuantized', checked)}
          aria-label="Enable quantization"
        />
      }
    >
      {config.isQuantized ? (
        <div className="space-y-2 rounded-md border border-[rgba(245,158,11,0.18)] bg-[rgba(245,158,11,0.04)] p-2.5">
          <div className="rounded-md border border-[rgba(245,158,11,0.10)] bg-black/18 px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-display text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-300">Strength</span>
              <span className={valuePillClass}>{config.quantizationStrength}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={config.quantizationStrength}
              aria-label={`Quantization strength ${config.quantizationStrength}%`}
              onChange={(e) => updateConfig('quantizationStrength', getBoundedNumberInputValue(e, config.quantizationStrength, 0, 100))}
              className={`h-1.5 bg-zinc-800 ${sliderClass}`}
            />
          </div>

          <div className="rounded-md border border-[rgba(245,158,11,0.10)] bg-black/18 px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-display text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-300">Threshold</span>
              <span className={valuePillClass}>{config.quantizationThreshold}ms</span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              step="10"
              value={config.quantizationThreshold}
              aria-label={`Quantization threshold ${config.quantizationThreshold} milliseconds`}
              onChange={(e) => updateConfig('quantizationThreshold', getBoundedNumberInputValue(e, config.quantizationThreshold, 0, 200))}
              className={`h-1.5 bg-zinc-800 ${sliderClass}`}
            />
            <HelpText>Snaps notes to the nearest grid line if they are close enough.</HelpText>
          </div>
        </div>
      ) : (
        <HelpText>Enable to fix timing irregularities and make the output code cleaner.</HelpText>
      )}
    </SidebarSection>
  );
};
