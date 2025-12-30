import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { DetectionCategory, CategoryStyle } from '../types';
import { CATEGORY_STYLES } from '../constants';

interface SidebarProps {
  activeCategories: DetectionCategory[];
  toggleCategory: (cat: DetectionCategory) => void;
  counts: Record<DetectionCategory, number>;
}

// Transform colors from Tailwind classes to Hex for Recharts
const COLOR_MAP: Record<string, string> = {
  'text-blue-400': '#60a5fa',
  'text-red-400': '#f87171',
  'text-orange-400': '#fb923c',
  'text-purple-400': '#c084fc',
  'text-slate-400': '#94a3b8',
  'text-pink-400': '#e879f9',
};

// Generate mock timeline data for last 7 days with breakdown by category
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const timelineData = days.map(day => {
  const dataPoint: any = { day };
  Object.keys(CATEGORY_STYLES).forEach(cat => {
    // Generate random mock data for demonstration
    // In a real app, this would come from props or API
    dataPoint[cat] = Math.floor(Math.random() * 4); 
  });
  return dataPoint;
});

const Sidebar: React.FC<SidebarProps> = ({ activeCategories, toggleCategory, counts }) => {
  
  // Prepare data for Category Counts Bar Chart
  const barData = Object.keys(CATEGORY_STYLES).map((key) => ({
    name: key, // Full name for tooltip
    shortName: key.split(' ')[0], // Short name for Axis
    count: counts[key as DetectionCategory] || 0,
    color: COLOR_MAP[CATEGORY_STYLES[key as DetectionCategory].color]
  }));

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

      {/* Category Frequency Chart */}
      <div className="glass-panel p-5 rounded-xl border-slate-800">
        <h3 className="text-slate-300 font-semibold mb-4 text-sm uppercase tracking-wide">Manipulations by Type</h3>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 20 }}>
              <XAxis type="number" hide />
              <YAxis 
                dataKey="shortName" 
                type="category" 
                width={70} 
                tick={{fontSize: 10, fill: '#94a3b8'}} 
                axisLine={false}
                tickLine={false}
              />
              <Tooltip 
                cursor={{fill: 'rgba(255,255,255,0.05)'}}
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }}
                itemStyle={{ color: '#f1f5f9' }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {barData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Activity Timeline (7 Days) */}
      <div className="glass-panel p-5 rounded-xl border-slate-800">
        <h3 className="text-slate-300 font-semibold mb-4 text-sm uppercase tracking-wide">Total Errors (7 Days)</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis 
                dataKey="day" 
                tick={{fontSize: 10, fill: '#64748b'}} 
                axisLine={false} 
                tickLine={false} 
              />
              <YAxis 
                tick={{fontSize: 10, fill: '#64748b'}} 
                axisLine={false} 
                tickLine={false} 
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }}
                itemStyle={{ padding: 0 }}
              />
              <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
              {Object.keys(CATEGORY_STYLES).map((cat) => (
                <Bar 
                  key={cat}
                  dataKey={cat}
                  stackId="a"
                  fill={COLOR_MAP[CATEGORY_STYLES[cat as DetectionCategory].color]}
                  name={CATEGORY_STYLES[cat as DetectionCategory].label}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;