import React from 'react';
import { Sliders } from 'lucide-react';
import { StrudelConfig } from '../../types';
import { patchConfig, updateConfigValue } from './configUpdates';
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
  const toggleLineMode = () => {
    const next = config.formatPerLineBy === 'note' ? 'measure' : 'note';
    patchConfig(setConfig, {
      formatPerLineBy: next,
      measuresPerLine: next === 'note' ? 4 : 1,
    });
  };

  const isByNote = config.formatPerLineBy === 'note';
  const lineModeLabel = isByNote ? 'Notes' : 'Measures';
  const lineModeHint = 'Controls line wrapping.';

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
        onChange={(checked) => updateConfigValue(setConfig, 'includeVelocity', checked)}
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
              {lineModeLabel}
            </button>
            {' Per Line'}
          </span>
          <p className={fieldHintClass}>{lineModeHint}</p>
        </div>
        <input
          type="number"
          min="1"
          max="64"
          aria-label={`${lineModeLabel} per line`}
          value={config.measuresPerLine}
          onChange={(e) => updateConfigValue(setConfig, 'measuresPerLine', getBoundedNumberInputValue(e, config.measuresPerLine, 1, 64))}
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
          onChange={(e) => updateConfigValue(setConfig, 'durationPrecision', getBoundedNumberInputValue(e, config.durationPrecision, 1, 8))}
          className={`w-16 text-center ${compactInputClass}`}
        />
      </div>
    </SidebarSection>
  );
};
