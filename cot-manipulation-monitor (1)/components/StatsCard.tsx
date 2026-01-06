import React from 'react';
import { LucideIcon, Target, VenetianMask, Gift, Bomb, CloudFog, Tent } from 'lucide-react';
import { CategoryStyle } from '../types';

interface StatsCardProps {
  style: CategoryStyle;
  count: number;
}

const Icons: Record<string, LucideIcon> = {
  Target,
  VenetianMask,
  Gift,
  Bomb,
  CloudFog,
  Tent
};

const StatsCard: React.FC<StatsCardProps> = ({ style, count }) => {
  const IconComponent = Icons[style.icon];

  return (
    <div className={`glass-panel p-4 rounded-xl border-l-4 ${style.borderColor} flex items-center justify-between transition-transform hover:scale-105 duration-200`}>
      <div>
        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">{style.label}</p>
        <p className="text-2xl font-bold text-slate-100">{count}</p>
      </div>
      <div className={`p-3 rounded-lg ${style.bgColor}`}>
        {IconComponent && <IconComponent className={`w-6 h-6 ${style.color}`} />}
      </div>
    </div>
  );
};

export default StatsCard;
