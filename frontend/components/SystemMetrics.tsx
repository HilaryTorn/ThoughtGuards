import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { DetectionCategory } from '../types';
import { CATEGORY_STYLES } from '../constants';

interface DashboardStats {
  totalAnalyzed: number;
  totalDetections: number;
  byCategory: Record<string, {
    count: number;
    detections: number;
    statistics: {
      mean: number;
      stddev: number;
      quantiles: { p5: number; p50: number; p95: number };
    };
  }>;
}

interface SystemMetricsProps {
  counts?: Record<DetectionCategory, number>;
  stats?: DashboardStats;
}

const SystemMetrics: React.FC<SystemMetricsProps> = ({ counts, stats }) => {
  // Use stats if provided, otherwise fall back to counts
  const categoryCounts: Record<DetectionCategory, number> = stats
    ? Object.keys(CATEGORY_STYLES).reduce((acc, cat) => {
        const categoryData = stats.byCategory[cat] || { detections: 0 };
        acc[cat as DetectionCategory] = categoryData.detections;
        return acc;
      }, {} as Record<DetectionCategory, number>)
    : (counts || {} as Record<DetectionCategory, number>);

  const totalAnalyzed = stats?.totalAnalyzed || 0;
  const totalDetections = stats?.totalDetections || 0;
  // Transform colors from Tailwind classes to Hex for Recharts
  const COLOR_MAP: Record<string, string> = {
    'text-blue-400': '#60a5fa',
    'text-red-400': '#f87171',
    'text-orange-400': '#fb923c',
    'text-purple-400': '#c084fc',
    'text-slate-400': '#94a3b8',
    'text-pink-400': '#e879f9',
  };

  const chartData = Object.keys(CATEGORY_STYLES).map((key) => {
    const categoryStyle = CATEGORY_STYLES[key as DetectionCategory];
    return {
      name: key.split(' ')[0], // Short name
      fullName: key,
      count: categoryCounts[key as DetectionCategory] || 0,
      color: COLOR_MAP[categoryStyle.color] || '#94a3b8'
    };
  });


  return (
    <div className="glass-panel p-6 rounded-xl border-slate-800 mb-8 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
      {/* Metrics Text */}
      <div className="flex justify-around items-center border-r border-slate-800/50 pr-8">
        <div className="text-center">
           <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">Total Analyzed</p>
           <p className="text-4xl font-bold text-slate-200">{totalAnalyzed}</p>
           <p className="text-xs text-slate-600 mt-1">Conversations</p>
        </div>
        <div className="h-16 w-px bg-slate-800"></div>
        <div className="text-center">
           <p className="text-red-400/80 text-xs font-semibold uppercase tracking-wider mb-2">Manipulations</p>
           <p className="text-4xl font-bold text-red-400">{totalDetections}</p>
           <p className="text-xs text-slate-600 mt-1">Detected Threats</p>
        </div>
      </div>

      {/* Mini Bar Chart */}
      <div className="h-24 w-full">
         <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2 text-center md:text-left">Breakdown by Category</p>
         <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
               <Tooltip 
                  cursor={{fill: 'rgba(255,255,255,0.05)'}}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9', fontSize: '12px' }}
                  itemStyle={{ color: '#f1f5f9' }}
               />
               <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                 {chartData.map((entry, index) => (
                   <Cell key={`cell-${index}`} fill={entry.color} />
                 ))}
               </Bar>
            </BarChart>
         </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SystemMetrics;