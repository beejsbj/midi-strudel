import React from 'react';
import { Settings } from 'lucide-react';
import { StrudelConfig } from '../../types';
import { updateConfigValue } from './configUpdates';
import {
  SidebarSection,
  SegmentedControl,
  HelpText,
  fieldLabelClass,
} from './SidebarShared';

interface Props {
  config: StrudelConfig;
  setConfig: React.Dispatch<React.SetStateAction<StrudelConfig>>;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const FormatSettings: React.FC<Props> = ({
  config,
  setConfig,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  return (
    <SidebarSection
      icon={<Settings size={14} />}
      title="Format"
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      <div>
        <label className={fieldLabelClass}>Notation Type</label>
        <SegmentedControl
          aria-label="Notation type"
          value={config.notationType}
          onChange={(value) => updateConfigValue(setConfig, 'notationType', value as StrudelConfig['notationType'])}
          options={[
            { value: 'absolute', label: 'Absolute' },
            { value: 'relative', label: 'Relative' },
          ]}
        />
        <HelpText>
          {config.notationType === 'absolute'
            ? "Uses pitch names like 'C4', 'A#3'. Good for preserving exact notes."
            : "Uses scale degrees like '0', '2b'. Good for transposing and pattern manipulation."}
        </HelpText>
      </div>

      <div>
        <label className={fieldLabelClass}>Cycle Unit</label>
        <SegmentedControl
          aria-label="Cycle unit"
          value={config.cycleUnit}
          onChange={(value) => updateConfigValue(setConfig, 'cycleUnit', value as StrudelConfig['cycleUnit'])}
          options={[
            { value: 'bar', label: 'Whole Bar' },
            { value: 'beat', label: 'Beat' },
          ]}
        />
        <HelpText>Sets whether one Strudel cycle represents a bar or a beat. Note timing and lengths are preserved.</HelpText>
      </div>

      <div>
        <label className={fieldLabelClass}>Note Controls</label>
        <SegmentedControl
          aria-label="Control syntax"
          value={config.controlSyntax}
          onChange={(value) => updateConfigValue(setConfig, 'controlSyntax', value as StrudelConfig['controlSyntax'])}
          options={[
            { value: 'chained', label: 'Chained' },
            { value: 'colon', label: 'Colon (.as)' },
          ]}
        />
        <HelpText>
          {config.controlSyntax === 'chained'
            ? "Chained controls like `.clip()` and `.velocity()`. Good for readable patterns."
            : "Colon-separated fields on each note via `.as(\"note:velocity:clip\")`. Good for compact notation."}
        </HelpText>
      </div>
    </SidebarSection>
  );
};
