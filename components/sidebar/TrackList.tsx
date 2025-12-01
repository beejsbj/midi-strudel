import React from 'react';
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
                            <span className="text-xs font-mono truncate text-zinc-300" title={track.name}>{track.name}</span>
                        </div>
                        {isDrum ? (
                            <span className="text-[10px] text-gold-500/80 truncate font-mono mt-0.5">Drum Track</span>
                        ) : (
                            <>
                                {config.useAutoMapping && !isOverridden && autoSound && (
                                    <span className="text-[10px] text-gold-500/80 truncate font-mono">Auto: {autoSound}</span>
                                )}
                                {(!config.useAutoMapping || !autoSound) && !isOverridden && (
                                    <span className="text-[10px] text-zinc-500 truncate font-mono">Using Global</span>
                                )}
                            </>
                        )}
                    </div>
                    <ToggleSwitch 
                        checked={!track.hidden}
                        onChange={() => toggleTrack(track.id)}
                    />
                </div>
                
                {!track.hidden && (
                    isDrum ? (
                            <select 
                            className="w-full bg-black border border-zinc-700 text-xs text-zinc-400 rounded px-2 py-1 focus:border-gold-500 outline-none"
                            value={track.drumBank || "RolandTR909"}
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
                            onChange={(e) => updateTrackSound(track.id, e.target.value)}
                        >
                            <option value="">
                                    {isOverridden ? 'Reset to Default' : (config.useAutoMapping && autoSound ? `Auto (${autoSound})` : `Global (${config.globalSound})`)}
                            </option>
                            {INSTRUMENTS.map(inst => (
                            <option key={inst} value={inst}>{inst}</option>
                            ))}
                        </select>
                    )
                )}
            </div>
        )})}
        </div>
    </div>
  );
};