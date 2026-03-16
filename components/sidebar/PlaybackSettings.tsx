import React from 'react';
import { Activity, RotateCcw } from 'lucide-react';
import { StrudelConfig, KeySignature } from '../../types';
import { PITCH_CLASSES } from '../../constants';
import { updateConfigValue } from './configUpdates';
import {
  SidebarSection,
  controlCardClass,
  sliderClass,
  valuePillClass,
  inputClass,
  getBoundedNumberInputValue,
} from './SidebarShared';

interface Props {
  config: StrudelConfig;
  setConfig: React.Dispatch<React.SetStateAction<StrudelConfig>>;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const PlaybackSettings: React.FC<Props> = ({
  config,
  setConfig,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const updatePlaybackKey = (field: keyof KeySignature, value: string | number) => {
      if (!config.playbackKey) return;
      updateConfigValue(setConfig, 'playbackKey', { ...config.playbackKey, [field]: value });
  };

  const updateTimeSig = (field: 'numerator' | 'denominator', value: number) => {
      updateConfigValue(setConfig, 'timeSignature', { ...config.timeSignature, [field]: value });
  };

  return (
    <SidebarSection
      icon={<Activity size={14} />}
      title="Playback"
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)] gap-2">
        <div className={`min-w-0 flex flex-col justify-between ${controlCardClass}`}>
          <div className="mb-3 flex items-start justify-between gap-2">
            <span className="font-display text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-300">Tempo</span>
            <span className={valuePillClass}>Orig: {config.sourceBpm}</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-semibold tracking-tight text-white">{config.bpm}</span>
                <span className="font-display text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">BPM</span>
              </div>
              {config.bpm !== config.sourceBpm && (
                <button
                  onClick={() => updateConfigValue(setConfig, 'bpm', config.sourceBpm)}
                  aria-label="Reset to source BPM"
                  className="rounded-sm border border-[rgba(245,158,11,0.14)] bg-black/45 p-1 text-zinc-500 transition-colors hover:border-gold-500/35 hover:text-gold-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-500"
                  title="Reset to Source BPM"
                >
                  <RotateCcw size={12} />
                </button>
              )}
            </div>

            <input
              type="range"
              min="20"
              max="300"
              value={config.bpm}
              aria-label={`Tempo ${config.bpm} BPM`}
              onChange={(e) => updateConfigValue(setConfig, 'bpm', getBoundedNumberInputValue(e, config.bpm, 20, 300))}
              className={`h-1.5 bg-zinc-800 ${sliderClass}`}
            />
          </div>
        </div>

        <div className={`relative min-w-0 ${controlCardClass}`}>
          <div className="mb-3 flex min-w-0 flex-col items-start gap-2">
            <span className="font-display text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-300">Meter</span>
            <span className={`${valuePillClass} max-w-full`}>
              Orig {config.sourceTimeSignature?.numerator}/{config.sourceTimeSignature?.denominator}
            </span>
          </div>

          {(
            config.timeSignature.numerator !== config.sourceTimeSignature?.numerator ||
            config.timeSignature.denominator !== config.sourceTimeSignature?.denominator
          ) && (
            <button
              onClick={() => updateConfigValue(setConfig, 'timeSignature', config.sourceTimeSignature!)}
              aria-label="Reset time signature"
              className="absolute right-3 top-3 rounded-sm border border-[rgba(245,158,11,0.14)] bg-black/45 p-1 text-zinc-500 transition-colors hover:border-gold-500/35 hover:text-gold-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-500"
              title="Reset"
            >
              <RotateCcw size={10} />
            </button>
          )}

          <div className="flex min-h-[136px] items-center justify-center">
            <div className="w-full max-w-[92px]">
              <input
                type="number"
                min="1"
                max="16"
                aria-label="Time signature numerator"
                value={config.timeSignature.numerator}
                onChange={(e) => updateTimeSig('numerator', getBoundedNumberInputValue(e, config.timeSignature.numerator, 1, 16))}
                className="w-full border-0 bg-transparent px-0 py-0 text-center font-mono text-[24px] font-semibold leading-none text-zinc-100 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500"
              />
              <div className="mx-auto my-2 h-px w-full bg-[rgba(245,158,11,0.18)]" />
              <input
                type="number"
                min="1"
                max="16"
                aria-label="Time signature denominator"
                value={config.timeSignature.denominator}
                onChange={(e) => updateTimeSig('denominator', getBoundedNumberInputValue(e, config.timeSignature.denominator, 1, 16))}
                className="w-full border-0 bg-transparent px-0 py-0 text-center font-mono text-[24px] font-semibold leading-none text-zinc-100 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500"
              />
            </div>
          </div>
        </div>
      </div>

      {config.playbackKey && config.key && (
        <div className={`${controlCardClass} w-full space-y-3 ${config.notationType !== 'relative' ? 'opacity-70' : ''}`}>
          <div className="flex items-start justify-between gap-2">
            <span className="font-display text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-300">Key Center</span>
            <span className={valuePillClass}>Orig: {config.key.root} {config.key.type}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={config.playbackKey.root}
              onChange={(e) => updatePlaybackKey('root', e.target.value)}
              disabled={config.notationType !== 'relative'}
              aria-label="Playback key root"
              className={inputClass}
            >
              {PITCH_CLASSES.map((pitchClass) => (
                <option key={pitchClass} value={pitchClass}>{pitchClass}</option>
              ))}
            </select>
            <select
              value={config.playbackKey.type}
              onChange={(e) => updatePlaybackKey('type', e.target.value)}
              disabled={config.notationType !== 'relative'}
              aria-label="Playback key type"
              className={inputClass}
            >
              <option value="major">Major</option>
              <option value="minor">Minor</option>
            </select>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className={`font-display text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-300 ${config.notationType !== 'relative' ? 'opacity-50' : ''}`}>
                Relative Root Octave
              </span>
              <span className={`font-mono text-sm text-zinc-100 ${config.notationType !== 'relative' ? 'opacity-50' : ''}`}>
                {config.playbackKey.averageOctave}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="8"
              value={config.playbackKey.averageOctave}
              aria-label={`Relative root octave ${config.playbackKey.averageOctave}`}
              onChange={(e) => updatePlaybackKey('averageOctave', getBoundedNumberInputValue(e, config.playbackKey.averageOctave, 0, 8))}
              disabled={config.notationType !== 'relative'}
              className={`h-1.5 bg-zinc-800 disabled:cursor-not-allowed ${sliderClass}`}
            />
            {config.notationType !== 'relative' && (
              <p className="mt-1.5 text-[10px] leading-4 text-gold-500/65">Only active in Relative notation mode.</p>
            )}
          </div>
        </div>
      )}
    </SidebarSection>
  );
};
