import React from 'react';
import { Sliders } from 'lucide-react';
import { StrudelConfig } from '../../types';
import {
  SidebarSection,
  SwitchRow,
  fieldHintClass,
  compactInputClass,
  getBoundedNumberInputValue,
} from './SidebarShared';

interface Props {
  config: StrudelConfig;
  setConfig: React.Dispatch<React.SetStateAction<StrudelConfig>>;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const GeneralOptions: React.FC<Props> = ({
  config,
  setConfig,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const updateConfig = <K extends keyof StrudelConfig>(key: K, value: StrudelConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const toggleLineMode = () => {
    const next = config.formatPerLineBy === 'note' ? 'measure' : 'note';
    setConfig(prev => ({
      ...prev,
      formatPerLineBy: next,
      measuresPerLine: next === 'note' ? 4 : 1,
    }));
  };

  const isByNote = config.formatPerLineBy === 'note';

  return (
    <SidebarSection
      icon={<Sliders size={14} />}
      title="Options"
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      <SwitchRow
        label="Include Velocity"
        description="Adds :velocity to notes."
        checked={config.includeVelocity}
        onChange={(checked) => updateConfig('includeVelocity', checked)}
        aria-label="Include velocity"
      />

      <div className="flex items-center justify-between gap-3 rounded-md border border-[rgba(245,158,11,0.10)] bg-black/18 px-3 py-2.5">
        <div className="min-w-0">
          <span className="text-xs font-medium text-zinc-200">
            <button
              type="button"
              onClick={toggleLineMode}
              className="text-gold-500 underline decoration-dotted underline-offset-4 transition-colors hover:text-gold-300 focus:outline-none"
              title={`Switch to ${isByNote ? 'measures' : 'notes'} per line`}
            >
              {isByNote ? 'Notes' : 'Measures'}
            </button>
            {' Per Line'}
          </span>
          <p className={fieldHintClass}>Controls line wrapping.</p>
        </div>
        <input
          type="number"
          min="1"
          max="64"
          aria-label={`${isByNote ? 'Notes' : 'Measures'} per line`}
          value={config.measuresPerLine}
          onChange={(e) => updateConfig('measuresPerLine', getBoundedNumberInputValue(e, config.measuresPerLine, 1, 64))}
          className={`w-16 text-center ${compactInputClass}`}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border border-[rgba(245,158,11,0.10)] bg-black/18 px-3 py-2.5">
        <div className="min-w-0">
          <span className="text-xs font-medium text-zinc-200">Duration Precision</span>
          <p className={fieldHintClass}>Decimal places on `@durations`.</p>
        </div>
        <input
          type="number"
          min="1"
          max="8"
          aria-label="Duration precision"
          value={config.durationPrecision}
          onChange={(e) => updateConfig('durationPrecision', getBoundedNumberInputValue(e, config.durationPrecision, 1, 8))}
          className={`w-16 text-center ${compactInputClass}`}
        />
      </div>
    </SidebarSection>
  );
};
