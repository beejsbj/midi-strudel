import React from 'react';
import { Eye } from 'lucide-react';
import { StrudelConfig } from '../../types';
import { SectionHeader, ToggleSwitch } from './SidebarShared';

interface Props {
  config: StrudelConfig;
  setConfig: React.Dispatch<React.SetStateAction<StrudelConfig>>;
}

const DURATION_STYLES = [
  { value: 'sup',    label: 'Sup',    title: 'Superscript (above baseline) — default' },
  { value: 'sub',    label: 'Sub',    title: 'Subscript (below baseline)' },
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

export const VisualsSection: React.FC<Props> = ({ config, setConfig }) => {
  const updateConfig = <K extends keyof StrudelConfig>(key: K, value: StrudelConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const btnBase = 'px-2 py-1 text-[10px] font-mono rounded border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500';
  const btnActive = 'bg-gold-500/20 border-gold-500/60 text-gold-400';
  const btnInactive = 'bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300';

  return (
    <div className="space-y-4">
      <SectionHeader icon={<Eye size={14} />} title="Visuals" />

      {/* Duration Tag Style */}
      <div className="space-y-1.5">
        <span className="text-xs text-zinc-300 font-medium">@Duration Tags</span>
        <div className="flex flex-wrap gap-1">
          {DURATION_STYLES.map(({ value, label, title }) => (
            <button
              key={value}
              type="button"
              title={title}
              onClick={() => updateConfig('durationTagStyle', value)}
              className={`${btnBase} ${config.durationTagStyle === value ? btnActive : btnInactive}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Playback Visual Method (multi-select) */}
      <div className="space-y-1.5">
        <span className="text-xs text-zinc-300 font-medium">Playback Visual</span>
        <div className="flex flex-wrap gap-1">
          {VISUAL_METHODS.map(({ value, label }) => {
            const isActive = config.visualMethods.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  const next = isActive
                    ? config.visualMethods.filter(m => m !== value)
                    : [...config.visualMethods, value];
                  updateConfig('visualMethods', next);
                }}
                className={`${btnBase} ${isActive ? btnActive : btnInactive}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {config.visualMethods.length > 0 && (
          <div
            className="flex items-center justify-between cursor-pointer pt-0.5"
            onClick={() => updateConfig('visualScope', config.visualScope === 'inline' ? 'global' : 'inline')}
          >
            <div className="flex flex-col">
              <span className="text-xs text-zinc-300">Inline</span>
              <span className="text-[9px] text-zinc-500">._pianoroll() vs .pianoroll()</span>
            </div>
            <ToggleSwitch
              checked={config.visualScope === 'inline'}
              onChange={(checked) => updateConfig('visualScope', checked ? 'inline' : 'global')}
              aria-label="Inline visual scope"
            />
          </div>
        )}
      </div>

      {/* Track Color Toggle — uses .color() in generated code */}
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => updateConfig('isTrackColoringEnabled', !config.isTrackColoringEnabled)}
      >
        <div className="flex flex-col">
          <span className="text-xs text-zinc-300">Track Colors</span>
          <span className="text-[9px] text-zinc-500">Adds .color() per track — affects highlights + visuals</span>
        </div>
        <ToggleSwitch
          checked={config.isTrackColoringEnabled}
          onChange={(checked) => updateConfig('isTrackColoringEnabled', checked)}
          aria-label="Track Colors"
        />
      </div>

      {/* Coloring Toggles */}
      <div className="space-y-2">
        <span className="text-xs text-zinc-300 font-medium">Mark Coloring</span>
        {([
          ['isNoteColoringEnabled',         'Note Colors',           'Chromatic pitch-based coloring on active marks during playback'] as const,
          ['isProgressiveFillEnabled',      'Animated Highlight',    'Progressive fill showing note duration during playback'] as const,
        ]).map(([key, label, desc]) => (
          <div
            key={key}
            className="flex items-center justify-between cursor-pointer"
            onClick={() => updateConfig(key, !config[key])}
          >
            <div className="flex flex-col">
              <span className="text-xs text-zinc-300">{label}</span>
              <span className="text-[9px] text-zinc-500">{desc}</span>
            </div>
            <ToggleSwitch
              checked={config[key]}
              onChange={(checked) => updateConfig(key, checked)}
              aria-label={label}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
