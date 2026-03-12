import React, { useState } from 'react';
import { Music, Drum } from 'lucide-react';
import { StrudelConfig, Track } from '../../types';
import { INSTRUMENTS, DRUM_BANKS, getAutoSound } from '../../constants';
import { SectionHeader, ToggleSwitch } from './SidebarShared';

interface Props {
  config: StrudelConfig;
  setConfig: React.Dispatch<React.SetStateAction<StrudelConfig>>;
  tracks: Track[];
  setTracks: React.Dispatch<React.SetStateAction<Track[]>>;
}

export const TrackList: React.FC<Props> = ({ config, setConfig, tracks, setTracks }) => {
  const [expandedColorTrackId, setExpandedColorTrackId] = useState<string | null>(null);

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
    { value: undefined as undefined,  label: 'Global' },
    { value: 'none' as const,         label: 'Off' },
    { value: 'pianoroll' as const,    label: 'Piano' },
    { value: 'punchcard' as const,    label: 'Punch' },
    { value: 'spiral' as const,       label: 'Spiral' },
    { value: 'pitchwheel' as const,   label: 'Wheel' },
    { value: 'spectrum' as const,     label: 'Spectrum' },
  ];

  const getEffectiveSound = (track: Track) => {
    if (track.sound) return track.sound;
    if (config.useAutoMapping) return getAutoSound(track) || config.globalSound;
    return config.globalSound;
  };

  return (
    <div className="space-y-4 pb-10">
        <div className="flex flex-col space-y-4">
            <SectionHeader
                icon={<Music size={14} />}
                title="Tracks"
            />

            {/* Global Sound Control Block */}
            <div className="bg-zinc-800/30 p-3 rounded border border-zinc-800 space-y-3">
                <div>
                <label className="block text-xs text-zinc-400 mb-1.5 uppercase tracking-wide font-bold">Global Sound</label>
                <select
                    className="w-full bg-black border border-zinc-700 text-xs text-zinc-300 rounded px-2 py-1.5 focus:border-gold-500 outline-none"
                    value={config.globalSound}
                    onChange={(e) => updateConfig('globalSound', e.target.value)}
                >
                    {INSTRUMENTS.map(inst => (
                        <option key={inst} value={inst}>{inst}</option>
                    ))}
                </select>
                </div>
                <div className="flex items-center justify-between cursor-pointer pt-1" onClick={() => updateConfig('useAutoMapping', !config.useAutoMapping)}>
                <div className="flex flex-col">
                        <span className="text-xs text-zinc-300 font-medium">Auto Mapping</span>
                        <span className="text-[9px] text-zinc-500">Guess instruments from names</span>
                </div>
                <ToggleSwitch
                    checked={config.useAutoMapping}
                    onChange={(checked) => updateConfig('useAutoMapping', checked)}
                    aria-label="Enable auto mapping"
                />
            </div>
            </div>
        </div>

        <div className="space-y-2">
        {tracks.length === 0 && <div className="text-zinc-600 text-xs italic p-2 text-center border border-dashed border-zinc-800 rounded">No tracks loaded</div>}
        {tracks.map(track => {
            const effectiveSound = getEffectiveSound(track);
            const autoSound = getAutoSound(track);
            const isOverridden = !!track.sound;
            const isDrum = track.isDrum;

            return (
            <div key={track.id} className={`p-3 rounded border transition-all ${track.hidden ? 'border-zinc-800 bg-transparent opacity-50' : 'border-gold-600/30 bg-zinc-900/50'}`}>
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
                                className="w-3 h-3 rounded-full shrink-0 cursor-pointer border border-transparent hover:border-white/30 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
                                style={{ background: `hsl(${track.color}, 60%, 50%)` }}
                              />
                            )}
                            <span className="text-xs font-mono truncate text-zinc-300" title={track.name}>{track.name}</span>
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
                            <span className="text-[9px] font-mono text-zinc-500 w-6 text-right">{track.color}°</span>
                          </div>
                        )}
                        {isDrum ? (
                            <span className="text-[10px] text-gold-500/80 truncate font-mono mt-0.5">Drum Track</span>
                        ) : (
                            <>
                                {!isOverridden && autoSound && (
                                    <span className={`text-[10px] truncate font-mono ${config.useAutoMapping ? 'text-gold-500/80' : 'text-zinc-500/50'}`}>
                                        Auto: {autoSound}
                                    </span>
                                )}
                                {!isOverridden && !autoSound && (
                                    <span className="text-[10px] text-zinc-500 truncate font-mono">Using Global</span>
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
                  <div className="space-y-1.5">
                    {isDrum ? (
                      <select
                        className="w-full bg-black border border-zinc-700 text-xs text-zinc-400 rounded px-2 py-1 focus:border-gold-500 outline-none"
                        value={track.drumBank || "RolandTR909"}
                        aria-label={`Drum bank for ${track.name}`}
                        onChange={(e) => updateTrackDrumBank(track.id, e.target.value)}
                      >
                        {DRUM_BANKS.map(bank => (
                          <option key={bank} value={bank}>{bank}</option>
                        ))}
                      </select>
                    ) : (
                      <select
                        className="w-full bg-black border border-zinc-700 text-xs text-zinc-400 rounded px-2 py-1 focus:border-gold-500 outline-none"
                        value={track.sound || ''}
                        aria-label={`Instrument for ${track.name}`}
                        onChange={(e) => updateTrackSound(track.id, e.target.value)}
                      >
                        <option value="">
                          {isOverridden ? 'Reset to Default' : (config.useAutoMapping && autoSound ? `Auto (${autoSound})` : `Global (${config.globalSound})`)}
                        </option>
                        {INSTRUMENTS.map(inst => (
                          <option key={inst} value={inst}>{inst}</option>
                        ))}
                      </select>
                    )}

                    {/* Per-track visuals */}
                    <select
                      className="w-full bg-black border border-zinc-800 text-[10px] font-mono text-zinc-500 rounded px-1.5 py-1 focus:border-gold-500 outline-none"
                      value={track.trackVisualMethod ?? ''}
                      aria-label={`Visual method for ${track.name}`}
                      onChange={(e) => updateTrack(track.id, 'trackVisualMethod', (e.target.value || undefined) as typeof track.trackVisualMethod)}
                    >
                      {VISUAL_METHOD_OPTIONS.map(opt => (
                        <option key={String(opt.value)} value={opt.value ?? ''}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                )}
            </div>
        )})}
        </div>
    </div>
  );
};
