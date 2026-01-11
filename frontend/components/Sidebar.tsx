import React from 'react';
import { DetectionCategory } from '../types';
import { CATEGORY_STYLES } from '../constants';

interface SidebarProps {
  activeCategories: DetectionCategory[];
  toggleCategory: (cat: DetectionCategory) => void;
  counts: Record<DetectionCategory, number>;
}

const Sidebar: React.FC<SidebarProps> = ({ activeCategories, toggleCategory, counts }) => {
  return (
    <div className="space-y-6">
      {/* Filters - Now at the top */}
      <div className="glass-panel p-5 rounded-xl border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-slate-300 font-semibold text-sm uppercase tracking-wide">Filter Feed</h3>
          <button 
             onClick={() => activeCategories.length < Object.keys(CATEGORY_STYLES).length ? Object.keys(CATEGORY_STYLES).forEach(c => !activeCategories.includes(c as any) && toggleCategory(c as any)) : null}
             className="text-[10px] text-cyan-500 hover:text-cyan-400 uppercase tracking-wider font-bold"
          >
            {activeCategories.length === Object.keys(CATEGORY_STYLES).length ? 'All Active' : 'Reset'}
          </button>
        </div>
        <div className="space-y-2">
          {Object.entries(CATEGORY_STYLES).map(([key, style]) => {
            const isActive = activeCategories.includes(key as DetectionCategory);
            return (
              <button
                key={key}
                onClick={() => toggleCategory(key as DetectionCategory)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs transition-all ${
                  isActive 
                    ? `bg-slate-800 text-slate-200 border-l-2 ${style.borderColor.replace('/50', '')}` 
                    : 'text-slate-500 hover:bg-slate-900'
                }`}
              >
                <span>{style.label}</span>
                <span className={`w-2 h-2 rounded-full ${isActive ? style.bgColor.replace('/10', '') : 'bg-slate-700'}`} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;