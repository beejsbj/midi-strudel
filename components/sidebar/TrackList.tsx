import React, { useState } from 'react';
import { Music, Drum } from 'lucide-react';
import { StrudelConfig, Track } from '../../types';
import { INSTRUMENTS, DRUM_BANKS, getAutoSound } from '../../constants';
import {
  SidebarSection,
  SwitchRow,
  ToggleSwitch,
  Combobox,
  type ComboboxOption,
  controlCardClass,
  fieldLabelClass,
} from './SidebarShared';

interface Props {
  config: StrudelConfig;
  setConfig: React.Dispatch<React.SetStateAction<StrudelConfig>>;
  tracks: Track[];
  setTracks: React.Dispatch<React.SetStateAction<Track[]>>;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const TrackList: React.FC<Props> = ({
  config,
  setConfig,
  tracks,
  setTracks,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [expandedColorTrackId, setExpandedColorTrackId] = useState<string | null>(null);

  const prettifyOption = (value: string) =>
    value
      .replace(/^gm_/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

  const globalVisualLabel =
    config.visualMethods.length === 0
      ? 'Off'
      : config.visualMethods.map((method) => prettifyOption(method)).join(' + ');

  const updateConfig = <K extends keyof StrudelConfig>(key: K, value: StrudelConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const toggleTrack = (id: string) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, hidden: !t.hidden } : t));
  };

