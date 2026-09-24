import React from 'react';
import { Sliders } from 'lucide-react';
import { StrudelConfig } from '../../types';
import { updateConfigValue } from './configUpdates';
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
  return (
    <SidebarSection
      icon={<Sliders size={14} />}
      title="Options"
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      <SwitchRow
        label="Include Velocity"
        description="Preserves the MIDI's note dynamics."
        checked={config.includeVelocity}
        onChange={(checked) => updateConfigValue(setConfig, 'includeVelocity', checked)}
        aria-label="Include velocity"
      />

      <div className="flex items-center justify-between gap-3 rounded-md border border-[rgba(245,158,11,0.10)] bg-black/18 px-3 py-2.5">
        <div className="min-w-0">
          <span className="text-xs font-medium text-zinc-200">Measures Per Line</span>
          <p className={fieldHintClass}>A phrase longer than one bar is written as a block with this many bars per line. A repeated bar (m!3) counts as 3.</p>
        </div>
        <input
          type="number"
          min="1"
          max="64"
          aria-label="Measures per line"
          value={config.measuresPerLine}
          onChange={(e) => updateConfigValue(setConfig, 'measuresPerLine', getBoundedNumberInputValue(e, config.measuresPerLine, 1, 64))}
          className={`w-16 text-center ${compactInputClass}`}
        />
      </div>

    </SidebarSection>
  );
};
