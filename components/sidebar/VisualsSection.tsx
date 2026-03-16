import React from 'react';
import { Eye } from 'lucide-react';
import { StrudelConfig } from '../../types';
import {
  SidebarSection,
  SegmentedControl,
  MultiSegmentedControl,
  SwitchRow,
  HelpText,
  fieldLabelClass,
} from './SidebarShared';

interface Props {
  config: StrudelConfig;
  setConfig: React.Dispatch<React.SetStateAction<StrudelConfig>>;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const DURATION_STYLES = [
  { value: 'default', label: 'Default', title: 'Show editor text with no custom metadata styling' },
  { value: 'sup',    label: 'Sup',    title: 'Superscript (above baseline)' },
  { value: 'normal', label: 'Sm',     title: 'Small, at baseline' },
  { value: 'ghost',  label: 'Ghost',  title: 'Full-size, very faint' },
  { value: 'hover',  label: 'Hover',  title: 'Appears on note hover as gold badge' },
  { value: 'hidden', label: 'Hide',   title: 'Completely hidden' },
] as const;

const VISUAL_METHODS = [
  { value: 'pianoroll',  label: 'Piano' },
  { value: 'punchcard',  label: 'Punch' },
  { value: 'spiral',     label: 'Spiral' },
  { value: 'pitchwheel', label: 'Wheel' },
  { value: 'spectrum',   label: 'Spectrum' },
] as const;

export const VisualsSection: React.FC<Props> = ({
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
      icon={<Eye size={14} />}
      title="Visuals"
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      <div className="space-y-1.5">
        <span className={fieldLabelClass}>@duration + :velocity tags</span>
        <SegmentedControl
          aria-label="Inline metadata style"
          value={config.durationTagStyle}
          onChange={(value) => updateConfig('durationTagStyle', value as StrudelConfig['durationTagStyle'])}
          columns={3}
          options={DURATION_STYLES.map(({ value, label }) => ({ value, label }))}
        />
        <HelpText>Styles both inline duration values and velocity values when velocity is included.</HelpText>
      </div>

      <div className="space-y-1.5">
        <span className={fieldLabelClass}>Playback Visual</span>
        <MultiSegmentedControl
          aria-label="Playback visual methods"
          values={config.visualMethods}
          onChange={(values) => updateConfig('visualMethods', values as StrudelConfig['visualMethods'])}
          options={VISUAL_METHODS}
        />

        {config.visualMethods.length > 0 && (
          <SwitchRow
            label="Inline Scope"
            description="Uses `._pianoroll()` instead of `.pianoroll()`."
            checked={config.visualScope === 'inline'}
            onChange={(checked) => updateConfig('visualScope', checked ? 'inline' : 'global')}
            aria-label="Inline visual scope"
          />
        )}
      </div>

      <SwitchRow
        label="Track Colors"
        description="Adds `.color()` per track and affects highlights plus visuals."
        checked={config.isTrackColoringEnabled}
        onChange={(checked) => updateConfig('isTrackColoringEnabled', checked)}
        aria-label="Track Colors"
      />

      <div className="space-y-2">
        <span className={fieldLabelClass}>Mark Coloring</span>
        {([
          ['isNoteColoringEnabled',         'Note Colors',           'Chromatic pitch-based coloring on active marks during playback'] as const,
          ['isProgressiveFillEnabled',      'Animated Highlight',    'Progressive fill showing note duration during playback'] as const,
          ['isPatternTextColoringEnabled',  'Text Contrast',         'Adjust active note text for readability against note-based fills'] as const,
        ]).map(([key, label, desc]) => (
          <SwitchRow
            key={key}
            label={label}
            description={desc}
            checked={config[key]}
            onChange={(checked) => updateConfig(key, checked)}
            aria-label={label}
          />
        ))}
      </div>
    </SidebarSection>
  );
};
