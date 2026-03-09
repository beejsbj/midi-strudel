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
  { value: 'none',       label: 'None' },
  { value: 'pianoroll',  label: 'Piano' },
  { value: 'punchcard',  label: 'Punch' },
  { value: 'spiral',     label: 'Spiral' },
  { value: 'pitchwheel', label: 'Wheel' },
] as const;

const MARKCSS_PRESETS = [
  { value: 'none',             label: 'None' },
  { value: 'track-color',      label: 'Track' },
  { value: 'pitch-rainbow',    label: 'Rainbow' },
  { value: 'velocity-glow',    label: 'Glow' },
  { value: 'progressive-fill', label: 'Fill' },
  { value: 'custom',           label: 'Custom' },
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

      {/* Playback Visual Method */}
      <div className="space-y-1.5">
        <span className="text-xs text-zinc-300 font-medium">Playback Visual</span>
        <div className="flex flex-wrap gap-1">
          {VISUAL_METHODS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => updateConfig('visualMethod', value)}
              className={`${btnBase} ${config.visualMethod === value ? btnActive : btnInactive}`}
            >
              {label}
            </button>
          ))}
        </div>

        {config.visualMethod !== 'none' && (
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

      {/* Mark CSS Preset */}
      <div className="space-y-1.5">
        <span className="text-xs text-zinc-300 font-medium">Mark CSS</span>
        <div className="flex flex-wrap gap-1">
          {MARKCSS_PRESETS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => updateConfig('markcssPreset', value)}
              className={`${btnBase} ${config.markcssPreset === value ? btnActive : btnInactive}`}
            >
              {label}
            </button>
          ))}
        </div>

        {config.markcssPreset === 'custom' && (
          <input
            type="text"
            placeholder="e.g. background:red;border-radius:3px"
            value={config.markcssCustom}
            onChange={(e) => updateConfig('markcssCustom', e.target.value)}
            className="w-full bg-black border border-zinc-700 text-[10px] font-mono text-zinc-300 rounded px-2 py-1.5 focus:border-gold-500 outline-none placeholder:text-zinc-600"
          />
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
          ['isNoteColoringEnabled',         'Note Colors',    'Sets --note-value for Rainbow/Glow (must be on for those presets)'] as const,
          ['isProgressiveFillEnabled',      'Auto Fill',      'Gold fill animation on active notes (when no mark preset)'] as const,
          ['isPatternTextColoringEnabled',  'Code Text',      'Color note names in editor by pitch class'] as const,
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
