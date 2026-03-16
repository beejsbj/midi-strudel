import React from 'react';
import { Settings } from 'lucide-react';
import { StrudelConfig } from '../../types';
import { patchConfig, updateConfigValue } from './configUpdates';
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
  const updateTimingStyle = (value: StrudelConfig['timingStyle']) => {
    if (value === 'relativeDivision') {
      patchConfig(setConfig, {
        timingStyle: value,
        formatPerLineBy: 'measure',
        measuresPerLine: 1,
      });
      return;
    }

    patchConfig(setConfig, {
      timingStyle: value,
      formatPerLineBy: 'note',
      measuresPerLine: 4,
    });
  };

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
        <label className={fieldLabelClass}>Cycle Unit (@1)</label>
        <SegmentedControl
          aria-label="Cycle unit"
          value={config.cycleUnit}
          onChange={(value) => updateConfigValue(setConfig, 'cycleUnit', value as StrudelConfig['cycleUnit'])}
          options={[
            { value: 'bar', label: 'Whole Bar' },
            { value: 'beat', label: 'Beat' },
          ]}
        />
        <HelpText>Defines what a duration of 1 means. Usually one full measure (bar) or one beat.</HelpText>
      </div>

      <div>
        <label className={fieldLabelClass}>Timing Syntax</label>
        <SegmentedControl
          aria-label="Timing syntax"
          value={config.timingStyle}
          onChange={(value) => updateTimingStyle(value as StrudelConfig['timingStyle'])}
          options={[
            { value: 'absoluteDuration', label: 'Duration' },
            { value: 'relativeDivision', label: 'Division' },
          ]}
        />
        <HelpText>
          {config.timingStyle === 'absoluteDuration'
            ? "Specifies exact length of each note. E.g. \"note@0.5\"."
            : "Splits time into equal parts. E.g. \"[a b]\" plays two notes in the space of one."}
        </HelpText>
      </div>
    </SidebarSection>
  );
};