  const updateTrackSound = (id: string, sound: string) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, sound } : t));
  };

  const updateTrackDrumBank = (id: string, bank: string) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, drumBank: bank } : t));
  };

  const updateTrack = <K extends keyof import('../../types').Track>(id: string, key: K, value: import('../../types').Track[K]) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, [key]: value } : t));
  };

  const VISUAL_METHOD_OPTIONS = [
    { value: undefined as undefined,  label: `Global (${globalVisualLabel})` },
    { value: 'none' as const,         label: 'Off' },
    { value: 'pianoroll' as const,    label: 'Piano' },
    { value: 'punchcard' as const,    label: 'Punch' },
    { value: 'spiral' as const,       label: 'Spiral' },
    { value: 'pitchwheel' as const,   label: 'Wheel' },
    { value: 'spectrum' as const,     label: 'Spectrum' },
  ];

  const soundOptions: ComboboxOption[] = INSTRUMENTS.map((instrument) => ({
    value: instrument,
    label: prettifyOption(instrument),
    hint: instrument,
    keywords: [instrument.replaceAll('_', ' ')],
  }));

  const drumBankOptions: ComboboxOption[] = DRUM_BANKS.map((bank) => ({
    value: bank,
    label: bank.replace(/([A-Z])/g, ' $1').trim(),
    hint: bank,
  }));

  const trackVisualOptions: ComboboxOption[] = VISUAL_METHOD_OPTIONS.map((option) => ({
    value: option.value ?? '',
    label: option.label,
  }));

  return (
    <SidebarSection
      icon={<Music size={14} />}
      title={`Tracks (${tracks.length})`}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      <div className={`${controlCardClass} space-y-3`}>
        <div>
          <label className={fieldLabelClass}>Global Sound</label>
          <Combobox
            value={config.globalSound}
            onChange={(value) => updateConfig('globalSound', value)}
            options={soundOptions}
            aria-label="Global sound"
          />
        </div>
        <SwitchRow
          label="Auto Mapping"
          description="Guess instruments from track names."
          checked={config.useAutoMapping}
          onChange={(checked) => updateConfig('useAutoMapping', checked)}
          aria-label="Enable auto mapping"
        />
      </div>

      <div className="space-y-3 pb-6">
        {tracks.length === 0 && <div className="rounded-md border border-dashed border-[rgba(245,158,11,0.12)] p-3 text-center text-xs italic text-zinc-600">No tracks loaded</div>}
        {tracks.map((track) => {
            const autoSound = getAutoSound(track);
            const isOverridden = !!track.sound;
            const isDrum = track.isDrum;
            const trackSoundOptions: ComboboxOption[] = [
              {
                value: '',
                label: config.useAutoMapping && autoSound
                  ? `Global (${prettifyOption(autoSound)})`
                  : `Global (${prettifyOption(config.globalSound)})`,
                hint: isOverridden ? 'remove track override' : 'follow project mapping',
              },
              ...soundOptions,
            ];

            return (
            <div key={track.id} className={`rounded-md border px-3 py-2.5 transition-all ${track.hidden ? 'border-[rgba(245,158,11,0.08)] bg-black/8 opacity-55' : 'border-[rgba(245,158,11,0.18)] bg-[linear-gradient(180deg,rgba(14,14,14,0.98),rgba(8,8,8,1))] shadow-[inset_0_1px_0_rgba(245,158,11,0.05),0_0_0_1px_rgba(245,158,11,0.03)]'}`}>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex flex-col overflow-hidden mr-2">
                        <div className="flex items-center space-x-1.5">
                            {isDrum && <Drum size={10} className="text-gold-500" />}
                            {config.isTrackColoringEnabled && track.color && (
                              <button
                                type="button"
                                title="Click to adjust hue"
                                aria-label={`Adjust color for ${track.name}`}
                                onClick={() => setExpandedColorTrackId(
                                  expandedColorTrackId === track.id ? null : track.id
                                )}
                                className="h-3 w-3 shrink-0 rounded-full border border-transparent transition-colors hover:border-gold-500/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
                                style={{ background: `hsl(${track.color}, 60%, 50%)` }}
                              />
                            )}
                            <span className="truncate text-xs font-medium text-zinc-300" title={track.name}>{track.name}</span>
                        </div>
                        {config.isTrackColoringEnabled && track.color && expandedColorTrackId === track.id && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <div
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ background: `hsl(${track.color}, 60%, 50%)` }}
                            />
                            <input
                              type="range"
                              min="0"
                              max="360"
                              value={parseInt(track.color)}
                              onChange={(e) => updateTrack(track.id, 'color', e.target.value)}
                              className="flex-1 h-1 accent-gold-500 cursor-pointer"
                              style={{
                                background: `linear-gradient(to right, hsl(0,60%,50%), hsl(60,60%,50%), hsl(120,60%,50%), hsl(180,60%,50%), hsl(240,60%,50%), hsl(300,60%,50%), hsl(360,60%,50%))`,
                              }}
                              aria-label={`Hue for ${track.name}`}
                            />
                            <span className="w-6 text-right font-mono text-[9px] text-zinc-500">{track.color}°</span>
                          </div>
                        )}
                        {isDrum ? (
                            <span className="mt-0.5 truncate font-display text-[10px] font-medium uppercase tracking-[0.14em] text-gold-500/80">Drum Track</span>
                        ) : (
                            <>
                                {!isOverridden && autoSound && (
                                    <span className={`truncate font-display text-[10px] font-medium uppercase tracking-[0.14em] ${config.useAutoMapping ? 'text-gold-500/80' : 'text-zinc-500/50'}`}>
                                        Auto: {prettifyOption(autoSound)}
                                    </span>
                                )}
                                {!isOverridden && !autoSound && (
                                    <span className="truncate font-display text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Using Global</span>
                                )}
                            </>
                        )}
                    </div>
                    <ToggleSwitch
                        checked={!track.hidden}
                        onChange={() => toggleTrack(track.id)}
                        aria-label={`${track.hidden ? 'Show' : 'Hide'} track ${track.name}`}
                    />
                </div>

                {!track.hidden && (
                  <div className="space-y-1">
                    {isDrum ? (
                      <div>
                        <label className="mb-1 block font-display text-[9px] font-medium uppercase tracking-[0.18em] text-zinc-400">Drum Bank</label>
                        <Combobox
                          value={track.drumBank || "RolandTR909"}
                          aria-label={`Drum bank for ${track.name}`}
                          onChange={(value) => updateTrackDrumBank(track.id, value)}
                          options={drumBankOptions}
                          compact
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="mb-1 block font-display text-[9px] font-medium uppercase tracking-[0.18em] text-zinc-400">Sound</label>
                        <Combobox
                          value={track.sound || ''}
                          aria-label={`Instrument for ${track.name}`}
                          onChange={(value) => updateTrackSound(track.id, value)}
                          options={trackSoundOptions}
                          compact
                        />
                      </div>
                    )}

                    {/* Per-track visuals */}
                    <div>
                      <label className="mb-1 block font-display text-[9px] font-medium uppercase tracking-[0.18em] text-zinc-400">Visual</label>
                      <Combobox
                        value={track.trackVisualMethod ?? ''}
                        aria-label={`Visual method for ${track.name}`}
                        onChange={(value) =>
                          updateTrack(track.id, 'trackVisualMethod', (value || undefined) as typeof track.trackVisualMethod)
                        }
                        options={trackVisualOptions}
                        compact
                      />
                    </div>
                  </div>
                )}
            </div>
        )})}
      </div>
    </SidebarSection>
  );
};
