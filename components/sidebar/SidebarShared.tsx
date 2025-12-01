import React from 'react';

export const ToggleSwitch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void }> = ({ checked, onChange }) => (
  <div 
    className="relative inline-flex items-center cursor-pointer shrink-0" 
    onClick={(e) => {
        e.stopPropagation(); // Prevent bubbling if inside another clickable
        onChange(!checked);
    }}
  >
    <input 
        type="checkbox" 
        checked={checked} 
        readOnly
        className="sr-only peer"
    />
    <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gold-600 transition-colors"></div>
  </div>
);

export const SectionDivider = () => <div className="h-px bg-zinc-800 my-6" />;

export const HelpText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="text-[10px] text-zinc-500 mt-1.5 leading-tight">{children}</p>
);

export const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; action?: React.ReactNode }> = ({ icon, title, action }) => (
    <div className="flex items-center justify-between text-gold-500 uppercase text-xs font-bold tracking-wider mb-3">
        <div className="flex items-center space-x-2">
            {icon}
            <span>{title}</span>
        </div>
        {action}
    </div>
);